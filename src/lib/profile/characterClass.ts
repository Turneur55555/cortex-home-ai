// ============================================================
// Classe principale — présentation RPG de la famille d'exercices dominante.
// Domaine pur, zéro import React. Ne redéfinit aucune règle métier : la
// classification par famille vient telle quelle de
// `lib/fitness/rank/familyClassification.ts` (moteur Rang/Maîtrise, non
// modifié) ; ce module se contente d'agréger le volume déjà loggé par
// famille (même logique que `computeBroadActivity`) et d'y accoler un nom
// de classe pour l'écran Profil.
// ============================================================

import { classifyExerciseFamily } from "@/lib/fitness/rank/familyClassification";
import type { ExerciseFamily } from "@/lib/fitness/rank/types";
import type { RankState } from "@/lib/fitness/exerciseRanks";

/**
 * Un même mouvement de poussée (couché ou militaire) donne la même classe :
 * la distinction fine appartient au moteur de rang, pas à cette étiquette
 * narrative. `isolation` est le repli du classifieur pour tout mouvement non
 * reconnu (curls, extensions, écartés, abdos...) — présenté comme "Polyvalent"
 * plutôt que comme une fausse spécialisation.
 */
export const CHARACTER_CLASS_LABELS: Record<ExerciseFamily, string> = {
  squat_presse_jambes: "Maître des Fondations",
  deadlift_tirage_hanche: "Maître des Hanches",
  developpe_couche: "Maître des Poussées",
  developpe_militaire: "Maître des Poussées",
  tirage_traction_dos: "Maître des Tirages",
  poids_de_corps: "Maître de la Préhension",
  isolation: "Maître Polyvalent",
};

export interface CharacterClassFamilyShare {
  family: ExerciseFamily;
  className: string;
  volume: number;
  /** Part du volume total, 0..100. */
  share: number;
  sessionsCount: number;
  exerciseCount: number;
  topExerciseName: string | null;
  bestRank: RankState | null;
}

export interface CharacterClassResult {
  family: ExerciseFamily;
  className: string;
  dominantShare: number;
  totalVolume: number;
  /** Triée par volume décroissant — la première entrée est la classe principale. */
  breakdown: CharacterClassFamilyShare[];
  bestRankInFamily: RankState | null;
}

interface WorkoutExerciseLike {
  name: string;
  weight: number | null;
  sets: number | null;
  reps: number | null;
}

interface WorkoutLike {
  date: string;
  exercises?: WorkoutExerciseLike[] | null;
}

interface RankProbeLike {
  name: string;
  rank: RankState;
}

export function computeCharacterClass(
  workouts: WorkoutLike[] | null | undefined,
  rankProbes: RankProbeLike[] = [],
): CharacterClassResult | null {
  if (!workouts || workouts.length === 0) return null;

  const volumeByFamily = new Map<ExerciseFamily, number>();
  const datesByFamily = new Map<ExerciseFamily, Set<string>>();
  const exerciseFreqByFamily = new Map<ExerciseFamily, Map<string, number>>();
  let totalVolume = 0;

  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      if (!ex.name) continue;
      // Même repli que computeBroadActivity : une ligne peut stocker soit un
      // poids explicite + reps, soit (pour le poids de corps) des séries+reps.
      const hasExplicitWeight = ex.weight != null;
      const reps = hasExplicitWeight ? ex.reps : (ex.sets ?? ex.reps);
      const weight = hasExplicitWeight ? ex.weight : ex.sets != null ? ex.reps : null;
      if (weight == null) continue;

      const family = classifyExerciseFamily(ex.name);
      const vol = (reps ?? 1) * weight;
      volumeByFamily.set(family, (volumeByFamily.get(family) ?? 0) + vol);
      totalVolume += vol;

      if (!datesByFamily.has(family)) datesByFamily.set(family, new Set());
      datesByFamily.get(family)!.add(w.date);

      if (!exerciseFreqByFamily.has(family)) exerciseFreqByFamily.set(family, new Map());
      const freq = exerciseFreqByFamily.get(family)!;
      const name = ex.name.trim();
      freq.set(name, (freq.get(name) ?? 0) + 1);
    }
  }

  if (totalVolume === 0) return null;

  const bestRankByFamily = new Map<ExerciseFamily, RankState>();
  for (const probe of rankProbes) {
    const family = classifyExerciseFamily(probe.name);
    const existing = bestRankByFamily.get(family);
    if (!existing || probe.rank.tierIndex > existing.tierIndex) {
      bestRankByFamily.set(family, probe.rank);
    }
  }

  const breakdown = Array.from(volumeByFamily.entries())
    .map(([family, volume]): CharacterClassFamilyShare => {
      const freq = exerciseFreqByFamily.get(family)!;
      const topExerciseName =
        Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        family,
        className: CHARACTER_CLASS_LABELS[family],
        volume,
        share: Math.round((volume / totalVolume) * 100),
        sessionsCount: datesByFamily.get(family)?.size ?? 0,
        exerciseCount: freq.size,
        topExerciseName,
        bestRank: bestRankByFamily.get(family) ?? null,
      };
    })
    .sort((a, b) => b.volume - a.volume);

  const dominant = breakdown[0];
  return {
    family: dominant.family,
    className: dominant.className,
    dominantShare: dominant.share,
    totalVolume,
    breakdown,
    bestRankInFamily: dominant.bestRank,
  };
}
