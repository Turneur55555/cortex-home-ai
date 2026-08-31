import { supabase } from "@/integrations/supabase/client";
import { buildConflictRecord, detectConflict } from "./conflictDetector";
import { entityKey, getOfflineDb } from "./db";
import { buildUpdatePayload, getSupabaseTableName } from "./repository";
import {
  enqueueOperation,
  getOperation,
  listPendingOperations,
  rebasePendingOperationsForRecord,
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

/**
 * Codes d'erreur Postgres qu'AUCUN retry ne peut jamais résoudre : le
 * payload/schéma est structurellement invalide (colonne inconnue, contrainte
 * NOT NULL/CHECK violée, syntaxe invalide, clé étrangère pointant vers une
 * ligne qui n'existe pas). Un vrai souci réseau/transitoire (fetch échoué,
 * timeout, 5xx) n'a PAS de `code` Postgres — il continue d'être retenté
 * normalement par le backoff du sync engine. Ceci ne change PAS le
 * comportement de retry (scope volontairement réduit, cf. brief) : ça sert
 * uniquement à faire ressortir en logs qu'un échec qui persiste après
 * plusieurs tentatives est probablement un bug de payload/schéma, pas un
 * problème réseau — exactement le signal qui manquait pour diagnostiquer le
 * bug prod "31 en échec" (cause réelle : cf. migration
 * 20260829130000_exercises_created_at.sql).
 */
const NON_RETRYABLE_PG_ERROR_CODES = new Set([
  "42703", // undefined_column
  "42P10", // invalid_column_reference (ON CONFLICT target)
  "23502", // not_null_violation
  "23503", // foreign_key_violation
  "23514", // check_violation
  "22P02", // invalid_text_representation
  "PGRST204", // PostgREST: colonne absente du schema cache
]);

/**
 * PostgREST/Supabase renvoie `{ message, code, details, hint }` sur toute
 * erreur (contrainte violée, colonne inconnue, réseau...). On capture tout
 * ça explicitement — jamais juste `err.message` — pour qu'une opération en
 * échec en prod soit diagnosticable sans avoir à reproduire (table,
 * opération, id, erreur exacte Supabase, code, nombre de retries).
 */
function describeSyncError(op: SyncOperation, supabaseTable: string, err: unknown): string {
  const pgError = err as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null;
  const message = pgError?.message ?? (err instanceof Error ? err.message : String(err));
  const parts = [message];
  if (pgError?.code) parts.push(`code=${pgError.code}`);
  if (pgError?.details) parts.push(`details=${pgError.details}`);
  if (pgError?.hint) parts.push(`hint=${pgError.hint}`);
  const summary = parts.join(" | ");
  const permanent = !!pgError?.code && NON_RETRYABLE_PG_ERROR_CODES.has(pgError.code);

  console.error(
    `[syncEngine] échec ${op.opType} sur ${supabaseTable} (table locale=${op.table}, id=${op.recordLocalId}, opId=${op.id}, retry #${op.retryCount + 1}${permanent ? ", PERMANENT — payload/schéma invalide, un retry ne résoudra rien" : ""}) : ${summary}`,
  );

  return summary;
}

/**
 * Réapplique en local la ligne renvoyée par le serveur après un `create` /
 * `update` réussi.
 *
 * Adaptation rendue nécessaire par le format d'opération `update` partiel
 * (repository.ts) : la réponse serveur d'une opération ne reflète QUE les
 * patchs déjà envoyés. S'il reste des opérations en attente pour ce même
 * enregistrement (deux modifications locales enchaînées avant la
 * synchronisation), écraser la donnée locale avec cette réponse ferait
 * temporairement « reculer » l'écran jusqu'au passage de l'opération
 * suivante. Dans ce cas on ne prend du serveur que `updated_at` (nécessaire
 * comme base de comparaison du conflict detector) et on garde la donnée
 * locale, qui reste la plus récente.
 *
 * L'entité est relue juste avant l'écriture : elle a pu être modifiée
 * localement pendant l'aller-retour réseau.
 */
async function applyServerRowToEntity(op: SyncOperation, serverRow: unknown): Promise<void> {
  const db = await getOfflineDb();
  const key = entityKey(op.table, op.recordLocalId);
  const current = (await db.get("entities", key)) as OfflineEntity | undefined;
  if (!current) return;

  const serverUpdatedAt = (serverRow as { updated_at?: string } | null)?.updated_at ?? null;
  // Les opérations encore en attente sur cet enregistrement doivent repartir
  // de l'état que le serveur vient d'atteindre, sinon la suivante déclenche
  // un faux conflit contre notre propre écriture.
  const remaining = await rebasePendingOperationsForRecord({
    table: op.table,
    recordLocalId: op.recordLocalId,
    baseUpdatedAt: serverUpdatedAt,
    excludeOperationId: op.id,
  });

  await db.put("entities", {
    ...current,
    data: remaining > 0 ? current.data : ((serverRow ?? current.data) as OfflineEntity["data"]),
    syncStatus: remaining > 0 ? current.syncStatus : "synced",
    serverUpdatedAt,
  } as OfflineEntity);
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
      await applyServerRowToEntity(op, data);
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
      await applyServerRowToEntity(op, data);
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
    const summary = describeSyncError(op, supabaseTable, err);
    await updateOperationStatus(op.id, {
      status: "failed",
      retryCount: op.retryCount + 1,
      lastError: summary,
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
  for (const queued of ops) {
    // Relecture de l'opération juste avant de l'envoyer : une opération
    // traitée plus tôt dans cette même boucle a pu la recaler
    // (`rebasePendingOperationsForRecord`), et la liste ci-dessus est un
    // instantané pris AVANT la boucle.
    const op = (await getOperation(queued.id)) ?? queued;
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
        // La version locale gagne, mais un `update` ne réécrit jamais les
        // colonnes du contrat (id/user_id/created_at/updated_at) : elles ne
        // font pas partie de l'arbitrage et `updated_at` reste au serveur.
        payload: buildUpdatePayload(conflict.localData),
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
