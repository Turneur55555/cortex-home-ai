/**
 * LE RÉCAP DE CLÔTURE : LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB, zéro couleur), conformément à
 * `/src/lib`. Avant que « Terminer » ne close la séance, un récap dit ce qui va être enregistré.
 *
 * ── Le constat (production, 09/10 → 30/10/2026) ──
 * En séance live, 1 à 3 séries par séance restaient saisies (charge, répétitions) mais NON
 * cochées — 15 validées sur 18 le 30/10. Une série non cochée n'est pas faite : elle ne compte ni
 * pour le record, ni pour le rang, ni pour l'objectif, ni pour le tonnage — et « Terminer » ne
 * prévenait pas. Le joueur perdait des séries qu'il avait peut-être faites, sans le savoir.
 * Les séances saisies après coup via « Refaire en live » s'enregistraient en « 1 min ».
 *
 * ── La règle ──
 * - une série NON cochée qui porte des répétitions exploitables est « en suspens » : le joueur
 *   tranche, d'un seul geste, entre « les compter » (elles sont validées) et « terminer sans
 *   elles » (elles sont retirées). Jamais de choix silencieux à sa place ;
 * - une série non cochée SANS répétitions exploitables est vide : elle ne porte rien, elle est
 *   retirée dans les deux cas (elle n'aurait jamais compté) ;
 * - la durée affichée est celle que la clôture enregistrerait ; le joueur peut la corriger, entre
 *   1 et `MAX_PLAUSIBLE_SESSION_MINUTES` minutes (au-delà, l'affichage la tiendrait de toute façon
 *   pour inconnue — cf. `sessionDuration.ts`).
 */

import { MAX_PLAUSIBLE_SESSION_MINUTES } from "@/lib/fitness/sessionDuration";

export interface ReviewableSet {
  id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  completed: boolean | null;
}

export interface ReviewableExercise {
  id: string;
  name: string;
  exercise_sets: ReadonlyArray<ReviewableSet>;
}

/** Une série saisie mais pas cochée — ce que le récap montre au joueur. */
export interface PendingSet {
  setId: string;
  exerciseName: string;
  /** Rang de la série dans l'exercice, tel que l'écran l'affiche (1, 2, 3…). */
  position: number;
  reps: number;
  weight: number | null;
}

export interface ClosureReview {
  /** Séries cochées. */
  validatedSets: number;
  /** Séries non cochées qui portent des répétitions exploitables. */
  pendingSets: PendingSet[];
  /** Séries non cochées sans répétitions exploitables — retirées à la clôture. */
  emptySetIds: string[];
}

/** « Les compter » ou « terminer sans elles ». */
export type PendingSetsChoice = "count" | "drop";

/** Ce que la clôture doit écrire AVANT de passer la séance à `completed`. */
export interface ClosureDecision {
  validateSetIds: string[];
  removeSetIds: string[];
}

function hasExploitableReps(reps: number | null): reps is number {
  return typeof reps === "number" && Number.isFinite(reps) && reps > 0;
}

export function reviewSessionBeforeClosure(
  exercises: ReadonlyArray<ReviewableExercise> | null | undefined,
): ClosureReview {
  let validatedSets = 0;
  const pendingSets: PendingSet[] = [];
  const emptySetIds: string[] = [];

  for (const exercise of exercises ?? []) {
    const sorted = [...(exercise.exercise_sets ?? [])].sort((a, b) => a.set_number - b.set_number);
    sorted.forEach((set, index) => {
      if (set.completed === true) {
        validatedSets += 1;
        return;
      }
      if (hasExploitableReps(set.reps)) {
        pendingSets.push({
          setId: set.id,
          exerciseName: exercise.name,
          position: index + 1,
          reps: set.reps,
          weight: typeof set.weight === "number" && Number.isFinite(set.weight) ? set.weight : null,
        });
        return;
      }
      emptySetIds.push(set.id);
    });
  }

  return { validatedSets, pendingSets, emptySetIds };
}

/**
 * Traduit le choix du joueur en écritures. Sans série en suspens, le choix est sans objet
 * (`null`) : seules les séries vides sont retirées.
 */
export function closureDecision(
  review: ClosureReview,
  choice: PendingSetsChoice | null,
): ClosureDecision {
  const pendingIds = review.pendingSets.map((s) => s.setId);
  if (pendingIds.length === 0 || choice === null) {
    return { validateSetIds: [], removeSetIds: [...review.emptySetIds] };
  }
  if (choice === "count") {
    return { validateSetIds: pendingIds, removeSetIds: [...review.emptySetIds] };
  }
  return { validateSetIds: [], removeSetIds: [...pendingIds, ...review.emptySetIds] };
}

/**
 * Applique la décision à l'instantané de la séance — celui que l'écran de fin (carte récap,
 * bilan) lit après la clôture. Sans cela, des séries « comptées » y apparaîtraient non faites.
 */
export function applyClosureDecision<
  S extends ReviewableSet,
  E extends { exercise_sets: ReadonlyArray<S> },
  W extends { exercises: ReadonlyArray<E> },
>(workout: W, decision: ClosureDecision): W {
  const validate = new Set(decision.validateSetIds);
  const remove = new Set(decision.removeSetIds);
  if (validate.size === 0 && remove.size === 0) return workout;
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      exercise_sets: exercise.exercise_sets
        .filter((set) => !remove.has(set.id))
        .map((set) => (validate.has(set.id) ? { ...set, completed: true } : set)),
    })),
  };
}

export type DurationInput =
  | { kind: "empty" }
  | { kind: "value"; minutes: number }
  | { kind: "invalid" };

/**
 * Lecture de la durée saisie dans le récap : « 45 », « 45 min », « 1h10 », « 1 h », « 1h05 ».
 * Vide → la clôture calcule elle-même ; hors de [1, 240] ou illisible → refusé (rien n'est écrit).
 */
export function parseDurationInput(raw: string): DurationInput {
  const text = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (text === "") return { kind: "empty" };

  let minutes: number | null = null;
  const plain = /^(\d{1,3})(?:min|mn|m)?$/.exec(text);
  const hours = /^(\d{1,2})h(\d{1,2})?(?:min|mn|m)?$/.exec(text);
  if (plain) {
    minutes = Number(plain[1]);
  } else if (hours) {
    const m = hours[2] ? Number(hours[2]) : 0;
    if (m < 60) minutes = Number(hours[1]) * 60 + m;
  }

  if (minutes === null || !Number.isInteger(minutes)) return { kind: "invalid" };
  if (minutes < 1 || minutes > MAX_PLAUSIBLE_SESSION_MINUTES) return { kind: "invalid" };
  return { kind: "value", minutes };
}

/**
 * Durée à préremplir dans le récap : celle que la clôture enregistrerait, si elle est plausible.
 * Une durée implausible n'est jamais proposée comme un fait — le champ reste vide.
 */
export function durationFieldText(previewMinutes: number | null | undefined): string {
  if (typeof previewMinutes !== "number" || !Number.isFinite(previewMinutes)) return "";
  if (previewMinutes < 1 || previewMinutes > MAX_PLAUSIBLE_SESSION_MINUTES) return "";
  return String(Math.round(previewMinutes));
}

/** « 17,5 kg × 10 » — ou « 12 reps » au poids du corps. Virgule française, jamais d'arrondi. */
export function formatPendingSet(set: Pick<PendingSet, "reps" | "weight">): string {
  if (set.weight === null || set.weight <= 0) return `${set.reps} reps`;
  const kg = set.weight.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return `${kg} kg × ${set.reps}`;
}

/** Une durée de 1-2 minutes pour une séance qui porte des séries : typiquement saisie après coup. */
export function looksLoggedAfterTheFact(
  previewMinutes: number | null | undefined,
  validatedSets: number,
): boolean {
  return typeof previewMinutes === "number" && previewMinutes <= 2 && validatedSets >= 3;
}
