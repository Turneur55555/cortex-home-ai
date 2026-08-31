import { supabase } from "@/integrations/supabase/client";
import { buildConflictRecord, detectConflict } from "./conflictDetector";
import { entityKey, getOfflineDb } from "./db";
import { getSupabaseTableName } from "./repository";
import {
  claimOperation,
  enqueueOperation,
  hasOtherQueuedOperations,
  listPendingOperations,
  reclaimStaleSyncingOperations,
  removeOperation,
  updateOperationStatus,
} from "./syncQueue";
import {
  extractSyncError,
  formatSyncErrorSummary,
  isBlockingSyncError,
  type SyncErrorDetails,
} from "./syncErrors";
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
    // On conserve l'INTENTION locale (update ou delete) : c'est elle qui
    // sera rejouée si l'utilisateur choisit « garder ma version ».
    opType: op.opType,
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
 * Journalise l'échec avec TOUT le contexte (table, opération, id, erreur
 * exacte Supabase, code, nombre de retries) pour qu'un échec en prod soit
 * diagnosticable sans avoir à reproduire. L'extraction et la classification
 * de l'erreur vivent dans `syncErrors.ts` (logique pure, partagée avec le
 * panneau de synchronisation).
 */
function logSyncError(
  op: SyncOperation,
  supabaseTable: string,
  error: SyncErrorDetails,
  permanent: boolean,
): void {
  console.error(
    `[syncEngine] échec ${op.opType} sur ${supabaseTable} (table locale=${op.table}, id=${op.recordLocalId}, opId=${op.id}, retry #${op.retryCount + 1}${permanent ? ", PERMANENT — payload/schéma invalide, un retry ne résoudra rien : opération bloquée" : ""}) : ${formatSyncErrorSummary(error)}`,
  );
}

async function applyOperation(
  op: SyncOperation,
): Promise<"done" | "conflict" | "retry" | "blocked"> {
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
    // Erreur explicitement définitive (payload/schéma invalide) : la
    // retenter en boucle ne peut RIEN résoudre — on la fige en `blocked`,
    // visible et diagnosticable, plutôt que de marteler le réseau
    // indéfiniment. Une erreur réseau/temporaire (pas de code Postgres)
    // reste `failed` et repart normalement avec le backoff, tout comme une
    // dépendance (FK) qu'une autre opération de la file peut encore
    // satisfaire — cf. `isBlockingSyncError`.
    const error = extractSyncError(err);
    const permanent = isBlockingSyncError(error, {
      hasOtherQueuedOperations: await hasOtherQueuedOperations(op.userId, op.id),
    });
    logSyncError(op, supabaseTable, error, permanent);
    await updateOperationStatus(op.id, {
      status: permanent ? "blocked" : "failed",
      retryCount: op.retryCount + 1,
      lastError: formatSyncErrorSummary(error),
      lastErrorCode: error.code,
      lastAttemptAt: new Date().toISOString(),
    });
    return permanent ? "blocked" : "retry";
  }
}

export interface SyncResult {
  succeeded: number;
  conflicted: number;
  /** Échecs retryables (repartiront automatiquement après backoff). */
  retried: number;
  /** Opérations passées en échec définitif pendant ce passage. */
  blocked: number;
  /** Opérations laissées à une autre instance (déjà `syncing` ailleurs) ou plus disponibles. */
  skipped: number;
  /** Opérations orphelines (`syncing` abandonnées) remises en file au début du passage. */
  reclaimed: number;
}

/**
 * Traite la queue FIFO pour un utilisateur. Sûr à appeler plusieurs fois, en
 * parallèle comme à la suite, y compris depuis plusieurs onglets/instances :
 *
 * 1. les opérations restées en `syncing` alors que l'instance qui les avait
 *    prises en charge a disparu (fermeture brutale, reload, suspension PWA)
 *    sont d'abord REPRISES (`pending`) — plus aucune opération ne peut
 *    rester bloquée en `syncing` indéfiniment (CRIT-01) ;
 * 2. chaque opération est ensuite prise de façon atomique
 *    (`claimOperation`) : si une autre instance l'a déjà en cours, celle-ci
 *    est simplement laissée de côté (comptée dans `skipped`), jamais
 *    envoyée deux fois ;
 * 3. l'ordre FIFO (`createdAt`) et l'idempotence (upsert par id client)
 *    restent inchangés.
 */
export async function processSyncQueue(
  userId: string,
  options: { respectBackoff?: boolean } = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    succeeded: 0,
    conflicted: 0,
    retried: 0,
    blocked: 0,
    skipped: 0,
    reclaimed: 0,
  };

  result.reclaimed = await reclaimStaleSyncingOperations(userId);

  const ops = await listPendingOperations(userId);
  for (const op of ops) {
    // `respectBackoff` est utilisé par le balayage périodique automatique —
    // les déclencheurs ponctuels (retour réseau, bouton "Réessayer") doivent
    // retenter immédiatement.
    if (options.respectBackoff && !isDueForRetry(op)) continue;

    // Prise de possession atomique : une seule instance peut envoyer cette
    // opération. `claimOperation` renvoie l'état persisté (avec le
    // `lastAttemptAt` qui sert ensuite à détecter une orpheline).
    const claimed = await claimOperation(op.id);
    if (!claimed) {
      result.skipped += 1;
      continue;
    }

    const outcome = await applyOperation(claimed);
    if (outcome === "done") {
      await removeOperation(claimed.id);
      result.succeeded += 1;
    } else if (outcome === "conflict") {
      result.conflicted += 1;
    } else if (outcome === "blocked") {
      result.blocked += 1;
    } else {
      result.retried += 1;
    }
  }
  return result;
}

/**
 * Résolution explicite d'un conflit par l'utilisateur — jamais automatique.
 * - "keep-local" : la version locale doit gagner → ré-enfile une opération
 *   du MÊME type que celle qui a provoqué le conflit (`update` ou
 *   `delete`), SANS `baseUpdatedAt` (on force l'écriture, le conflit vient
 *   d'être arbitré) et remet l'entité en `pending` pour qu'elle reparte dans
 *   la queue normale. Un conflit né d'un `delete` reste donc un `delete` :
 *   la ligne n'est JAMAIS ressuscitée par une conversion en `update`
 *   (audit MAJ-05).
 * - "keep-server" : la version serveur doit gagner → applique directement
 *   `serverData` en local, entité `synced`, rien à ré-envoyer (y compris
 *   pour un conflit de suppression : la ligne serveur existe toujours, elle
 *   est donc restaurée localement — comportement inchangé).
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
    // Conflit persisté avant l'ajout de `opType` (cf. types.ts) : à l'époque
    // seul un `update` pouvait être rejoué — on garde cette lecture.
    const opType = conflict.opType ?? "update";
    if (entity) {
      await db.put("entities", {
        ...entity,
        syncStatus: "pending",
        // Un conflit de suppression garde son tombstone local : la donnée
        // reste masquée dans l'UI, exactement comme l'utilisateur l'a
        // demandé, jusqu'à confirmation serveur.
        deleted: opType === "delete" ? true : entity.deleted,
      } as OfflineEntity);
      await enqueueOperation({
        userId: conflict.userId,
        table: conflict.table,
        recordLocalId: conflict.recordLocalId,
        opType,
        // Un `delete` n'a pas de payload — le réenfiler avec `localData`
        // ferait exactement ce qu'on veut éviter (une écriture).
        payload: opType === "delete" ? null : conflict.localData,
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

/**
 * Action utilisateur explicite sur une opération bloquée : « Réessayer
 * quand même ». La remet en file (`pending`) — utile quand la cause a
 * disparu entre-temps (application mise à jour, ligne parente recréée,
 * droits corrigés). Le compteur de tentatives et l'erreur précédente sont
 * conservés : on ne réécrit pas l'historique de diagnostic.
 */
export async function retryBlockedOperation(operationId: string): Promise<void> {
  const db = await getOfflineDb();
  const op = await db.get("syncQueue", operationId);
  if (!op || op.status !== "blocked") return;
  await updateOperationStatus(operationId, { status: "pending" });
}

/**
 * Action utilisateur explicite : sortir de la file une opération
 * définitivement bloquée (elle ne partira jamais telle quelle).
 *
 * Garde-fou important : SEULE l'opération de synchronisation est retirée —
 * la donnée métier locale n'est jamais supprimée. Elle reste visible dans
 * l'app et son entité est marquée `failed` (« modification locale jamais
 * confirmée par le serveur »), ce qui empêche aussi une hydratation
 * ultérieure de l'écraser silencieusement (cf. `hydrateEntitiesFromServer`).
 * Une opération non bloquée n'est jamais retirée par cette voie : elle a
 * encore toutes ses chances de partir seule.
 */
export async function discardBlockedOperation(operationId: string): Promise<void> {
  const db = await getOfflineDb();
  const op = await db.get("syncQueue", operationId);
  if (!op || op.status !== "blocked") return;

  const key = entityKey(op.table, op.recordLocalId);
  const entity = (await db.get("entities", key)) as OfflineEntity | undefined;
  if (entity) {
    await db.put("entities", { ...entity, syncStatus: "failed" } as OfflineEntity);
  }
  await removeOperation(operationId);
}

export async function listConflicts(userId: string): Promise<ConflictRecord[]> {
  const db = await getOfflineDb();
  return db.getAllFromIndex("conflicts", "by-user", IDBKeyRange.only(userId));
}
