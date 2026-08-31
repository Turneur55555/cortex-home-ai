import { getOfflineDb } from "./db";
import type { SyncOperation, SyncOpStatus, SyncOpType } from "./types";

/**
 * Gestion de la file d'opérations en attente de synchronisation
 * (`syncQueue`). Chaque opération porte un id local stable — c'est ce qui
 * garantit l'idempotence : un retry après coupure réutilise le MÊME id
 * d'opération, et pour un `create`, le MÊME id d'enregistrement (généré
 * côté client, cf. `repository.ts`) → un upsert Supabase par id ne crée
 * jamais de doublon.
 */

export interface EnqueueOperationInput<T> {
  userId: string;
  table: string;
  recordLocalId: string;
  opType: SyncOpType;
  payload: T | null;
  baseUpdatedAt: string | null;
}

// `listPendingOperations` trie par `createdAt` pour garantir l'ordre FIFO
// entre opérations dépendantes (ex. le `create` d'un exercice avant le
// `create` de ses séries). `Date.now()` n'a qu'une précision milliseconde :
// plusieurs opérations enfilées dans la même milliseconde (rafale de taps,
// séquence synchrone rapide) auraient un `createdAt` identique, et le tri
// (stable) retomberait sur l'ordre renvoyé par l'index IndexedDB — trié par
// `userId` PUIS par la clé primaire `id` (uuid aléatoire), donc PAS l'ordre
// de création réel. Horloge monotone strictement croissante ci-dessous :
// chaque appel garantit un `createdAt` > au précédent, quel que soit
// `Date.now()`.
let lastEnqueuedAtMs = 0;

function nextMonotonicIsoTimestamp(): string {
  const now = Date.now();
  lastEnqueuedAtMs = now > lastEnqueuedAtMs ? now : lastEnqueuedAtMs + 1;
  return new Date(lastEnqueuedAtMs).toISOString();
}

export async function enqueueOperation<T>(
  input: EnqueueOperationInput<T>,
): Promise<SyncOperation<T>> {
  const db = await getOfflineDb();
  const op: SyncOperation<T> = {
    id: crypto.randomUUID(),
    userId: input.userId,
    table: input.table,
    recordLocalId: input.recordLocalId,
    opType: input.opType,
    payload: input.payload,
    baseUpdatedAt: input.baseUpdatedAt,
    createdAt: nextMonotonicIsoTimestamp(),
    status: "pending",
    retryCount: 0,
    lastError: null,
    lastAttemptAt: null,
  };
  await db.put("syncQueue", op as SyncOperation);
  return op;
}

/**
 * Au-delà de ce délai sans nouvelle, une opération restée en `syncing` est
 * considérée ABANDONNÉE (l'instance qui l'avait prise en charge a été tuée :
 * fermeture brutale, reload, suspension PWA/mobile, onglet déchargé) et
 * redevient `pending` (cf. `reclaimStaleSyncingOperations`).
 *
 * Choix du seuil (60 s), à partir du fonctionnement réel du moteur :
 * - une opération fait au plus DEUX aller-retours réseau (lecture de la
 *   ligne serveur pour la détection de conflit, puis l'écriture) ; le
 *   `lastAttemptAt` est réécrit au moment du claim de CHAQUE opération, donc
 *   une longue file ne fait jamais vieillir l'opération en cours ;
 * - même sur un réseau mobile très dégradé, deux requêtes PostgREST tiennent
 *   très largement sous 60 s (le fetch du navigateur abandonne bien avant) ;
 * - à l'inverse, le seuil doit rester nettement au-dessus du poll de
 *   `useOfflineSync` (4 s) pour qu'un simple balayage périodique ne vole
 *   jamais une opération réellement en cours dans un autre onglet.
 * Le pire cas (une requête qui dépasse malgré tout 60 s et se voit reprise
 * en parallèle) reste sûr : les opérations sont idempotentes (upsert par
 * `id` client, delete idempotent), c'est exactement la garantie qui permet
 * de choisir un seuil fini plutôt que d'attendre indéfiniment.
 */
export const STALE_SYNCING_MS = 60_000;

function isStaleSyncing(op: SyncOperation, now: number): boolean {
  if (op.status !== "syncing") return false;
  // Pas d'horodatage de prise de possession (opération écrite par une
  // version antérieure du moteur) : orpheline par définition, sinon elle
  // resterait bloquée pour toujours — le bug CRIT-01 lui-même.
  if (!op.lastAttemptAt) return true;
  return now - new Date(op.lastAttemptAt).getTime() >= STALE_SYNCING_MS;
}

/**
 * Remet en `pending` les opérations restées en `syncing` au-delà de
 * `STALE_SYNCING_MS` — c'est la récupération des opérations orphelines
 * (CRIT-01). Rien n'est jamais supprimé : une opération orpheline est
 * REPRISE, pas perdue. Appelée au début de chaque passage de la queue.
 *
 * Chaque reprise est atomique (transaction IndexedDB get+put) et
 * re-vérifie la condition : deux instances qui balaient en même temps ne
 * peuvent pas reprendre deux fois la même opération.
 */
export async function reclaimStaleSyncingOperations(
  userId: string,
  now: number = Date.now(),
): Promise<number> {
  const db = await getOfflineDb();
  const all = await db.getAllFromIndex("syncQueue", "by-user", IDBKeyRange.only(userId));
  const candidates = all.filter((op) => isStaleSyncing(op, now));

  let reclaimed = 0;
  for (const candidate of candidates) {
    const tx = db.transaction("syncQueue", "readwrite");
    const current = await tx.store.get(candidate.id);
    if (current && isStaleSyncing(current, now)) {
      await tx.store.put({
        ...current,
        status: "pending",
        // On compte la tentative interrompue : le diagnostic (et le backoff
        // en cas d'échec ultérieur) reste fidèle au nombre réel d'essais.
        retryCount: current.retryCount + 1,
        lastError:
          "Synchronisation interrompue (application fermée, rechargée ou mise en veille) — reprise automatique.",
        lastErrorCode: null,
      });
      reclaimed += 1;
    }
    await tx.done;
  }
  return reclaimed;
}

/**
 * Prend possession d'une opération de façon ATOMIQUE : lecture + écriture
 * dans une seule transaction IndexedDB `readwrite`, que le navigateur
 * sérialise entre TOUTES les connexions (onglets, PWA, service worker).
 * Deux instances qui traitent la queue en même temps ne peuvent donc pas
 * envoyer la même opération deux fois : la seconde reçoit `null` et passe à
 * la suivante (pas de deadlock, pas de rupture du FIFO — l'opération
 * appartient simplement à l'autre instance).
 *
 * Retourne l'opération telle que persistée (statut `syncing`,
 * `lastAttemptAt` = maintenant) ou `null` si elle n'est plus disponible
 * (déjà terminée, déjà prise en charge et non orpheline, ou `blocked`).
 */
export async function claimOperation(
  id: string,
  now: number = Date.now(),
): Promise<SyncOperation | null> {
  const db = await getOfflineDb();
  const tx = db.transaction("syncQueue", "readwrite");
  const existing = await tx.store.get(id);
  if (!existing) {
    await tx.done;
    return null;
  }
  const claimable =
    existing.status === "pending" || existing.status === "failed" || isStaleSyncing(existing, now);
  if (!claimable) {
    await tx.done;
    return null;
  }
  const claimed: SyncOperation = {
    ...existing,
    status: "syncing",
    lastAttemptAt: new Date(now).toISOString(),
  };
  await tx.store.put(claimed);
  await tx.done;
  return claimed;
}

/**
 * File FIFO (par `createdAt`) des opérations traitables par le moteur, pour
 * un utilisateur donné : `pending`, `failed` (retry après backoff) et les
 * `syncing` orphelines (reprises par `reclaimStaleSyncingOperations` juste
 * avant). Les `blocked` en sont volontairement exclues : elles ne doivent
 * plus être retentées automatiquement, seulement par action explicite de
 * l'utilisateur.
 */
export async function listPendingOperations(userId: string): Promise<SyncOperation[]> {
  const db = await getOfflineDb();
  const all = await db.getAllFromIndex("syncQueue", "by-user", IDBKeyRange.only(userId));
  return all
    .filter((op) => op.status === "pending" || op.status === "failed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listAllOperations(userId: string): Promise<SyncOperation[]> {
  const db = await getOfflineDb();
  const all = await db.getAllFromIndex("syncQueue", "by-user", IDBKeyRange.only(userId));
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateOperationStatus(
  id: string,
  patch: Partial<
    Pick<SyncOperation, "status" | "retryCount" | "lastError" | "lastErrorCode" | "lastAttemptAt">
  >,
): Promise<void> {
  const db = await getOfflineDb();
  const existing = await db.get("syncQueue", id);
  if (!existing) return;
  await db.put("syncQueue", { ...existing, ...patch });
}

export async function removeOperation(id: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete("syncQueue", id);
}

/**
 * Retrouve une opération `create` encore en attente (pas encore envoyée avec
 * succès) pour un enregistrement donné. Utilisé par `repository.ts` pour
 * fusionner un `update`/`delete` local dans la création pas-encore-synchro
 * au lieu d'empiler une opération séparée qui référencerait un id inconnu
 * du serveur.
 */
export async function findPendingCreateForRecord(
  table: string,
  recordLocalId: string,
): Promise<SyncOperation | undefined> {
  const db = await getOfflineDb();
  const all = await db.getAll("syncQueue");
  return all.find(
    (op) =>
      op.table === table &&
      op.recordLocalId === recordLocalId &&
      op.opType === "create" &&
      // `blocked` compris : la ligne n'existe toujours pas côté serveur, un
      // `update`/`delete` séparé référencerait un id inconnu du serveur.
      (op.status === "pending" || op.status === "failed" || op.status === "blocked"),
  );
}

/**
 * Après qu'une opération a réussi, recale les opérations encore en attente
 * sur le MÊME enregistrement : leur `baseUpdatedAt` devient le `updated_at`
 * que le serveur vient d'atteindre. Renvoie le nombre d'opérations restantes.
 *
 * Nécessaire depuis le passage aux patchs partiels (`repository.update()`) :
 * deux modifications locales enchaînées produisent désormais DEUX opérations
 * qui portent chacune leur propre patch (avant, la seconde réécrivait toute
 * la ligne et rendait la première caduque). Sans ce recalage, la seconde
 * partirait avec le `baseUpdatedAt` d'AVANT la première : le conflict
 * detector verrait un `updated_at` serveur différent de sa base et
 * déclencherait un faux conflit… provoqué par notre propre opération
 * précédente, pas par un autre appareil. Un `create` en attente n'est jamais
 * recalé (`baseUpdatedAt` null par définition).
 */
/** États d'une opération encore « vivante » : elle finira par partir (ou attend l'utilisateur). */
const REBASABLE_STATUSES = new Set<SyncOpStatus>(["pending", "failed", "syncing", "blocked"]);

export async function rebasePendingOperationsForRecord(params: {
  table: string;
  recordLocalId: string;
  baseUpdatedAt: string | null;
  excludeOperationId?: string;
}): Promise<number> {
  const db = await getOfflineDb();
  const all = await db.getAll("syncQueue");
  // Toute opération non terminée compte, `blocked` comprise : la ligne
  // locale porte alors une modification que le serveur n'a pas encore, et
  // si l'utilisateur débloque l'opération (`updateOperationPayload` la
  // repasse en `pending`), elle doit repartir de l'état serveur courant.
  // `syncing` compte aussi : une autre instance est en vol sur ce même
  // enregistrement.
  const remaining = all.filter(
    (op) =>
      op.table === params.table &&
      op.recordLocalId === params.recordLocalId &&
      op.id !== params.excludeOperationId &&
      REBASABLE_STATUSES.has(op.status),
  );

  for (const op of remaining) {
    // Un `create` en attente n'a pas de base (`baseUpdatedAt` null par
    // définition) : le recaler lui inventerait une détection de conflit.
    if (op.opType === "create" || op.baseUpdatedAt === null) continue;
    // Relecture dans la transaction : l'opération a pu changer d'état entre
    // le scan et l'écriture (autre onglet), et on ne réécrit QUE
    // `baseUpdatedAt` — jamais le statut, le payload ou le compteur de
    // retry, qui appartiennent à la machine d'état de la sync queue.
    const tx = db.transaction("syncQueue", "readwrite");
    const current = await tx.store.get(op.id);
    if (current && REBASABLE_STATUSES.has(current.status) && current.opType !== "create") {
      await tx.store.put({ ...current, baseUpdatedAt: params.baseUpdatedAt });
    }
    await tx.done;
  }
  return remaining.length;
}

export async function updateOperationPayload<T>(id: string, payload: T): Promise<void> {
  const db = await getOfflineDb();
  const existing = await db.get("syncQueue", id);
  if (!existing) return;
  await db.put("syncQueue", {
    ...existing,
    payload,
    // Le verdict `blocked` porte sur un PAYLOAD précis (« celui-là ne
    // passera jamais »). L'utilisateur vient d'en écrire un nouveau — par
    // exemple en renseignant le champ manquant : l'opération redevient
    // candidate. On garde `lastError`/`retryCount` (historique de
    // diagnostic) ; si le nouveau payload échoue pareil, il rebloquera au
    // prochain passage. Pas de boucle : une seule tentative par correction.
    status: existing.status === "blocked" ? "pending" : existing.status,
  } as SyncOperation);
}

export interface QueueCounts {
  /** En attente d'envoi (y compris en cours d'envoi). */
  pending: number;
  /** En échec retryable — repassera toute seule après backoff. */
  failed: number;
  /** Bloquée définitivement — n'avancera plus sans action utilisateur. */
  blocked: number;
}

/**
 * Reste-t-il une autre opération dans la file de cet utilisateur ? Sert à
 * distinguer une dépendance encore satisfiable (le `create` du parent est
 * toujours en file, FIFO) d'une dépendance définitivement introuvable —
 * cf. `DEPENDENCY_PG_ERROR_CODES` dans `syncErrors.ts`. Les opérations déjà
 * `blocked` ne comptent pas : elles ne créeront plus rien toutes seules.
 */
export async function hasOtherQueuedOperations(
  userId: string,
  excludeOperationId: string,
): Promise<boolean> {
  const ops = await listAllOperations(userId);
  return ops.some((op) => op.id !== excludeOperationId && op.status !== "blocked");
}

export async function countPendingAndFailed(userId: string): Promise<QueueCounts> {
  const ops = await listAllOperations(userId);
  return {
    pending: ops.filter((op) => op.status === "pending" || op.status === "syncing").length,
    failed: ops.filter((op) => op.status === "failed").length,
    blocked: ops.filter((op) => op.status === "blocked").length,
  };
}
