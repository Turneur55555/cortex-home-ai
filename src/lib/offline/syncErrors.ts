import type { SyncOperation } from "./types";

/**
 * Classification et mise en forme des erreurs de synchronisation — logique
 * pure (zéro import React/Supabase), partagée par le sync engine (décider
 * `failed` vs `blocked`) et par le panneau de synchronisation (expliquer à
 * l'utilisateur la raison RÉELLE d'un blocage, cf. audit MAJ-11).
 */

/**
 * Codes d'erreur Postgres qu'un retry À L'IDENTIQUE ne peut pas résoudre :
 * le payload/schéma est structurellement invalide. Un vrai souci
 * réseau/transitoire (fetch échoué, timeout, 5xx) n'a PAS de `code`
 * Postgres — il continue d'être retenté normalement par le backoff.
 *
 * Une opération qui échoue avec un de ces codes passe en `blocked` : elle
 * n'est plus jamais retentée automatiquement (elle rebouclerait à l'infini,
 * bug prod « 31 en échec » — cause réelle : cf. migration
 * 20260829130000_exercises_created_at.sql), mais reste visible avec son
 * erreur et attend une action explicite de l'utilisateur.
 */
export const NON_RETRYABLE_PG_ERROR_CODES = new Set([
  "42703", // undefined_column
  "42P10", // invalid_column_reference (ON CONFLICT target)
  "23502", // not_null_violation
  "23503", // foreign_key_violation
  "23514", // check_violation
  "22P02", // invalid_text_representation
  "PGRST204", // PostgREST: colonne absente du schema cache
]);

/**
 * Sous-ensemble PARTICULIER : ces codes dépendent de l'état du serveur, pas
 * du payload lui-même. Une violation de clé étrangère est le cas normal —
 * et attendu — d'une file FIFO où l'enfant est enfilé juste après son
 * parent (`workout` → `exercise` → `exercise_set`) : si le `create` du
 * parent a échoué (blip réseau), celui de l'enfant échoue en 23503, puis
 * les DEUX passent au tour suivant. Les bloquer immédiatement casserait
 * cette reprise parfaitement légitime.
 *
 * Règle retenue (cf. `isBlockingSyncError`) : une erreur de ce type reste
 * retryable TANT QUE la file contient encore une autre opération — donc
 * quelque chose qui peut encore créer la ligne parente manquante. Quand
 * l'opération est la dernière de la file et échoue toujours dessus, plus
 * rien ne pourra la satisfaire : elle est alors bloquée (c'est ce qui
 * termine la boucle infinie du bug prod, sans casser la reprise FIFO).
 */
export const DEPENDENCY_PG_ERROR_CODES = new Set([
  "23503", // foreign_key_violation
]);

export interface SyncFailureContext {
  /**
   * Reste-t-il, au moment de l'échec, d'autres opérations dans la file de
   * cet utilisateur (hors celle qui vient d'échouer) ? Si oui, l'une
   * d'elles peut encore créer la ligne parente manquante.
   */
  hasOtherQueuedOperations: boolean;
}

export interface SyncErrorDetails {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
}

/**
 * PostgREST/Supabase renvoie `{ message, code, details, hint }` sur toute
 * erreur (contrainte violée, colonne inconnue, réseau...). On capture tout
 * ça explicitement — jamais juste `err.message` — pour qu'une opération en
 * échec en prod soit diagnosticable sans avoir à reproduire.
 */
export function extractSyncError(err: unknown): SyncErrorDetails {
  const pgError = err as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null;
  const message = pgError?.message ?? (err instanceof Error ? err.message : String(err));
  return {
    message,
    code: pgError?.code ?? null,
    details: pgError?.details ?? null,
    hint: pgError?.hint ?? null,
  };
}

/** Résumé technique complet, stocké dans `lastError` (logs + diagnostic). */
export function formatSyncErrorSummary(error: SyncErrorDetails): string {
  const parts = [error.message];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.details) parts.push(`details=${error.details}`);
  if (error.hint) parts.push(`hint=${error.hint}`);
  return parts.join(" | ");
}

/**
 * Cette erreur doit-elle figer l'opération en `blocked` (plus aucun retry
 * automatique) ? Vrai uniquement pour une erreur explicitement identifiée
 * comme définitive — jamais pour un souci réseau (sans code Postgres), et
 * jamais pour une dépendance encore satisfiable par la file (cf.
 * `DEPENDENCY_PG_ERROR_CODES`).
 */
export function isBlockingSyncError(
  error: Pick<SyncErrorDetails, "code">,
  context: SyncFailureContext,
): boolean {
  if (!error.code || !NON_RETRYABLE_PG_ERROR_CODES.has(error.code)) return false;
  if (DEPENDENCY_PG_ERROR_CODES.has(error.code)) return !context.hasOtherQueuedOperations;
  return true;
}

/**
 * Traduction courte et compréhensible d'un code d'erreur connu. Sert à
 * expliquer POURQUOI une action est bloquée sans jargon Postgres — le
 * résumé technique complet (`lastError`) reste affiché à côté, jamais
 * remplacé par un message générique.
 */
const NON_RETRYABLE_CODE_LABELS: Record<string, string> = {
  "42703": "Un champ envoyé n'existe pas côté serveur (application à mettre à jour).",
  "42P10": "Référence de colonne invalide côté serveur (application à mettre à jour).",
  "23502": "Une information obligatoire est manquante dans cette action.",
  "23503": "Cette action dépend d'un élément qui n'existe pas côté serveur.",
  "23514": "Une valeur de cette action n'est pas acceptée par le serveur.",
  "22P02": "Une valeur de cette action a un format invalide.",
  PGRST204: "Un champ envoyé est inconnu du serveur (application à mettre à jour).",
};

/**
 * Message affiché à l'utilisateur pour une opération en échec/bloquée.
 * Règle (audit MAJ-11) : ne JAMAIS retomber sur un message générique tant
 * que `lastError` contient une information exploitable — le message brut
 * Supabase est déjà bien plus utile que « une erreur est survenue ».
 */
export function describeSyncFailure(
  op: Pick<SyncOperation, "status" | "lastError" | "lastErrorCode" | "retryCount">,
): string | null {
  const known = op.lastErrorCode ? NON_RETRYABLE_CODE_LABELS[op.lastErrorCode] : undefined;
  if (known) return known;
  if (op.lastError) return firstErrorSegment(op.lastError);
  if (op.status === "blocked") return "Action bloquée par le serveur.";
  return null;
}

/**
 * `lastError` est un résumé technique `message | code=... | details=...`.
 * L'utilisateur lit le message ; le reste est du diagnostic (affiché en
 * second plan par le panneau).
 */
export function firstErrorSegment(lastError: string): string {
  const [first] = lastError.split(" | ");
  return first.trim() || lastError;
}

/** Partie purement technique de `lastError` (code/details/hint), si présente. */
export function technicalErrorDetail(lastError: string | null): string | null {
  if (!lastError) return null;
  const rest = lastError.split(" | ").slice(1).join(" | ").trim();
  return rest || null;
}
