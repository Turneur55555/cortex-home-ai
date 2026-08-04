// ============================================================
// Récapitulatif de fin de séance (2e écran) — assemblage PUR, zéro React.
//
// Ne calcule aucune nouvelle règle métier : réutilise `setsTonnage` /
// `isValidSet` (lib/fitness/sets.ts) et se contente d'agréger ce que la
// séance clôturée contient déjà (exercices, séries, tonnage). Aucune
// donnée dupliquée, aucune requête : l'appelant fournit le snapshot de la
// séance qu'il possède déjà.
// ============================================================

import { isValidSet, setsTonnage, type WorkingSet } from "@/lib/fitness/sets";

export interface RecapExercise {
  id: string;
  name: string;
  /** Chemin storage de la photo perso (résolu en URL signée par l'appelant). */
  imagePath: string | null;
  /** Nombre de séries valides réalisées. */
  sets: number;
}

export interface SessionRecap {
  /** Nombre TOTAL de séries de la séance. */
  totalSets: number;
  /** Volume TOTAL en kg (tonnage). */
  totalVolumeKg: number;
  exercises: RecapExercise[];
}

interface RecapSourceExercise {
  id: string;
  name: string | null;
  image_path?: string | null;
  exercise_sets?: ReadonlyArray<WorkingSet> | null;
  /** Repli pour une saisie sans séries détaillées. */
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
}

/** Séries + tonnage d'un exercice, avec repli sur la saisie agrégée (sets × reps × poids). */
function summarize(ex: RecapSourceExercise): { sets: number; volume: number } {
  const detailed = (ex.exercise_sets ?? []).filter(isValidSet);
  if (detailed.length > 0) {
    return { sets: detailed.length, volume: setsTonnage(detailed) };
  }
  const sets = ex.sets ?? 0;
  const reps = ex.reps ?? 0;
  const weight = ex.weight ?? 0;
  if (sets > 0 && reps > 0 && weight > 0) {
    return { sets, volume: sets * reps * weight };
  }
  return { sets: Math.max(0, sets), volume: 0 };
}

/** Récapitulatif d'une séance de musculation à partir de ses exercices. */
export function buildSessionRecap(exercises: ReadonlyArray<RecapSourceExercise>): SessionRecap {
  let totalSets = 0;
  let totalVolumeKg = 0;
  const list: RecapExercise[] = [];

  for (const ex of exercises) {
    const { sets, volume } = summarize(ex);
    totalSets += sets;
    totalVolumeKg += volume;
    list.push({
      id: ex.id,
      name: ex.name || "Exercice",
      imagePath: ex.image_path ?? null,
      sets,
    });
  }

  return { totalSets, totalVolumeKg: Math.round(totalVolumeKg), exercises: list };
}

/** Récapitulatif d'une séance générique (segments) — pas de tonnage. */
export function buildGenericSessionRecap(
  segments: ReadonlyArray<{ id: string; label: string; completed?: boolean }>,
): SessionRecap {
  const exercises = segments.map((s) => ({
    id: s.id,
    name: s.label || "Segment",
    imagePath: null,
    sets: 1,
  }));
  return { totalSets: exercises.length, totalVolumeKg: 0, exercises };
}

/** Date lisible pour la carte ("mardi 4 août 2026" — affichée en majuscules par la carte). */
export function formatRecapDate(date: Date = new Date()): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
