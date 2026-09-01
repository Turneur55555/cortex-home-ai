/**
 * Résumé lisible de l'état de la sync queue — logique PURE (zéro import
 * React/Supabase), au même titre que `syncErrors.ts`.
 *
 * Sert au bloc « Synchronisation » du Profil (`SyncStatusCard`), qui est
 * désormais le SEUL point d'accès au panneau détaillé : la synchronisation
 * est une fonctionnalité secondaire, elle ne doit plus s'imposer par-dessus
 * l'écran après chaque action (audit UI du 01/09/2026).
 *
 * Aucune couleur ici (convention `/src/lib/`) : on renvoie un `tone`
 * sémantique, c'est le composant qui décide de son rendu.
 */

export type SyncSummaryTone =
  /** Rien en attente. */
  | "ok"
  /** Passe de synchronisation en cours. */
  | "syncing"
  /** Des actions attendent leur tour, tout est normal. */
  | "pending"
  /** Hors connexion — les actions partiront au retour du réseau. */
  | "offline"
  /** Échec temporaire : ça repartira tout seul après le backoff. */
  | "warning"
  /** L'utilisateur doit trancher (conflit ou opération bloquée). */
  | "attention";

export interface SyncQueueSummaryInput {
  isOnline: boolean;
  isSyncing: boolean;
  /** En attente d'envoi, `syncing` comprises (cf. `countPendingAndFailed`). */
  pendingCount: number;
  failedCount: number;
  blockedCount: number;
  conflictCount: number;
}

export interface SyncQueueSummary {
  /** Ligne principale du bloc Profil. */
  label: string;
  /** Ligne secondaire, `null` quand elle n'apporte rien. */
  detail: string | null;
  tone: SyncSummaryTone;
  /**
   * Nombre d'actions réellement encore dans la file — MÊME définition que le
   * pied du panneau détaillé (`SyncQueueSheet`), pour qu'un compteur ne
   * puisse jamais contredire l'autre.
   */
  queuedCount: number;
  /** Une intervention de l'utilisateur est nécessaire (conflit / bloquée). */
  needsAttention: boolean;
  /** Y a-t-il quelque chose à voir dans le panneau détaillé ? */
  hasDetails: boolean;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count > 1 ? pluralForm : singular;
}

/**
 * Ordre de priorité repris À L'IDENTIQUE de l'ancien indicateur global
 * (`SyncStatusIndicator`) : ce qui demande une décision d'abord, puis ce qui
 * coince, puis l'état courant. On ne change que le point d'affichage, jamais
 * la sémantique déjà connue de l'utilisateur.
 */
export function summarizeSyncQueue(input: SyncQueueSummaryInput): SyncQueueSummary {
  const queuedCount = input.pendingCount + input.failedCount + input.blockedCount;
  const hasDetails = queuedCount > 0 || input.conflictCount > 0;
  const base = { queuedCount, hasDetails };

  if (input.conflictCount > 0) {
    return {
      ...base,
      label: plural(input.conflictCount, "Conflit à résoudre", "Conflits à résoudre"),
      detail: `${input.conflictCount} ${plural(input.conflictCount, "donnée modifiée", "données modifiées")} ailleurs — choisissez la version à garder.`,
      tone: "attention",
      needsAttention: true,
    };
  }

  if (input.blockedCount > 0) {
    return {
      ...base,
      label: `${input.blockedCount} ${plural(input.blockedCount, "action nécessite", "actions nécessitent")} votre attention`,
      detail: "Ces actions n'avanceront plus sans votre intervention.",
      tone: "attention",
      needsAttention: true,
    };
  }

  if (!input.isOnline) {
    return {
      ...base,
      label: "Hors connexion",
      detail:
        queuedCount > 0
          ? `${queuedCount} ${plural(queuedCount, "action partira", "actions partiront")} au retour du réseau.`
          : "Vos modifications sont enregistrées sur l'appareil.",
      tone: "offline",
      needsAttention: false,
    };
  }

  if (input.isSyncing) {
    return {
      ...base,
      label: "Synchronisation…",
      detail: null,
      tone: "syncing",
      needsAttention: false,
    };
  }

  if (input.failedCount > 0) {
    return {
      ...base,
      label: "Synchronisation en attente",
      detail: `${input.failedCount} ${plural(input.failedCount, "action en échec temporaire", "actions en échec temporaire")} — nouvelle tentative prévue.`,
      tone: "warning",
      needsAttention: false,
    };
  }

  if (input.pendingCount > 0) {
    return {
      ...base,
      label: `${input.pendingCount} ${plural(input.pendingCount, "action en attente", "actions en attente")}`,
      detail: "Elles partent automatiquement en arrière-plan.",
      tone: "pending",
      needsAttention: false,
    };
  }

  return {
    ...base,
    label: "Synchronisé",
    detail: "Toutes vos modifications sont enregistrées.",
    tone: "ok",
    needsAttention: false,
  };
}
