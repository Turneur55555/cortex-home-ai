/**
 * Types génériques de l'architecture offline-first (UI → Repository →
 * IndexedDB → Sync Queue → Supabase). Zéro dépendance React/Supabase ici —
 * logique pure, cf. convention `/src/lib/`.
 *
 * Stratégie de conflits (validée) : détection + choix utilisateur explicite,
 * JAMAIS d'écrasement silencieux. Voir `conflictDetector.ts`.
 */

/** Nom logique d'une entité offline (ex: "nutrition_favorites", "recipes"). */
export type EntityTable = string;

export type SyncStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";

/**
 * Enregistrement métier tel que stocké dans IndexedDB (store `entities`).
 * `localId` est l'identifiant stable côté client — pour les tables migrées
 * ici, c'est le même uuid que l'id serveur (généré côté client dès la
 * création, cf. repository.ts) afin qu'un `create` retenté après coupure
 * réseau soit idempotent (upsert par id, jamais de doublon).
 */
export interface OfflineEntity<T = Record<string, unknown>> {
  /** Clé composée réelle dans IndexedDB : `${table}::${localId}`. */
  key?: string;
  table: EntityTable;
  localId: string;
  userId: string;
  data: T;
  syncStatus: SyncStatus;
  /** `updated_at` serveur connu au moment de la dernière lecture/sync réussie (null si jamais synchronisé). */
  serverUpdatedAt: string | null;
  /** Horodatage de la dernière écriture locale (pour la détection de conflit : "la donnée locale a aussi changé depuis"). */
  localUpdatedAt: string;
  /** Marque un enregistrement supprimé localement en attendant la confirmation serveur (tombstone). */
  deleted: boolean;
}

export type SyncOpType = "create" | "update" | "delete";

/**
 * Référence à un enregistrement dont une opération dépend (chantier 1 bis).
 * Volontairement réduite au couple qui identifie une ligne dans la file :
 * le moteur n'a besoin de rien d'autre, et surtout d'aucune connaissance du
 * modèle métier de l'appelant.
 */
export interface SyncDependencyRef {
  /** Table locale de l'enregistrement attendu (ex. "exercises"). */
  table: EntityTable;
  /** Id local (= id serveur, généré côté client, cf. repository.ts). */
  recordLocalId: string;
}

/**
 * Cycle de vie d'une opération de la sync queue :
 *
 *   pending ──claim──▶ syncing ──succès──▶ (retirée de la queue)
 *      ▲                  │
 *      │                  ├──échec transitoire (réseau/5xx)──▶ failed ──backoff──▶ (reprise)
 *      │                  │
 *      │                  └──échec définitif (code PG non retryable)──▶ blocked
 *      │                                                                   │
 *      └───────────── reprise d'orpheline / action utilisateur ────────────┘
 *
 * - `syncing` : une instance (onglet/PWA) a pris possession de l'opération.
 *   Si elle est interrompue (fermeture brutale, reload, suspension PWA),
 *   l'opération est reprise automatiquement au bout de `STALE_SYNCING_MS`
 *   (cf. `syncQueue.ts`) — elle ne reste JAMAIS bloquée en `syncing`.
 * - `failed` : échec retryable, rejoué automatiquement après backoff.
 * - `blocked` : échec définitif identifié (payload/schéma structurellement
 *   invalide, cf. `NON_RETRYABLE_PG_ERROR_CODES` dans `syncErrors.ts`) OU
 *   budget de tentatives épuisé (`MAX_RETRY_ATTEMPTS`, cf. `syncEngine.ts`,
 *   MIN-17 : même une erreur temporaire finit par s'arrêter, sinon elle est
 *   retentée sans fin). Plus jamais retenté automatiquement, reste visible
 *   dans le panneau de synchronisation avec sa raison réelle, et n'attend
 *   qu'une action explicite de l'utilisateur (« Réessayer » — qui rend un
 *   budget de tentatives neuf — ou « Retirer de la file »).
 * - `done` : état terminal jamais persisté (l'opération réussie est
 *   supprimée de la queue), conservé pour compatibilité des types.
 */
export type SyncOpStatus = "pending" | "syncing" | "failed" | "blocked" | "done";

/** Une opération en attente de synchronisation vers Supabase. */
export interface SyncOperation<T = Record<string, unknown>> {
  /** uuid local, stable — porte l'idempotence du retry. */
  id: string;
  userId: string;
  table: EntityTable;
  recordLocalId: string;
  opType: SyncOpType;
  payload: T | null;
  /** Snapshot de `updated_at` serveur connu au moment de la modif locale ; null si `create`. */
  baseUpdatedAt: string | null;
  createdAt: string;
  status: SyncOpStatus;
  retryCount: number;
  /** Résumé lisible de la dernière erreur (message Supabase + code/details/hint). Exposé tel quel au panneau de synchronisation. */
  lastError: string | null;
  /** Code d'erreur Postgres/PostgREST de la dernière erreur, quand il existe — sert à décider `failed` vs `blocked` et à expliquer la cause à l'utilisateur sans re-parser `lastError`. */
  lastErrorCode?: string | null;
  /**
   * CHANTIER 1 BIS (DISC-01b) — BARRIÈRE DE DÉPENDANCE EXPLICITE, OPT-IN.
   *
   * Liste des ENREGISTREMENTS dont cette opération dépend. Elle n'est pas
   * envoyée tant que l'un d'eux porte encore, dans la file du même
   * utilisateur, une opération vivante (`pending` | `failed` | `syncing` |
   * `blocked`) ANTÉRIEURE à celle-ci. Elle est alors laissée intacte en file
   * (comptée dans `skipped`) et retentée au passage suivant, sans consommer
   * de tentative ni avancer son backoff.
   *
   * POURQUOI (reproduit et mesuré) : le FIFO du moteur est un ordre
   * TEMPOREL, pas une dépendance. `processSyncQueue` traite chaque opération
   * indépendamment et continue après un échec. Une clôture de séance
   * (`workouts.status='completed'`) pouvait donc partir alors que le `create`
   * de ses exercices/séries avait échoué — et le trigger serveur
   * `award_xp_on_workout_complete`, qui parcourt ces lignes, s'exécutait sur
   * une séance vide. Irréversible : son garde
   * (`OLD.status IS DISTINCT FROM 'completed'`) l'empêche de se redéclencher
   * quand les enfants arrivent enfin. En `blocked`, la perte était définitive.
   *
   * POURQUOI DES ENREGISTREMENTS ET NON DES ids D'OPÉRATION : un id
   * d'opération est interne et instable — `resolveConflict` en ré-enfile un
   * neuf, et une opération créée plus tard sur le même enregistrement
   * échapperait à une liste figée. Une dépendance par enregistrement reste
   * juste quoi qu'il arrive à la file.
   *
   * POURQUOI PAS UNE DÉDUCTION CÔTÉ MOTEUR : `exercise_sets` ne porte AUCUN
   * `workout_id` (seulement `exercise_id`) ; déduire les enfants d'une séance
   * imposerait une jointure et des règles par table DANS le moteur générique.
   * C'est l'appelant — le domaine Fitness, qui connaît son propre modèle —
   * qui déclare (cf. `lib/fitness/workoutSyncDependencies.ts`).
   *
   * STRICTEMENT OPT-IN : une opération sans cette liste garde exactement le
   * comportement d'avant, et la barrière ne retient QUE l'opération qui la
   * porte — une opération indépendante placée après une opération en échec
   * continue de partir normalement (la file n'est JAMAIS un stop-on-error
   * global, cf. `fitnessCoreOffline.test.ts`).
   *
   * Absent (undefined) pour toute opération persistée avant l'ajout du champ,
   * lu comme « aucune dépendance » : aucune migration de la file.
   */
  dependsOnRecords?: SyncDependencyRef[];
  /**
   * Horodatage de la dernière tentative. Sert à DEUX mécanismes :
   * 1. le backoff exponentiel des opérations `failed` (sync engine) ;
   * 2. la prise de possession / détection d'orpheline d'une opération
   *    `syncing` (il est réécrit au moment du claim) — cf. `syncQueue.ts`.
   * `null` uniquement tant que l'opération n'a jamais été tentée.
   */
  lastAttemptAt: string | null;
}

export type ConflictResolutionStrategy = "keep-local" | "keep-server";
// Point d'extension explicite : une future fusion champ par champ pourra
// ajouter 'merge' ici sans casser les appelants existants (switch exhaustif
// à mettre à jour à ce moment-là).
export type ExtensibleConflictResolutionStrategy = ConflictResolutionStrategy | "merge";

/**
 * Cause d'un conflit (02/09/2026, correctif PGRST116) :
 * - `updated_at_mismatch` (comportement historique, inchangé) : le serveur
 *   PORTE toujours la ligne, mais avec un `updated_at` différent du
 *   `baseUpdatedAt` connu au moment de la modification locale — quelqu'un
 *   d'autre l'a modifiée entre-temps. `serverData`/`serverUpdatedAt` sont
 *   renseignés.
 * - `server_row_deleted` (nouveau) : la ligne visée par un `update` local
 *   N'EXISTE PLUS côté serveur (cause racine de la boucle de retry infinie
 *   `PGRST116` du 01/09/2026 — cf. `syncEngine.ts`). Il n'y a AUCUNE version
 *   serveur à comparer : `serverData`/`serverUpdatedAt` sont `null`.
 *
 * Absent (undefined) pour tout conflit persisté avant l'ajout de ce champ :
 * relu comme `updated_at_mismatch`, seul cas qui existait à l'époque — aucune
 * migration de données, aucun changement de comportement pour ces conflits.
 */
export type ConflictReason = "updated_at_mismatch" | "server_row_deleted";

export interface ConflictRecord<T = Record<string, unknown>> {
  id: string;
  userId: string;
  table: EntityTable;
  recordLocalId: string;
  /**
   * Type de l'opération locale qui a provoqué le conflit. Indispensable
   * pour que « garder ma version » respecte l'INTENTION d'origine : un
   * conflit né d'un `delete` doit se rejouer en `delete`, jamais se
   * convertir en `update` (sinon la ligne ressuscite côté serveur).
   * Optionnel au typage uniquement pour les conflits déjà persistés en
   * IndexedDB avant l'ajout du champ : ils sont relus comme `update`,
   * qui était le seul comportement possible à l'époque.
   */
  opType?: SyncOpType;
  /** Cause du conflit — voir `ConflictReason`. Absent = `updated_at_mismatch` (legacy). */
  reason?: ConflictReason;
  /** Version locale au moment du conflit. */
  localData: T;
  /**
   * Version serveur au moment du conflit. `null` uniquement pour
   * `reason: "server_row_deleted"` — il n'existe littéralement aucune ligne
   * serveur à représenter.
   */
  serverData: T | null;
  localUpdatedAt: string;
  /** `null` uniquement pour `reason: "server_row_deleted"` (pas de ligne serveur, donc pas de timestamp). */
  serverUpdatedAt: string | null;
  detectedAt: string;
  /**
   * `createdAt` de l'opération de synchronisation à l'origine de ce conflit.
   * Nécessaire pour que la barrière de dépendance (chantier 1 bis,
   * `hasLiveDependencies` dans `syncQueue.ts`) applique la MÊME règle
   * d'antériorité qu'aux opérations encore présentes dans `syncQueue` : un
   * conflit compte comme dépendance vivante seulement s'il provient d'une
   * opération antérieure à celle qui déclare en dépendre. Un conflit est en
   * effet retiré de `syncQueue` dès sa détection (`markConflict`) — sans ce
   * champ, la barrière ne verrait plus du tout cette dépendance dès qu'un
   * conflit est levé, alors que rien n'est résolu tant que l'utilisateur n'a
   * pas arbitré. Optionnel au typage pour les conflits persistés avant
   * l'ajout du champ : relus comme `""`, donc toujours considérés antérieurs
   * (comportement conservateur — ils bloquent, jamais l'inverse).
   */
  sourceCreatedAt?: string;
  /**
   * CHANTIER 1 BIS — dépendances de l'opération à l'origine du conflit,
   * conservées pour la même raison que `opType` juste au-dessus : « garder ma
   * version » doit rejouer la MÊME intention, barrière comprise. Sans ça, une
   * clôture rejouée après arbitrage repartirait sans garde et pourrait
   * devancer des enfants encore en échec. Optionnel au typage pour les
   * conflits déjà persistés avant l'ajout du champ (relus comme « aucune
   * dépendance »).
   */
  dependsOnRecords?: SyncDependencyRef[];
  /** Renseigné une fois résolu par l'utilisateur ; absent tant que le conflit est en attente. */
  resolution?: ConflictResolutionStrategy;
  resolvedAt?: string;
}
