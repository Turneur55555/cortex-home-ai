import { supabase } from "@/integrations/supabase/client";
import { buildConflictRecord, detectConflict } from "./conflictDetector";
import { entityKey, getOfflineDb } from "./db";
import { buildUpdatePayload, getSupabaseTableName } from "./repository";
import {
  claimOperation,
  enqueueOperation,
  findAwaitedCreateForRecord,
  hasLiveDependencies,
  hasOtherQueuedOperations,
  listPendingOperations,
  rebasePendingOperationsForRecord,
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
import { serverRewritesRowAfterReturning } from "./serverRewrittenRows";
import type {
  ConflictReason,
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

/**
 * PLAFOND DE TENTATIVES AUTOMATIQUES (MIN-17, audit du 02/09/2026).
 *
 * Avant : `retryCount` n'était borné par RIEN. Une erreur sans code Postgres
 * (réseau, timeout, 5xx, ou n'importe quel code inconnu de
 * `NON_RETRYABLE_PG_ERROR_CODES`) laissait l'opération en `failed`, donc
 * retentée à chaque passage du moteur, indéfiniment — le backoff plafonne le
 * RYTHME (30 s) mais n'arrête jamais la boucle, et seul un passage en
 * `blocked` (jamais atteint pour ces erreurs) en sort.
 *
 * Maintenant : au bout de `MAX_RETRY_ATTEMPTS` tentatives, l'opération passe
 * dans l'état de blocage DÉJÀ existant du moteur (`blocked`) — plus aucun
 * retry automatique, mais elle reste dans la file, VISIBLE dans le panneau de
 * synchronisation avec son erreur réelle, et l'utilisateur garde les deux
 * actions existantes : « Réessayer quand même » (`retryBlockedOperation`, qui
 * rend un budget de tentatives neuf) et « Retirer de la file »
 * (`discardBlockedOperation`, qui ne touche JAMAIS à la donnée locale).
 *
 * Choix de la valeur (10), à partir du backoff réel : 2 + 4 + 8 + 16 + 30 × 6
 * ≈ 3,5 minutes d'insistance avant abandon automatique. Assez pour absorber
 * une coupure réseau ordinaire (tunnel, ascenseur, bascule wifi/4G) sans
 * jamais transformer une panne durable en boucle éternelle. Les retries
 * NORMAUX sont donc intacts : aucune opération qui réussissait avant ne
 * bloque désormais.
 */
export const MAX_RETRY_ATTEMPTS = 10;

function isDueForRetry(op: SyncOperation): boolean {
  if (op.status !== "failed") return true;
  if (!op.lastAttemptAt) return true;
  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** op.retryCount, BACKOFF_MAX_MS);
  return Date.now() - new Date(op.lastAttemptAt).getTime() >= backoff;
}

/**
 * Délai au-delà duquel un aller-retour Supabase est considéré SANS RÉPONSE.
 *
 * Pourquoi c'est indispensable (bug prod du 01/09/2026, file « Modification ·
 * Exercises » qui s'accumule) : `@supabase/supabase-js` ne pose AUCUN
 * `AbortSignal` ni timeout sur ses requêtes, et chaque appel PostgREST
 * commence par un `await auth.getSession()` (cf. `SupabaseClient
 * ._getAccessToken`) AVANT même le fetch HTTP. Sur une socket morte — cas
 * normal en réseau mobile, où `navigator.onLine` reste `true` — la promesse
 * ne se règle jamais : ni résultat, ni erreur. `applyOperation` reste alors
 * suspendu, `processSyncQueue` ne rend plus la main, et le verrou de
 * ré-entrance de `useOfflineSync` n'est jamais relâché : plus AUCUNE
 * opération ne part jusqu'au rechargement de l'app, et tout ce que
 * l'utilisateur fait ensuite s'empile en `pending`.
 *
 * Choix du seuil (15 s), à partir du fonctionnement réel du moteur :
 * - nettement SOUS `STALE_SYNCING_MS` (60 s, cf. `syncQueue.ts`) : une
 *   opération sans réponse redevient `failed` (donc reprise par le backoff
 *   normal) bien avant que le mécanisme d'orphelines n'ait à s'en mêler —
 *   les deux filets ne se marchent jamais dessus ;
 * - nettement AU-DESSUS d'un aller-retour PostgREST réel, même sur un réseau
 *   mobile très dégradé : on ne coupe jamais une requête qui allait aboutir.
 * Un dépassement n'annule PAS la requête (pas d'`AbortSignal` : il ne
 * couvrirait que le fetch, pas l'attente d'`auth.getSession()` qui la
 * précède) — on cesse seulement de l'attendre. C'est sans risque : toutes
 * les opérations sont idempotentes (upsert par `id` client, delete
 * idempotent), exactement la garantie qui permet déjà de reprendre une
 * opération orpheline.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Forme d'une réponse PostgREST, telle que consommée par ce moteur. */
interface SupabaseResult {
  data: unknown;
  error: unknown;
}

/**
 * Borne un aller-retour Supabase. Un dépassement lève une erreur ORDINAIRE
 * (sans code Postgres) : elle suit donc exactement le chemin d'erreur déjà
 * en place — `isBlockingSyncError` renvoie `false`, l'opération passe en
 * `failed` avec son message visible dans le panneau, et repart toute seule
 * après le backoff. Aucune nouvelle branche dans la machine à états.
 */
async function withTimeout<T>(request: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Le serveur n'a pas répondu (${label}, ${Math.round(REQUEST_TIMEOUT_MS / 1000)} s) — nouvelle tentative automatique.`,
              ),
            ),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchServerRow(
  supabaseTable: string,
  id: string,
): Promise<{ id: string; updated_at?: string } | null> {
  const { data, error } = await withTimeout<SupabaseResult>(
    (supabase as any).from(supabaseTable).select("*").eq("id", id).maybeSingle(),
    `lecture ${supabaseTable}`,
  );
  if (error) throw error;
  return (data as { id: string; updated_at?: string } | null) ?? null;
}

/**
 * CHANTIER 3 — MAJ-02. Renvoie la ligne réellement PERSISTÉE côté serveur
 * après une mutation réussie, quand le `RETURNING` de cette mutation ne peut
 * pas être la vérité.
 *
 * Pour toute table ordinaire, la réponse `.select().single()` EST la vérité et
 * cette fonction la renvoie telle quelle — aucun aller-retour supplémentaire,
 * comportement strictement inchangé. Pour les tables déclarées dans
 * `serverRewrittenRows.ts` (aujourd'hui `workouts`), un trigger AFTER réécrit
 * la ligne APRÈS que le `RETURNING` a été calculé : la valeur reçue est déjà
 * périmée à l'arrivée, et la mémoriser comme `serverUpdatedAt` fabrique un
 * faux conflit `updated_at_mismatch` à la modification locale suivante. On
 * relit donc la ligne.
 *
 * TOLÉRANCE AUX PANNES : l'opération a DÉJÀ réussi côté serveur quand cette
 * relecture a lieu. Un échec de relecture (réseau coupé juste après, timeout)
 * ne doit donc jamais transformer un succès en échec — on retombe sur la
 * réponse du `RETURNING`, c'est-à-dire exactement le comportement d'avant ce
 * correctif. Une ligne introuvable (supprimée dans l'intervalle par un autre
 * appareil) suit la même règle : rien de mieux à mémoriser que ce que le
 * serveur vient de nous renvoyer.
 */
async function readAuthoritativeRow(
  op: SyncOperation,
  supabaseTable: string,
  returnedRow: unknown,
): Promise<unknown> {
  if (!serverRewritesRowAfterReturning(op.table)) return returnedRow;
  try {
    const fresh = await fetchServerRow(supabaseTable, op.recordLocalId);
    return fresh ?? returnedRow;
  } catch (err) {
    console.error(
      `[syncEngine] relecture post-écriture impossible sur ${supabaseTable} (id=${op.recordLocalId}) — on conserve la réponse RETURNING (MAJ-02) :`,
      err,
    );
    return returnedRow;
  }
}

async function markConflict<T>(params: {
  op: SyncOperation<T>;
  entity: OfflineEntity<T>;
  /**
   * `null` uniquement pour `reason: "server_row_deleted"` — il n'existe
   * littéralement aucune ligne serveur à archiver dans le conflit.
   */
  serverRow: { id: string; updated_at?: string } | null;
  reason: ConflictReason;
}): Promise<void> {
  const { op, entity, serverRow, reason } = params;
  const db = await getOfflineDb();
  const conflict: ConflictRecord<T> = buildConflictRecord({
    userId: op.userId,
    table: op.table,
    recordLocalId: op.recordLocalId,
    // On conserve l'INTENTION locale (update ou delete) : c'est elle qui
    // sera rejouée si l'utilisateur choisit « garder ma version ».
    opType: op.opType,
    reason,
    sourceCreatedAt: op.createdAt,
    // Chantier 1 bis : les dépendances font partie de l'intention locale, au
    // même titre que `opType` — « garder ma version » doit les rejouer telles
    // quelles.
    dependsOnRecords: op.dependsOnRecords,
    localData: entity.data,
    serverData: serverRow ? (serverRow as unknown as T) : null,
    localUpdatedAt: entity.localUpdatedAt,
    serverUpdatedAt: serverRow?.updated_at ?? null,
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

async function applyOperation(
  op: SyncOperation,
): Promise<"done" | "conflict" | "retry" | "blocked"> {
  const supabaseTable = getSupabaseTableName(op.table);
  const db = await getOfflineDb();
  const key = entityKey(op.table, op.recordLocalId);
  const entity = (await db.get("entities", key)) as OfflineEntity | undefined;

  try {
    if (op.opType === "create") {
      const { data, error } = await withTimeout<SupabaseResult>(
        (supabase as any)
          .from(supabaseTable)
          .upsert(op.payload, { onConflict: "id" })
          .select()
          .single(),
        `création ${supabaseTable}`,
      );
      if (error) throw error;
      await applyServerRowToEntity(op, await readAuthoritativeRow(op, supabaseTable, data));
      return "done";
    }

    if (op.opType === "update") {
      // GARDE PGRST116 (correctif du 02/09/2026, cf. audit du 01/09/2026) —
      // on vérifie TOUJOURS que la ligne existe encore côté serveur avant
      // d'émettre l'UPDATE, que `baseUpdatedAt` soit connu ou non.
      //
      // AVANT : cette lecture n'avait lieu QUE si `baseUpdatedAt !== null`,
      // et même alors, une ligne absente (`serverRow === null`) n'était pas
      // du tout traitée — le code retombait directement sur l'appel
      // `.update(...).select().single()`, qui échoue en `PGRST116` (« 0 rows
      // returned »). Cette erreur n'a pas de code Postgres classé définitif
      // (`isBlockingSyncError` renvoie `false` pour `PGRST116`), donc
      // l'opération restait `failed` indéfiniment : `retryCount` n'est
      // jamais plafonné, seul un passage en `blocked` (jamais atteint ici)
      // sort de la boucle de retry — d'où la boucle infinie observée en prod.
      //
      // MAINTENANT : une ligne disparue devient un CONFLIT EXPLICITE
      // (`reason: "server_row_deleted"`), jamais un échec `failed` retenté
      // en boucle, et jamais un écrasement silencieux façon `delete`
      // idempotent — une modification locale peut porter des données que
      // l'utilisateur veut conserver ; c'est à lui d'arbitrer (panneau de
      // synchronisation, `SyncQueueSheet`). L'opération est retirée de
      // `syncQueue` (comme tout conflit) mais RIEN n'est perdu : elle est
      // archivée dans `conflicts` jusqu'à résolution explicite
      // (`resolveConflict`), et la barrière de dépendance du chantier 1 bis
      // (`hasLiveDependencies`) traite désormais un conflit non résolu comme
      // une dépendance toujours vivante (cf. `syncQueue.ts`) — aucun
      // changement à la machine à états générale du chantier 1 (`pending` /
      // `syncing` / `failed` / `blocked` conservent exactement leur sens).
      const serverRow = await fetchServerRow(supabaseTable, op.recordLocalId);
      if (!serverRow) {
        // DISTINCTION IMPORTANTE (audit du 02/09/2026, régression trouvée en
        // testant DISC-01 — `sessionRewardOffline.test.ts`) : une ligne
        // absente ne signifie pas toujours « supprimée » — pour un
        // enregistrement dont le `create` est enfilé SÉPARÉMENT
        // (`neverMergeIntoPendingCreate`, chantier 4/DISC-01) et n'a pas
        // ENCORE réussi (FIFO en cours, ou ce `create` a lui-même échoué
        // PENDANT ce même passage), la ligne n'existe pas ENCORE — ce n'est
        // pas une suppression, juste une course normale de la file. La
        // traiter comme un conflit retirerait à tort cette opération de
        // `syncQueue`, cassant le garde-fou de `applyServerRowToEntity`
        // (« ne réécrit l'entité que s'il ne reste AUCUNE opération en
        // attente ») dès que le `create` finit par réussir — l'écran
        // repasserait alors brièvement la séance en `active`.
        // MAJ-01 (02/09/2026) : on ne cherche QUE les `create` encore VIVANTS
        // (`pending` / `failed` / `syncing`). Un `create` `blocked` ne
        // repartira JAMAIS tout seul : la ligne n'apparaîtra pas côté serveur,
        // et faire attendre l'UPDATE dessus, c'est exactement la boucle de
        // retry infinie qu'on corrige — l'UPDATE échouerait en PGRST116 à
        // chaque passage, sans fin. On traite donc ce cas comme ce qu'il est :
        // un conflit explicite à arbitrer (`server_row_deleted`), ce qui
        // préserve intégralement la modification locale.
        const stillAwaitingCreate = Boolean(
          await findAwaitedCreateForRecord(op.table, op.recordLocalId),
        );
        if (!stillAwaitingCreate) {
          if (entity) {
            await markConflict({ op, entity, serverRow: null, reason: "server_row_deleted" });
            return "conflict";
          }
          // Aucune entité locale à préserver (déjà effacée localement par
          // ailleurs) : il n'y a rien à arbitrer, l'opération n'a plus
          // d'objet. `processSyncQueue` retire l'opération de la file pour
          // tout retour "done" — inutile de le faire ici aussi (cf.
          // `create`/`delete` réussis juste au-dessus/en dessous, qui
          // suivent le même principe).
          return "done";
        }
        // Le `create` de cet enregistrement est encore vivant dans la file :
        // on laisse l'UPDATE échouer normalement (comportement inchangé
        // depuis avant ce correctif) — il repart avec son backoff, sans
        // jamais rester bloqué : dès que le `create` aboutit, cette même
        // opération aboutit à son tour au passage suivant (ou au même
        // passage si le `create` réussit avant qu'elle ne soit atteinte).
      } else if (op.baseUpdatedAt !== null && entity) {
        const conflict = detectConflict({
          entity,
          baseUpdatedAt: op.baseUpdatedAt,
          serverUpdatedAt: serverRow.updated_at ?? "",
          serverData: serverRow,
        });
        if (conflict) {
          await markConflict({ op, entity, serverRow, reason: "updated_at_mismatch" });
          return "conflict";
        }
      }
      const { data, error } = await withTimeout<SupabaseResult>(
        (supabase as any)
          .from(supabaseTable)
          .update(op.payload)
          .eq("id", op.recordLocalId)
          .select()
          .single(),
        `modification ${supabaseTable}`,
      );
      if (error) throw error;
      await applyServerRowToEntity(op, await readAuthoritativeRow(op, supabaseTable, data));
      return "done";
    }

    // delete — comportement INCHANGÉ (cf. audit du 02/09/2026, Phase 1) :
    // une ligne déjà absente reste un succès idempotent, jamais un conflit —
    // l'intention locale (« je veux que cette ligne n'existe plus ») est de
    // toute façon satisfaite.
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
          await markConflict({ op, entity, serverRow, reason: "updated_at_mismatch" });
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
    const { error } = await withTimeout<SupabaseResult>(
      (supabase as any).from(supabaseTable).delete().eq("id", op.recordLocalId),
      `suppression ${supabaseTable}`,
    );
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
    const retryCount = op.retryCount + 1;
    const permanent = isBlockingSyncError(error, {
      hasOtherQueuedOperations: await hasOtherQueuedOperations(op.userId, op.id),
    });
    // MIN-17 : même une erreur classée « temporaire » finit par épuiser son
    // budget de tentatives. On garde l'erreur RÉELLE en tête de `lastError`
    // (c'est elle que lit l'utilisateur, cf. `describeSyncFailure`) et on
    // ajoute le compteur en partie technique — jamais un message générique
    // qui masquerait la cause.
    const exhausted = !permanent && retryCount >= MAX_RETRY_ATTEMPTS;
    const summary = exhausted
      ? `${formatSyncErrorSummary(error)} | tentatives=${retryCount}/${MAX_RETRY_ATTEMPTS}`
      : formatSyncErrorSummary(error);
    logSyncError(op, supabaseTable, error, permanent || exhausted);
    await updateOperationStatus(op.id, {
      status: permanent || exhausted ? "blocked" : "failed",
      retryCount,
      lastError: summary,
      lastErrorCode: error.code,
      lastAttemptAt: new Date().toISOString(),
    });
    return permanent || exhausted ? "blocked" : "retry";
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
    //
    // La liste ci-dessus est un instantané pris AVANT la boucle : une
    // opération traitée plus tôt dans ce même passage a pu recaler celle-ci
    // (`rebasePendingOperationsForRecord`). C'est `claimOperation` qui règle
    // le problème — il relit l'opération en base de façon atomique et
    // renvoie l'état PERSISTÉ, `baseUpdatedAt` recalé compris.
    if (options.respectBackoff && !isDueForRetry(op)) continue;

    // PLAFOND DE TENTATIVES (MIN-17) — second point de contrôle, ici parce
    // que `retryCount` n'augmente pas QUE dans le `catch` d'`applyOperation` :
    // `reclaimStaleSyncingOperations` le fait aussi à chaque reprise
    // d'orpheline. Une opération qui aurait épuisé son budget par ce chemin
    // (ou une opération persistée avant l'introduction du plafond) est figée
    // ici, avant tout envoi, dans l'état de blocage déjà existant — jamais
    // supprimée, toujours visible avec son erreur dans le panneau, et
    // débloquable par « Réessayer quand même ».
    if (op.retryCount >= MAX_RETRY_ATTEMPTS) {
      await updateOperationStatus(op.id, {
        status: "blocked",
        lastError:
          op.lastError ??
          `Trop de tentatives infructueuses (${op.retryCount}/${MAX_RETRY_ATTEMPTS}).`,
      });
      result.blocked += 1;
      continue;
    }

    // BARRIÈRE DE DÉPENDANCE (chantier 1 bis, DISC-01b) — OPT-IN, jamais
    // globale. Une opération qui déclare des `dependsOnRecords` n'est pas
    // envoyée tant que l'un de ces ENREGISTREMENTS porte encore une
    // opération vivante antérieure (pending / failed / syncing / blocked).
    // Elle est alors laissée intacte dans la file (comptée dans `skipped`,
    // comme toute opération qu'on n'a pas envoyée) et retentée au passage
    // suivant, sans consommer de tentative ni avancer son backoff.
    //
    // La portée est celle des enregistrements DÉCLARÉS, et rien d'autre :
    // une écriture Nutrition, Recette ou Liste de courses sans rapport ne
    // retient jamais l'opération protégée. Et ce test ne concerne QUE les
    // opérations qui déclarent des dépendances : la file n'est PAS un
    // stop-on-error — une opération indépendante placée après une opération
    // en échec continue de partir normalement (garanti par
    // `fitnessCoreOffline.test.ts`, inchangé).
    //
    // Il est volontairement placé AVANT `claimOperation` : inutile de
    // prendre possession d'une opération qu'on ne va pas envoyer (le claim
    // la passerait en `syncing` et fausserait la détection d'orpheline).
    // Il ne REMPLACE pas le claim pour autant : deux instances peuvent très
    // bien franchir la barrière en même temps, c'est toujours le claim
    // atomique qui garantit un seul envoi.
    if (await hasLiveDependencies(userId, op)) {
      result.skipped += 1;
      continue;
    }

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
 *   pour un conflit `updated_at_mismatch` né d'un `delete` : la ligne
 *   serveur existe toujours, elle est donc restaurée localement —
 *   comportement inchangé).
 *   Cas particulier `reason: "server_row_deleted"` (correctif PGRST116,
 *   02/09/2026) : il n'existe AUCUNE version serveur (`serverData === null`)
 *   — « garder la version serveur » signifie alors accepter qu'elle n'existe
 *   plus. L'entité locale est retirée (exactement ce que ferait un `delete`
 *   réussi), jamais laissée avec `data: null`.
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
    // GARDE-FOU MOTEUR (MIN-17/MIN-06, 02/09/2026) — « garder ma version »
    // n'a AUCUN sens pour un conflit `server_row_deleted` : la ligne n'existe
    // plus côté serveur, et rejouer l'`update` local produirait exactement le
    // même PGRST116 → un nouveau conflit, au mieux, une insistance stérile au
    // pire. L'UI masque déjà ce choix (`SyncQueueSheet`) ; le moteur le refuse
    // désormais aussi, pour qu'aucun appelant (code futur, conflit rejoué,
    // test) ne puisse contourner la règle.
    //
    // Refuser = NE RIEN CHANGER : le conflit reste en attente d'arbitrage et
    // la donnée locale est conservée telle quelle (jamais supprimée, jamais
    // écrasée). Les deux seules issues réelles restent celles du modèle
    // actuel : accepter la disparition serveur (« keep-server », qui abandonne
    // explicitement la modification locale) ou laisser le conflit ouvert.
    if (conflict.reason === "server_row_deleted") {
      console.error(
        `[syncEngine] résolution « garder ma version » refusée pour un conflit server_row_deleted (id=${conflictId}, table=${conflict.table}, record=${conflict.recordLocalId}) : la ligne n'existe plus côté serveur. Conflit laissé en attente, donnée locale conservée.`,
      );
      return;
    }
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
        // ferait exactement ce qu'on veut éviter (une écriture). Pour un
        // `update`, la version locale gagne, mais elle ne réécrit jamais les
        // colonnes du contrat (id/user_id/created_at/updated_at) : elles ne
        // font pas partie de l'arbitrage et `updated_at` reste au serveur.
        payload: opType === "delete" ? null : buildUpdatePayload(conflict.localData),
        baseUpdatedAt: null, // conflit déjà arbitré par l'utilisateur : pas de nouvelle détection
        // La barrière de dépendance survit à l'arbitrage : l'utilisateur a
        // tranché QUELLE version gagne, pas QUAND le serveur a le droit de
        // l'observer (chantier 1 bis).
        dependsOnRecords: conflict.dependsOnRecords,
      });
    }
  } else if (conflict.serverData === null) {
    // reason: "server_row_deleted" — pas de version serveur à appliquer.
    // « Garder la version serveur » = accepter qu'elle n'existe plus : on
    // aligne le local sur cette réalité, comme un `delete` réussi. On ne
    // laisse JAMAIS `data: null` dans l'entité (contrairement au fallback
    // générique ci-dessous, qui suppose toujours une ligne serveur réelle).
    if (entity) await db.delete("entities", key);
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
 * droits corrigés).
 *
 * L'erreur précédente (`lastError`/`lastErrorCode`) est CONSERVÉE : on ne
 * réécrit pas l'historique de diagnostic. Le compteur de tentatives, lui, est
 * remis à zéro depuis l'introduction du plafond (`MAX_RETRY_ATTEMPTS`,
 * MIN-17) : le garder ferait rebloquer l'opération au premier passage suivant
 * sans qu'aucune tentative n'ait lieu — l'action utilisateur serait sans
 * effet. Un budget neuf est exactement ce que demande un « réessayer » manuel
 * (le backoff repart lui aussi de zéro).
 */
export async function retryBlockedOperation(operationId: string): Promise<void> {
  const db = await getOfflineDb();
  const op = await db.get("syncQueue", operationId);
  if (!op || op.status !== "blocked") return;
  await updateOperationStatus(operationId, { status: "pending", retryCount: 0 });
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
