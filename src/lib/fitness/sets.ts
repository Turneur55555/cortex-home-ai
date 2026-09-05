import { estimate1RM } from "./strength";
export interface WorkingSet {
  reps: number | null | undefined;
  weight: number | null | undefined;
}
export function isValidSet(s: WorkingSet | null | undefined): boolean {
  if (!s) return false;
  const { reps, weight } = s;
  return (
    reps != null &&
    weight != null &&
    Number.isFinite(reps) &&
    Number.isFinite(weight) &&
    reps > 0 &&
    weight > 0
  );
}
export function setsTonnage(sets: ReadonlyArray<WorkingSet> | null | undefined): number {
  if (!sets || sets.length === 0) return 0;
  return sets.reduce(
    (acc, s) => (isValidSet(s) ? acc + (s.reps as number) * (s.weight as number) : acc),
    0,
  );
}
export function bestEstimated1RM(
  sets: ReadonlyArray<WorkingSet> | null | undefined,
): number | null {
  if (!sets || sets.length === 0) return null;
  let best: number | null = null;
  for (const s of sets) {
    if (!isValidSet(s)) continue;
    const rm = estimate1RM(s.weight, s.reps);
    if (rm != null && (best == null || rm > best)) best = rm;
  }
  return best;
}
export function topSet(sets: ReadonlyArray<WorkingSet> | null | undefined): WorkingSet | null {
  if (!sets || sets.length === 0) return null;
  let best: WorkingSet | null = null;
  for (const s of sets) {
    if (!isValidSet(s)) continue;
    if (
      best == null ||
      (s.weight as number) > (best.weight as number) ||
      ((s.weight as number) === (best.weight as number) &&
        (s.reps as number) > (best.reps as number))
    )
      best = s;
  }
  return best;
}
export function totalReps(sets: ReadonlyArray<WorkingSet> | null | undefined): number {
  if (!sets || sets.length === 0) return 0;
  return sets.reduce((acc, s) => (isValidSet(s) ? acc + (s.reps as number) : acc), 0);
}
export interface SetsSummary {
  setCount: number;
  tonnage: number;
  best1RM: number | null;
  totalReps: number;
}
export function summarizeSets(sets: ReadonlyArray<WorkingSet> | null | undefined): SetsSummary {
  const valid = (sets ?? []).filter(isValidSet);
  return {
    setCount: valid.length,
    tonnage: setsTonnage(sets),
    best1RM: bestEstimated1RM(sets),
    totalReps: totalReps(sets),
  };
}

// ============================================================
// CHANTIER 9 (C1) — SAISIE D'UNE SÉRIE : DU TEXTE VERS LA DONNÉE MÉTIER.
//
// POURQUOI CE BLOC EXISTE
// -----------------------
// La carte d'exercice convertissait la saisie ainsi :
//     const parse = (v: string) => (v.trim() === "" ? null : Number(v));
// `Number("abc")`, `Number("12,5")` (virgule française) et `Number("-")`
// valent tous `NaN`. Ce `NaN` partait tel quel dans la mutation, était écrit
// dans le store local (IndexedDB conserve `NaN`, contrairement à JSON) et
// n'arrivait au serveur qu'en `null` (`JSON.stringify(NaN) === "null"`) :
// la donnée locale et la donnée serveur divergeaient silencieusement, et
// l'écran réaffichait la chaîne « NaN » dans le champ.
//
// Rien ne bornait non plus la valeur. Or les colonnes réelles (relevées sur
// le projet `bcwfvpwxzlmkxobvbtzp`) sont `exercise_sets.reps smallint` et
// `exercise_sets.weight numeric(6,2)` : au-delà, PostgREST renvoie `22003`
// (numeric_field_overflow), code classé nulle part dans
// `NON_RETRYABLE_PG_ERROR_CODES` — l'opération aurait donc épuisé ses
// tentatives puis serait passée `blocked`, statut qui RETIENT la clôture de
// séance (barrière du chantier 1 bis). Une faute de frappe pouvait ainsi
// bloquer une séance entière.
//
// LES TROIS ISSUES, EXPLICITES
// ----------------------------
// - `cleared`  : le champ est vide → `null` assumé (l'utilisateur efface).
// - `value`    : valeur exploitable, NORMALISÉE comme la colonne le ferait
//                (entier pour `reps`, deux décimales pour `weight`) — c'est
//                ce que la base stockerait de toute façon ; l'appliquer côté
//                client évite que le local et le serveur ne diffèrent.
// - `invalid`  : saisie inexploitable → RIEN n'est écrit. Surtout pas `null`,
//                qui effacerait une valeur valide saisie auparavant.
// ============================================================

export type SetFieldName = "reps" | "weight";

/**
 * Bornes RÉELLES des colonnes, vérifiées en base (`information_schema.columns`,
 * projet `bcwfvpwxzlmkxobvbtzp`) :
 * - `reps`   : `smallint`       → entier, max 32767 ;
 * - `weight` : `numeric(6,2)`   → 4 chiffres avant la virgule, 2 après.
 * Le minimum est 0 dans les deux cas : le poids de corps se saisit à 0 kg
 * (20 séries en production), une valeur NÉGATIVE n'a en revanche aucun sens.
 */
export const SET_FIELD_LIMITS: Record<SetFieldName, { max: number; decimals: number }> = {
  reps: { max: 32767, decimals: 0 },
  weight: { max: 9999.99, decimals: 2 },
};

export type ParsedSetField =
  | { kind: "cleared" }
  | { kind: "value"; value: number }
  | { kind: "invalid"; reason: "not-a-number" | "negative" | "out-of-range" };

/**
 * Nombre décimal simple, éventuellement signé. Volontairement plus strict que
 * `Number()` : sans ce filtre, `"1e3"`, `"0x10"` et `"Infinity"` — que
 * `<input type="number">` laisse passer tels quels dans `value` — seraient
 * acceptés comme des charges valides.
 */
const DECIMAL_INPUT = /^[+-]?(\d+\.?\d*|\.\d+)$/;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Convertit la saisie brute d'un champ de série en donnée métier.
 * Tolère l'espace et la virgule décimale française (« 12,5 »), comme le
 * journal alimentaire le fait déjà (`lib/nutrition/weight.ts::parseDecimal`).
 *
 * NE PRODUIT JAMAIS `NaN`, jamais de valeur négative, jamais de valeur hors
 * des bornes de la colonne.
 */
export function parseSetFieldInput(field: SetFieldName, raw: string): ParsedSetField {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  if (cleaned === "") return { kind: "cleared" };
  if (!DECIMAL_INPUT.test(cleaned)) return { kind: "invalid", reason: "not-a-number" };

  const parsed = Number(cleaned);
  // `DECIMAL_INPUT` garantit déjà un nombre fini ; ce contrôle reste le
  // dernier rempart contre un `NaN` qui atteindrait la donnée métier.
  if (!Number.isFinite(parsed)) return { kind: "invalid", reason: "not-a-number" };
  if (parsed < 0) return { kind: "invalid", reason: "negative" };

  const limits = SET_FIELD_LIMITS[field];
  const value = roundTo(parsed, limits.decimals);
  if (value > limits.max) return { kind: "invalid", reason: "out-of-range" };
  return { kind: "value", value };
}

// ============================================================
// CHANTIER 9 (A2) — RÉSUMÉ `exercises.sets/reps/weight` À LA CLÔTURE.
//
// Ces trois colonnes sont l'ancien format (antérieur à `exercise_sets`) et
// restent lues par l'historique et par « Refaire en live ». `useFinishWorkout`
// les resynchronise à la clôture ; la règle métier est reprise ICI À
// L'IDENTIQUE (aucun changement de comportement), simplement sortie du hook
// pour être testable et pour que le hook puisse la comparer à la valeur déjà
// stockée avant d'écrire.
// ============================================================

export interface ExerciseHistorySummary {
  sets: number | null;
  reps: number | null;
  weight: number | null;
}

/** Série telle que la clôture la lit : une série exploitable, validée ou non. */
export interface CompletableSet extends WorkingSet {
  completed?: boolean | null;
}

/**
 * Résumé d'un exercice à partir de ses séries réelles.
 *
 * Règle INCHANGÉE depuis H2/H3 : seules les séries exploitables comptent
 * (`isValidSet` — reps et charge strictement positives) ; si au moins une est
 * VALIDÉE, seules les validées font foi ; le couple reps/charge retenu est
 * celui de la série la plus lourde (départage par le nombre de répétitions).
 *
 * SEUL AJOUT : un exercice sans aucune série exploitable renvoie désormais un
 * résumé VIDE (`null`) au lieu de « ne rien dire ». L'appelant peut ainsi
 * écrire la vérité de la séance close, sans jamais laisser en place un résumé
 * qui ne correspond à aucune série.
 */
export function summarizeExerciseSetsForHistory(
  sets: ReadonlyArray<CompletableSet> | null | undefined,
): ExerciseHistorySummary {
  const filled = (sets ?? []).filter(isValidSet);
  const done = filled.filter((s) => s.completed === true);
  const source = done.length > 0 ? done : filled;
  const top = topSet(source);
  if (source.length === 0 || top == null) return { sets: null, reps: null, weight: null };
  return { sets: source.length, reps: top.reps ?? null, weight: top.weight ?? null };
}
