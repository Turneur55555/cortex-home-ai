import { getOfflineDb } from "./db";
import type { SyncDependencyRef, SyncOperation, SyncOpStatus, SyncOpType } from "./types";

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
  /** CHANTIER 1 BIS — dépendances explicites OPT-IN, cf. `SyncOperation`. */
  dependsOnRecords?: SyncDependencyRef[];
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
    // Non renseigné (ou vide) → champ absent, lu comme « aucune dépendance » :
    // aucune opération existante ne change de comportement.
    ...(input.dependsOnRecords?.length ? { dependsOnRecords: input.dependsOnRecords } : {}),
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
/**
 * Statuts d'un `create` dont on peut encore ATTENDRE l'arrivée côté serveur,
 * tout seul, sans action de l'utilisateur : il est en file (`pending`), en
 * échec temporaire (`failed`, il repartira après backoff) ou déjà en vol
 * (`syncing`, éventuellement dans un autre onglet).
 *
 * `blocked` en est volontairement EXCLU (MAJ-01) : une opération bloquée
 * n'est plus jamais retentée automatiquement — la ligne n'apparaîtra donc
 * JAMAIS côté serveur sans une action explicite. C'est toute la différence
 * avec `findPendingCreateForRecord` juste en dessous, qui répond à une autre
 * question (« puis-je fusionner mon écriture dans ce `create` ? ») et pour
 * laquelle un `create` bloqué compte bel et bien.
 */
const AWAITED_CREATE_STATUSES = new Set<SyncOpStatus>(["pending", "failed", "syncing"]);

/**
 * Existe-t-il, pour cet enregistrement, un `create` qui va encore
 * NÉCESSAIREMENT tenter d'atteindre le serveur ?
 *
 * Utilisé par le sync engine sur le chemin `update` → ligne serveur absente
 * (garde PGRST116) : tant qu'un tel `create` est vivant, une ligne absente
 * n'est pas une suppression mais une course normale de la file FIFO — on
 * laisse l'UPDATE repartir. Si le `create` est `blocked`, en revanche, plus
 * rien ne créera la ligne : continuer à retenter l'UPDATE serait la boucle
 * infinie MAJ-01. Le moteur traite alors le cas comme ce qu'il est — un
 * conflit `server_row_deleted` à arbitrer.
 */
export async function findAwaitedCreateForRecord(
  userId: string,
  table: string,
  recordLocalId: string,
): Promise<SyncOperation | undefined> {
  const db = await getOfflineDb();
  // MIN-01 (audit du 04/09/2026, chantier 6) — scopé par utilisateur comme le
  // reste du module (`by-user`) : un `getAll` non scopé balaierait la file
  // COMPLÈTE, celle de tous les utilisateurs ayant jamais utilisé cet
  // appareil, avant de filtrer par `table`/`recordLocalId`. Sans effet
  // observable en pratique (`recordLocalId` est un UUID v4 aléatoire, une
  // collision entre deux comptes est infinitésimale), mais c'est un balayage
  // hors périmètre que rien ne justifie — corrigé au même titre que
  // `listPendingOperations`/`listAllOperations`, déjà scopées.
  const all = await db.getAllFromIndex("syncQueue", "by-user", IDBKeyRange.only(userId));
  return all.find(
    (op) =>
      op.table === table &&
      op.recordLocalId === recordLocalId &&
      op.opType === "create" &&
      AWAITED_CREATE_STATUSES.has(op.status),
  );
}

export async function findPendingCreateForRecord(
  userId: string,
  table: string,
  recordLocalId: string,
): Promise<SyncOperation | undefined> {
  const db = await getOfflineDb();
  // MIN-01 — voir `findAwaitedCreateForRecord` juste au-dessus.
  const all = await db.getAllFromIndex("syncQueue", "by-user", IDBKeyRange.only(userId));
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
  userId: string;
  table: string;
  recordLocalId: string;
  baseUpdatedAt: string | null;
  excludeOperationId?: string;
}): Promise<number> {
  const db = await getOfflineDb();
  // MIN-01 — scopé par utilisateur, cf. `findAwaitedCreateForRecord` plus
  // haut : sans ça, la re-calibration relisait la file de tous les comptes
  // ayant jamais utilisé cet appareil.
  const all = await db.getAllFromIndex("syncQueue", "by-user", IDBKeyRange.only(params.userId));
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
  const unblocking = existing.status === "blocked";
  await db.put("syncQueue", {
    ...existing,
    payload,
    // Le budget de tentatives (`MAX_RETRY_ATTEMPTS`, cf. `syncEngine.ts`) est
    // remis à zéro quand — et seulement quand — l'opération sort de
    // `blocked` : sans ça, une opération bloquée pour avoir épuisé ses
    // tentatives repasserait `pending` puis rebloquerait au premier passage,
    // sans jamais retenter. `lastError`/`lastErrorCode` sont conservés
    // (historique de diagnostic).
    ...(unblocking ? { retryCount: 0 } : {}),
    // Le verdict `blocked` porte sur un PAYLOAD précis (« celui-là ne
    // passera jamais »). L'utilisateur vient d'en écrire un nouveau — par
    // exemple en renseignant le champ manquant : l'opération redevient
    // candidate. On garde `lastError`/`retryCount` (historique de
    // diagnostic) ; si le nouveau payload échoue pareil, il rebloquera au
    // prochain passage. Pas de boucle : une seule tentative par correction.
    status: unblocking ? "pending" : existing.status,
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

/**
 * CHANTIER 1 BIS (DISC-01b) — statuts d'une opération encore VIVANTE : elle
 * finira par partir toute seule (`pending`, `failed` après backoff,
 * `syncing` en cours ailleurs) ou attend une action explicite de
 * l'utilisateur (`blocked`). Seul `done` est terminal — et il n'est jamais
 * persisté (une opération réussie est retirée de la file).
 *
 * Volontairement DISTINCT de `REBASABLE_STATUSES` (même contenu aujourd'hui) :
 * ce sont deux questions différentes — « peut-on recaler son baseUpdatedAt ? »
 * et « le serveur ignore-t-il encore cette écriture ? ». Les fusionner
 * coupleraient deux mécanismes sans rapport.
 */
const LIVE_OPERATION_STATUSES = new Set<SyncOpStatus>(["pending", "failed", "syncing", "blocked"]);

function dependencyKey(table: string, recordLocalId: string): string {
  return `${table}::${recordLocalId}`;
}

/**
 * L'une des dépendances déclarées par cette opération porte-t-elle encore une
 * opération vivante ANTÉRIEURE ? C'est l'unique prédicat de la barrière de
 * dépendance (`SyncOperation.dependsOnRecords`).
 *
 * Points importants :
 * - PORTÉE STRICTEMENT LIMITÉE aux enregistrements déclarés. Une écriture
 *   Nutrition, Recette ou Liste de courses sans rapport ne retient JAMAIS
 *   l'opération protégée — c'est tout l'objet de ce resserrement ;
 * - la file COMPLÈTE est relue (`listAllOperations`), pas seulement la partie
 *   traitable : une opération `syncing` prise en charge par un AUTRE onglet
 *   est absente de `listPendingOperations` mais reste bel et bien vivante —
 *   la manquer laisserait passer la clôture pendant qu'une autre instance
 *   pousse encore un enfant ;
 * - « antérieure » = `createdAt` strictement inférieur, c'est-à-dire
 *   exactement l'ordre FIFO utilisé par le moteur. L'horloge monotone de
 *   `enqueueOperation` rend toute égalité impossible au sein d'une instance.
 *   Ce filtre évite qu'une écriture postérieure sur un enfant (ex. la
 *   resynchro du résumé d'un exercice, enfilée APRÈS la clôture) ne retienne
 *   inutilement l'opération d'un passage ;
 * - l'opération elle-même est exclue (`op.id`) : une opération qui se
 *   déclarerait dépendante de son propre enregistrement ne se bloque pas ;
 * - une opération RETIRÉE de la file par l'utilisateur (« Retirer de la
 *   file ») n'est plus vivante : la barrière se libère, conformément à son
 *   choix explicite.
 *
 * Ce prédicat ne remplace JAMAIS `claimOperation` : il décide seulement s'il
 * y a lieu de tenter l'envoi ; l'exclusion mutuelle entre instances reste
 * entièrement portée par la prise de possession atomique.
 */
export async function hasLiveDependencies(
  userId: string,
  op: Pick<SyncOperation, "id" | "createdAt" | "dependsOnRecords">,
): Promise<boolean> {
  if (!op.dependsOnRecords?.length) return false;
  const awaited = new Set(
    op.dependsOnRecords.map((ref) => dependencyKey(ref.table, ref.recordLocalId)),
  );
  const ops = await listAllOperations(userId);
  const blockedByQueue = ops.some(
    (other) =>
      other.id !== op.id &&
      other.createdAt < op.createdAt &&
      LIVE_OPERATION_STATUSES.has(other.status) &&
      awaited.has(dependencyKey(other.table, other.recordLocalId)),
  );
  if (blockedByQueue) return true;

  // CORRECTIF PGRST116 (02/09/2026) — un conflit sur un enregistrement
  // attendu doit continuer à retenir la barrière. `markConflict`
  // (`syncEngine.ts`) RETIRE l'opération de `syncQueue` dès qu'un conflit est
  // détecté (elle est archivée dans le store `conflicts` à la place) : sans
  // ce second contrôle, la barrière se lèverait dès l'apparition du conflit,
  // alors que rien n'est réellement résolu tant que l'utilisateur n'a pas
  // arbitré (`resolveConflict`). Un conflit non résolu compte donc comme
  // « vivant » au même titre que `pending` / `failed` / `syncing` /
  // `blocked`, avec la même règle d'antériorité — `sourceCreatedAt` est le
  // `createdAt` de l'opération qui a produit le conflit (absent sur un
  // conflit persisté avant l'ajout du champ : lu comme `""`, donc toujours
  // antérieur — comportement conservateur, il ne peut que bloquer, jamais
  // laisser passer à tort).
  //
  // Import direct de `getOfflineDb`/`IDBKeyRange` plutôt que de réutiliser
  // `listConflicts` de `syncEngine.ts` : ce dernier importe déjà `syncQueue.ts`,
  // un import inverse créerait une dépendance circulaire entre les deux
  // modules.
  const db = await getOfflineDb();
  const conflicts = await db.getAllFromIndex("conflicts", "by-user", IDBKeyRange.only(userId));
  return conflicts.some(
    (conflict) =>
      (conflict.sourceCreatedAt ?? "") < op.createdAt &&
      awaited.has(dependencyKey(conflict.table, conflict.recordLocalId)),
  );
}

export async function countPendingAndFailed(userId: string): Promise<QueueCounts> {
  const ops = await listAllOperations(userId);
  return {
    pending: ops.filter((op) => op.status === "pending" || op.status === "syncing").length,
    failed: ops.filter((op) => op.status === "failed").length,
    blocked: ops.filter((op) => op.status === "blocked").length,
  };
}

/**
 * Reste-t-il une opération VIVANTE dans la file pour un enregistrement précis
 * (ex. la clôture d'une séance qui n'a pas encore atteint le serveur) ?
 *
 * Sert exclusivement à répondre honnêtement à la question « le serveur
 * connaît-il déjà cette écriture ? » (chantier 4, CRIT-03) : tant qu'une
 * opération subsiste ici, aucune récompense serveur ne peut être présentée
 * comme confirmée. Une opération `blocked` compte AUSSI : elle ne partira
 * plus seule, donc l'écriture n'atteindra jamais le serveur sans action de
 * l'utilisateur — la présenter comme « bientôt synchronisée » serait faux,
 * mais elle reste tout aussi peu confirmée.
 */
export async function hasQueuedOperationsForRecord(
  userId: string,
  table: string,
  recordLocalId: string,
): Promise<boolean> {
  const ops = await listAllOperations(userId);
  return ops.some(
    (op) => op.table === table && op.recordLocalId === recordLocalId && op.status !== "done",
  );
}
