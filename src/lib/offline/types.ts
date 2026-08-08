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
export type SyncOpStatus = "pending" | "syncing" | "failed" | "done";

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
  lastError: string | null;
  /** Horodatage de la dernière tentative (null si jamais essayée) — sert au backoff simple du sync engine. */
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
