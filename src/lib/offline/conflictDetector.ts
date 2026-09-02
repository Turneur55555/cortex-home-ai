import type {
  ConflictReason,
  ConflictRecord,
  OfflineEntity,
  SyncDependencyRef,
  SyncOpType,
} from "./types";

/**
 * Détecteur de conflit local/serveur — appelé par le sync engine avant
 * d'appliquer un `update`/`delete` distant sur une entité locale.
 *
 * Règle (stratégie validée) : JAMAIS d'écrasement silencieux. Un conflit est
 * détecté quand DEUX conditions sont vraies à la fois :
 *   1. le `updated_at` serveur actuel diffère du `baseUpdatedAt` connu au
 *      moment de la modification locale (quelqu'un d'autre — un autre
 *      appareil/onglet — a modifié la donnée entre-temps) ;
 *   2. la donnée locale a ELLE AUSSI été modifiée depuis (sinon il n'y a
 *      rien à arbitrer : la version serveur est simplement plus récente et
 *      peut être appliquée directement — pas un vrai conflit).
 */

export interface ConflictCheckInput<T> {
  entity: OfflineEntity<T>;
  /** `baseUpdatedAt` connu au moment où la modification locale a été faite (snapshot pris à l'écriture). */
  baseUpdatedAt: string | null;
  /** État serveur actuel. */
  serverUpdatedAt: string;
  serverData: T;
}

export function detectConflict<T>(input: ConflictCheckInput<T>): boolean {
  const { entity, baseUpdatedAt, serverUpdatedAt } = input;

  // Création (baseUpdatedAt null) : pas de conflit possible par définition
  // de ce détecteur (rien à comparer côté serveur avant l'écriture).
  if (baseUpdatedAt === null) return false;

  const serverChangedSinceBase = serverUpdatedAt !== baseUpdatedAt;
  if (!serverChangedSinceBase) return false;

  // La donnée locale a-t-elle aussi changé depuis le snapshot ? On le sait
  // via syncStatus : 'pending' (ou 'failed') signifie qu'une écriture locale
  // n'a pas encore été confirmée par le serveur.
  const localAlsoChanged = entity.syncStatus === "pending" || entity.syncStatus === "failed";

  return serverChangedSinceBase && localAlsoChanged;
}

export function buildConflictRecord<T>(input: {
  userId: string;
  table: string;
  recordLocalId: string;
  /**
   * Type de l'opération locale à l'origine du conflit. Conservé tel quel
   * dans le `ConflictRecord` : « garder ma version » doit rejouer la MÊME
   * intention (un `delete` reste un `delete`, il ne se transforme jamais en
   * `update` qui ferait ressusciter la ligne).
   */
  opType: SyncOpType;
  /**
   * Cause du conflit — voir `ConflictReason`. Par défaut
   * `updated_at_mismatch` (comportement historique inchangé) : seul
   * `syncEngine.ts` passe explicitement `server_row_deleted`, pour le
   * nouveau cas « ligne disparue avant l'UPDATE ».
   */
  reason?: ConflictReason;
  /** `createdAt` de l'opération à l'origine du conflit — cf. doc sur `ConflictRecord.sourceCreatedAt`. */
  sourceCreatedAt: string;
  /** Chantier 1 bis — dépendances de l'opération d'origine, conservées pour
   *  que « garder ma version » rejoue la même intention (cf. `opType`). */
  dependsOnRecords?: SyncDependencyRef[];
  localData: T;
  /** `null` uniquement pour `reason: "server_row_deleted"` — aucune ligne serveur à représenter. */
  serverData: T | null;
  localUpdatedAt: string;
  /** `null` uniquement pour `reason: "server_row_deleted"`. */
  serverUpdatedAt: string | null;
}): ConflictRecord<T> {
  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    table: input.table,
    recordLocalId: input.recordLocalId,
    opType: input.opType,
    reason: input.reason ?? "updated_at_mismatch",
    sourceCreatedAt: input.sourceCreatedAt,
    dependsOnRecords: input.dependsOnRecords,
    localData: input.localData,
    serverData: input.serverData,
    localUpdatedAt: input.localUpdatedAt,
    serverUpdatedAt: input.serverUpdatedAt,
    detectedAt: new Date().toISOString(),
  };
}
