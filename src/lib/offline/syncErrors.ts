import type { SyncOperation, SyncOpType } from "./types";
import { uniqueSequenceRuleFor } from "./uniqueSequenceRemap";

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
  "23505", // unique_violation — cf. `classifyUniqueViolation` : le verdict
  //          RÉEL dépend de la CONTRAINTE violée, pas du seul code.
  "23514", // check_violation
  "22P02", // invalid_text_representation
  "PGRST204", // PostgREST: colonne absente du schema cache
]);

/** `unique_violation` — traité à part, cf. `classifyUniqueViolation`. */
export const UNIQUE_VIOLATION_PG_ERROR_CODE = "23505";

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

/**
 * CHANTIER 8 (A1) — CONTRAINTES D'UNICITÉ DONT LA VIOLATION DÉPEND DE L'ÉTAT
 * SERVEUR, PAS DU PAYLOAD.
 *
 * Ce sont les index uniques PARTIELS « une seule ligne ACTIVE par
 * utilisateur » (vérifiés en base sur le projet `bcwfvpwxzlmkxobvbtzp`) :
 *
 *     workouts_one_active_per_user      ON workouts (user_id)        WHERE status = 'active'
 *     physical_goals_one_active_per_user ON physical_goals (user_id) WHERE status = 'active'
 *
 * Le payload est parfaitement valide : c'est la PRÉSENCE d'une autre ligne
 * encore `active` côté serveur qui le refuse. Or cette autre ligne peut être
 * clôturée par une opération ENCORE EN FILE — typiquement quand la clôture de
 * la séance précédente est momentanément retenue par la barrière de
 * dépendance (chantier 1 bis) pendant que le démarrage de la suivante part.
 * Les bloquer immédiatement casserait cette reprise parfaitement légitime.
 *
 * Même règle que `DEPENDENCY_PG_ERROR_CODES` ci-dessous : retryable tant que
 * la file contient encore autre chose, bloquante quand plus rien ne peut
 * lever la condition.
 */
export const STATE_DEPENDENT_UNIQUE_CONSTRAINTS = new Set([
  "workouts_one_active_per_user",
  "physical_goals_one_active_per_user",
]);

export interface SyncFailureContext {
  /**
   * Reste-t-il, au moment de l'échec, d'autres opérations dans la file de
   * cet utilisateur (hors celle qui vient d'échouer) ? Si oui, l'une
   * d'elles peut encore créer la ligne parente manquante.
   */
  hasOtherQueuedOperations: boolean;
  /**
   * Table locale et type de l'opération qui a échoué. Nécessaires depuis le
   * chantier 8 : le verdict d'une violation d'unicité (`23505`) dépend de la
   * CONTRAINTE concernée, et la table + le type d'opération permettent de
   * l'identifier même quand le nom de contrainte n'est pas extractible du
   * message (cf. `classifyUniqueViolation`). Optionnels : sans eux, un
   * `23505` est classé de la façon la plus conservatrice — définitif, donc
   * `blocked` visible plutôt qu'une boucle de retry.
   */
  table?: string;
  opType?: SyncOpType;
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
 * Nom de la contrainte violée, tel que PostgreSQL le place dans le message
 * (`duplicate key value violates unique constraint "…"`, relevé directement
 * sur la base). `null` si le message ne le porte pas — la classification
 * retombe alors sur la déduction par le schéma, cf. `classifyUniqueViolation`.
 */
export function extractConstraintName(error: Pick<SyncErrorDetails, "message">): string | null {
  const match = /constraint\s+"([^"]+)"/i.exec(error.message ?? "");
  return match?.[1] ?? null;
}

/**
 * Que faire d'une violation d'unicité (`23505`) ?
 *
 * - `remappable-sequence` : la valeur en collision est un NUMÉRO D'ORDRE
 *   attribué par le client (`exercise_sets.set_number`, cf.
 *   `uniqueSequenceRemap.ts`). Le moteur la recalcule et renvoie l'opération —
 *   jamais de blocage, jamais de perte : la série existe toujours, avec toutes
 *   ses données, simplement décalée d'un cran.
 * - `state-dependent` : contrainte partielle « une seule ligne active »,
 *   levable par une autre opération de la file (cf.
 *   `STATE_DEPENDENT_UNIQUE_CONSTRAINTS`).
 * - `definitive` : la valeur en collision APPARTIENT à l'utilisateur (nom
 *   d'une collection) ou identifie la ligne (séance analysée, URL source).
 *   Un retry à l'identique échouera toujours et la réécrire d'office
 *   altérerait sa donnée : l'opération est bloquée, VISIBLE, et attend son
 *   arbitrage. Rien n'est supprimé — la donnée locale reste intacte.
 *
 * DÉDUCTION PAR LE SCHÉMA quand le nom de contrainte manque : sur une table
 * qui porte une règle de séquence, un `create` ne peut pas violer la clé
 * primaire (le moteur l'envoie en `upsert onConflict: "id"`, qui met à jour
 * au lieu d'insérer) — la seule autre contrainte unique de `exercise_sets`
 * est donc `(exercise_id, set_number)`. La classification ne dépend ainsi
 * jamais du seul texte anglais d'un message serveur.
 */
export type UniqueViolationKind = "remappable-sequence" | "state-dependent" | "definitive";

export function classifyUniqueViolation(
  error: Pick<SyncErrorDetails, "message">,
  context: Pick<SyncFailureContext, "table" | "opType">,
): UniqueViolationKind {
  const constraintName = extractConstraintName(error);
  const rule = context.table ? uniqueSequenceRuleFor(context.table) : null;

  if (constraintName) {
    if (rule && constraintName === rule.constraintName) return "remappable-sequence";
    if (STATE_DEPENDENT_UNIQUE_CONSTRAINTS.has(constraintName)) return "state-dependent";
    // Nom connu mais AUTRE contrainte de la même table : on ne remappe
    // surtout pas — le numéro d'ordre n'est pas en cause.
    return "definitive";
  }

  if (rule && context.opType === "create") return "remappable-sequence";
  return "definitive";
}

/**
 * Cette erreur doit-elle figer l'opération en `blocked` (plus aucun retry
 * automatique) ? Vrai uniquement pour une erreur explicitement identifiée
 * comme définitive — jamais pour un souci réseau (sans code Postgres), et
 * jamais pour une dépendance encore satisfiable par la file (cf.
 * `DEPENDENCY_PG_ERROR_CODES`).
 */
export function isBlockingSyncError(
  error: Pick<SyncErrorDetails, "code" | "message">,
  context: SyncFailureContext,
): boolean {
  if (!error.code || !NON_RETRYABLE_PG_ERROR_CODES.has(error.code)) return false;
  if (error.code === UNIQUE_VIOLATION_PG_ERROR_CODE) {
    const kind = classifyUniqueViolation(error, context);
    // CHANTIER 8 (A1) — une collision de numéro d'ordre ne bloque JAMAIS :
    // c'est le moteur qui la résout en recalculant le numéro
    // (`syncEngine.remapUniqueSequence`). La figer en `blocked` est
    // exactement ce qui retenait la clôture de séance indéfiniment, puisque
    // `blocked` compte comme dépendance vivante pour la barrière.
    if (kind === "remappable-sequence") return false;
    if (kind === "state-dependent") return !context.hasOtherQueuedOperations;
    return true;
  }
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
  // CHANTIER 8 (A1) — une collision de NUMÉRO DE SÉRIE ne remonte jamais
  // jusqu'ici : le moteur la remappe et l'opération repart (cf.
  // `classifyUniqueViolation`). Ce libellé ne concerne donc que les
  // violations d'unicité portant sur une valeur de l'utilisateur (nom d'une
  // collection déjà pris, séance déjà analysée, recette déjà importée depuis
  // ce lien) — le détail technique reste affiché juste à côté par le panneau.
  "23505": "Cette valeur existe déjà côté serveur — modifiez-la avant de réessayer.",
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
