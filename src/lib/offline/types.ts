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
 *   invalide, cf. `NON_RETRYABLE_PG_ERROR_CODES` dans `syncErrors.ts`).
 *   Plus jamais retenté automatiquement, reste visible dans le panneau de
 *   synchronisation avec sa raison réelle, et n'attend qu'une action
 *   explicite de l'utilisateur (« Réessayer » / « Retirer de la file »).
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
  /** Version locale au moment du conflit. */
  localData: T;
  /** Version serveur au moment du conflit. */
  serverData: T;
  localUpdatedAt: string;
  serverUpdatedAt: string;
  detectedAt: string;
  /** Renseigné une fois résolu par l'utilisateur ; absent tant que le conflit est en attente. */
  resolution?: ConflictResolutionStrategy;
  resolvedAt?: string;
}
