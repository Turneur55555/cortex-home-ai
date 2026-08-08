import { supabase } from "@/integrations/supabase/client";
import { buildConflictRecord, detectConflict } from "./conflictDetector";
import { entityKey, getOfflineDb } from "./db";
import { getSupabaseTableName } from "./repository";
import {
  enqueueOperation,
  listPendingOperations,
  removeOperation,
  updateOperationStatus,
} from "./syncQueue";
import type {
  ConflictRecord,
  ConflictResolutionStrategy,
  OfflineEntity,
  SyncOperation,
} from "./types";

/**
 * Sync engine : reprend la queue dans l'ordre FIFO au retour réseau, envoie
 * chaque opération à Supabase, et ne perd jamais silencieusement une
 * opération — succès retire l'opération de la queue, échec réseau la garde
 * (retry avec backoff simple), conflit détecté la retire de la queue mais
 * l'archive dans `conflicts` pour résolution utilisateur explicite.
 *
 * Le client Supabase (`@/integrations/supabase/client`) est utilisé ici —
 * seul point de l'infra offline qui parle réseau, par design (repository.ts
 * reste 100% local).
 */

// Backoff exponentiel simple, plafonné — évite de marteler le réseau après
// plusieurs échecs consécutifs sans bloquer indéfiniment un retry manuel.
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 30_000;

function isDueForRetry(op: SyncOperation): boolean {
  if (op.status !== "failed") return true;
  if (!op.lastAttemptAt) return true;
  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** op.retryCount, BACKOFF_MAX_MS);
  return Date.now() - new Date(op.lastAttemptAt).getTime() >= backoff;
}

async function fetchServerRow(
  supabaseTable: string,
  id: string,
): Promise<{ id: string; updated_at?: string } | null> {
  const { data, error } = await (supabase as any)
    .from(supabaseTable)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function markConflict<T>(params: {
  op: SyncOperation<T>;
  entity: OfflineEntity<T>;
  serverRow: { id: string; updated_at?: string };
}): Promise<void> {
  const { op, entity, serverRow } = params;
  const db = await getOfflineDb();
  const conflict: ConflictRecord<T> = buildConflictRecord({
    userId: op.userId,
    table: op.table,
    recordLocalId: op.recordLocalId,
    localData: entity.data,
    serverData: serverRow as unknown as T,
    localUpdatedAt: entity.localUpdatedAt,
    serverUpdatedAt: serverRow.updated_at ?? "",
  });
  await db.put("conflicts", conflict as ConflictRecord);
  await db.put("entities", { ...entity, syncStatus: "conflict" } as OfflineEntity);
  await removeOperation(op.id);
}

async function applyOperation(op: SyncOperation): Promise<"done" | "conflict" | "retry"> {
  const supabaseTable = getSupabaseTableName(op.table);
  const db = await getOfflineDb();
  const key = entityKey(op.table, op.recordLocalId);
  const entity = (await db.get("entities", key)) as OfflineEntity | undefined;

  try {
    if (op.opType === "create") {
      const { data, error } = await (supabase as any)
        .from(supabaseTable)
        .upsert(op.payload, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      if (entity) {
        await db.put("entities", {
          ...entity,
          data,
          syncStatus: "synced",
          serverUpdatedAt: data?.updated_at ?? null,
        } as OfflineEntity);
      }
      return "done";
    }

    if (op.opType === "update") {
      if (op.baseUpdatedAt !== null) {
        const serverRow = await fetchServerRow(supabaseTable, op.recordLocalId);
        if (serverRow && entity) {
          const conflict = detectConflict({
            entity,
            baseUpdatedAt: op.baseUpdatedAt,
            serverUpdatedAt: serverRow.updated_at ?? "",
            serverData: serverRow,
          });
          if (conflict) {
            await markConflict({ op, entity, serverRow });
            return "conflict";
          }
        }
      }
      const { data, error } = await (supabase as any)
        .from(supabaseTable)
        .update(op.payload)
        .eq("id", op.recordLocalId)
        .select()
        .single();
      if (error) throw error;
      if (entity) {
        await db.put("entities", {
          ...entity,
          data,
          syncStatus: "synced",
          serverUpdatedAt: data?.updated_at ?? null,
        } as OfflineEntity);
      }
      return "done";
    }

    // delete
    if (op.baseUpdatedAt !== null) {
      const serverRow = await fetchServerRow(supabaseTable, op.recordLocalId);
      if (serverRow && entity) {
        const conflict = detectConflict({
          entity,
          baseUpdatedAt: op.baseUpdatedAt,
          serverUpdatedAt: serverRow.updated_at ?? "",
          serverData: serverRow,
        });
        if (conflict) {
          await markConflict({ op, entity, serverRow });
          return "conflict";
        }
      }
      if (!serverRow) {
        // Déjà supprimée côté serveur (ex: retry après coupure juste après
        // succès) — idempotent, on continue le nettoyage local.
        if (entity) await db.delete("entities", key);
        return "done";
      }
    }
    const { error } = await (supabase as any)
      .from(supabaseTable)
      .delete()
      .eq("id", op.recordLocalId);
    if (error) throw error;
    if (entity) await db.delete("entities", key);
    return "done";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateOperationStatus(op.id, {
      status: "failed",
      retryCount: op.retryCount + 1,
      lastError: message,
      lastAttemptAt: new Date().toISOString(),
    });
    return "retry";
  }
}

export interface SyncResult {
  succeeded: number;
  conflicted: number;
  retried: number;
}

/**
 * Traite la queue FIFO pour un utilisateur. Sûr à appeler plusieurs fois en
 * parallèle/à la suite (idempotent) — une opération déjà `done` a été
 * retirée de la queue, une opération `syncing` interrompue redevient
 * `pending`/`failed` au prochain appel (pas d'état bloquant permanent).
 */
export async function processSyncQueue(
  userId: string,
  options: { respectBackoff?: boolean } = {},
): Promise<SyncResult> {
  const result: SyncResult = { succeeded: 0, conflicted: 0, retried: 0 };
  const ops = await listPendingOperations(userId);
  for (const op of ops) {
    // `respectBackoff` sert un futur scheduler périodique automatique — les
    // déclencheurs actuels (retour réseau, bouton "Réessayer") sont des
    // événements ponctuels et doivent retenter immédiatement.
    if (options.respectBackoff && !isDueForRetry(op)) continue;
    await updateOperationStatus(op.id, { status: "syncing" });
    const outcome = await applyOperation(op);
    if (outcome === "done") {
      await removeOperation(op.id);
      result.succeeded += 1;
    } else if (outcome === "conflict") {
      result.conflicted += 1;
    } else {
      result.retried += 1;
    }
  }
  return result;
}

/**
 * Résolution explicite d'un conflit par l'utilisateur — jamais automatique.
 * - "keep-local" : la version locale doit gagner → ré-enfile une opération
 *   `update` (payload = version locale) SANS `baseUpdatedAt` (on force
 *   l'écriture, le conflit vient d'être arbitré) et remet l'entité en
 *   `pending` pour qu'elle reparte dans la queue normale.
 * - "keep-server" : la version serveur doit gagner → applique directement
 *   `serverData` en local, entité `synced`, rien à ré-envoyer.
 *
 * Point d'extension (voir `types.ts`) : une future fusion champ par champ
 * ajoutera un troisième cas `"merge"` ici, sans changer la signature.
 */
export async function resolveConflict(
  conflictId: string,
  strategy: ConflictResolutionStrategy,
): Promise<void> {
  const db = await getOfflineDb();
  const conflict = await db.get("conflicts", conflictId);
  if (!conflict) return;
  const key = entityKey(conflict.table, conflict.recordLocalId);
  const entity = (await db.get("entities", key)) as OfflineEntity | undefined;

  if (strategy === "keep-local") {
    if (entity) {
      await db.put("entities", { ...entity, syncStatus: "pending" } as OfflineEntity);
      await enqueueOperation({
        userId: conflict.userId,
        table: conflict.table,
        recordLocalId: conflict.recordLocalId,
        opType: "update",
        payload: conflict.localData,
        baseUpdatedAt: null, // conflit déjà arbitré par l'utilisateur : pas de nouvelle détection
      });
    }
  } else {
    const serverData = conflict.serverData as { updated_at?: string };
    if (entity) {
      await db.put("entities", {
        ...entity,
        data: conflict.serverData,
        syncStatus: "synced",
        serverUpdatedAt: serverData.updated_at ?? null,
        deleted: false,
      } as OfflineEntity);
    }
  }

  await db.delete("conflicts", conflictId);
}

export async function listConflicts(userId: string): Promise<ConflictRecord[]> {
  const db = await getOfflineDb();
  return db.getAllFromIndex("conflicts", "by-user", IDBKeyRange.only(userId));
}
