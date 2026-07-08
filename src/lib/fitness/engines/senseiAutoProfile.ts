// ============================================================
// Profil d'entraînement Sensei (musculation) — domaine pur, zéro React.
//
// Remplace les questions "Quel est ton niveau ?" / "Quel est ton
// objectif ?" du dialogue Sensei : au lieu de les demander, ce module
// construit un véritable profil d'entraînement à partir de
// l'historique réel de séances déjà enregistrées — charges, séries,
// répétitions, volume par séance et par semaine PAR GROUPE MUSCULAIRE,
// surcharge progressive et tendance PAR EXERCICE (pas juste une
// moyenne globale), records personnels, fréquence, muscles les plus et
// les moins sollicités, durée moyenne de séance et repos moyen entre
// séries quand ces données existent. `level`/`goal` restent exposés
// comme résumé compact (utilisés pour le cadrage général du prompt IA),
// mais l'essentiel de la valeur est dans les données structurées
// (`exerciseProgress`, `muscleVolume`, ...) que StrengthWorkoutEngine
// transmet telles quelles à l'edge `coach-workout` pour une vraie
// adaptation de la programmation plutôt qu'un simple choix de
// catégorie. Plus l'historique s'étoffe, plus chaque champ se précise —
// aucun seuil binaire "assez/pas assez de séances", chaque signal se
// dégrade individuellement (ex: sessionsTracked=1 → trend "nouveau",
// pas de tentative de deviner une tendance).
//
// NB : le RIR n'entre pas dans le calcul — la colonne exercise_sets.rpe
// a été supprimée le 02/07/2026 ("pas de RPE dans l'app", voir
// 20260702100030_seances_status_completed_drop_rpe.sql) : aucune
// donnée n'existe pour ce signal.
// ============================================================

import { exerciseToMuscles, MUSCLE_META, type MuscleId } from "@/lib/fitness/muscleMapping";

export type AutoLevel = "débutant" | "intermédiaire" | "avancé";
export type AutoGoal = "hypertrophie" | "force" | "endurance" | "perte de poids";
export type ExerciseTrend = "progression" | "stagnation" | "regression" | "nouveau";

export interface AutoProfileSet {
  reps: number | null;
  weight: number | null;
  completed?: boolean | null;
  rest_seconds?: number | null;
}

export interface AutoProfileExercise {
  name: string;
  exercise_sets?: AutoProfileSet[] | null;
}

export interface AutoProfileWorkout {
  date: string; // YYYY-MM-DD
  discipline?: string | null;
  duration_minutes?: number | null;
  exercises?: AutoProfileExercise[] | null;
}

/** Progression d'un exercice suivi individuellement (pas une moyenne
 *  globale) — voir en-tête de fichier. */
export interface ExerciseProgress {
  name: string;
  muscles: MuscleId[];
  trend: ExerciseTrend;
  sessionsTracked: number;
  lastWeight: number;
  personalRecord: number;
}

/** Volume hebdomadaire moyen (tonnage) par groupe musculaire, sur les
 *  semaines réellement entraînées. */
export interface MuscleVolumeEntry {
  muscle: MuscleId;
  weeklyVolume: number;
}

export interface SenseiAutoProfile {
  level: AutoLevel;
  goal: AutoGoal;
  /** Nombre de séances musculation réellement prises en compte — permet à
   *  l'appelant de nuancer la confiance de l'estimation. */
  sessionsConsidered: number;
  weeklyFrequency: number;
  /** null si aucune séance musculation n'a de duration_minutes renseignée. */
  avgSessionDurationMinutes: number | null;
  /** null si aucune série n'a de rest_seconds renseigné (donnée optionnelle). */
  avgRestSeconds: number | null;
  /** Triés par volume décroissant, uniquement les groupes avec du volume réel. */
  muscleVolume: MuscleVolumeEntry[];
  mostTrainedMuscles: MuscleId[];
  leastTrainedMuscles: MuscleId[];
  /** Triés par nombre de séances suivies décroissant, borné à 8 entrées. */
  exerciseProgress: ExerciseProgress[];
}

const EMPTY_PROFILE: Omit<SenseiAutoProfile, "sessionsConsidered"> = {
  level: "intermédiaire",
  goal: "hypertrophie",
  weeklyFrequency: 0,
  avgSessionDurationMinutes: null,
  avgRestSeconds: null,
  muscleVolume: [],
  mostTrainedMuscles: [],
  leastTrainedMuscles: [],
  exerciseProgress: [],
};

const MAX_TRACKED_EXERCISES = 8;
const ALL_MUSCLES = Object.keys(MUSCLE_META) as MuscleId[];

/** Semaine ISO-ish simplifiée (année + n° de semaine depuis le 1er janvier),
 *  même convention que src/lib/profile/achievements/muscleVolume.ts. */
function weekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const firstJan = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - firstJan.getTime()) / 86_400_000);
  return `${d.getFullYear()}-W${Math.floor((days + firstJan.getDay()) / 7)}`;
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : 0;
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function inferSenseiAutoProfile(
  workouts: ReadonlyArray<AutoProfileWorkout> | null | undefined,
): SenseiAutoProfile {
  const sessions = (workouts ?? [])
    .filter((w) => (w.discipline ?? "muscu") === "muscu")
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (sessions.length === 0) {
    return { ...EMPTY_PROFILE, sessionsConsidered: 0 };
  }

  let totalSets = 0;
  let totalReps = 0;
  const sessionDurations: number[] = [];
  const restSeconds: number[] = [];
  const weeklyTonnage = new Map<string, number>();
  const weeklyMuscleTonnage = new Map<string, Map<MuscleId, number>>();
  // Historique chronologique {date, weight} par exercice — alimente à la
  // fois la surcharge progressive individuelle et les records personnels.
  const historyByExercise = new Map<string, { name: string; entries: Array<{ weight: number }> }>();

  for (const w of sessions) {
    if (w.duration_minutes != null && w.duration_minutes > 0) {
      sessionDurations.push(w.duration_minutes);
    }
    const wk = weekKey(w.date);
    const muscleTonnage = weeklyMuscleTonnage.get(wk) ?? new Map<MuscleId, number>();
    let sessionTonnage = 0;

    for (const ex of w.exercises ?? []) {
      const validSets = (ex.exercise_sets ?? []).filter(
        (s) => s.completed !== false && s.reps != null && s.reps > 0,
      );
      if (validSets.length === 0) continue;

      let topWeight = 0;
      let exerciseTonnage = 0;
      for (const s of validSets) {
        totalSets += 1;
        totalReps += s.reps ?? 0;
        if (s.rest_seconds != null && s.rest_seconds > 0) restSeconds.push(s.rest_seconds);
        const weight = s.weight ?? 0;
        if (weight > 0) {
          const setTonnage = weight * (s.reps ?? 0);
          exerciseTonnage += setTonnage;
          if (weight > topWeight) topWeight = weight;
        }
      }

      if (exerciseTonnage > 0) {
        sessionTonnage += exerciseTonnage;
        for (const muscle of exerciseToMuscles(ex.name)) {
          muscleTonnage.set(muscle, (muscleTonnage.get(muscle) ?? 0) + exerciseTonnage);
        }
      }

      if (topWeight > 0) {
        const key = ex.name.trim().toLowerCase();
        const entry = historyByExercise.get(key) ?? { name: ex.name.trim(), entries: [] };
        entry.entries.push({ weight: topWeight });
        historyByExercise.set(key, entry);
      }
    }

    if (sessionTonnage > 0) {
      weeklyTonnage.set(wk, (weeklyTonnage.get(wk) ?? 0) + sessionTonnage);
    }
    weeklyMuscleTonnage.set(wk, muscleTonnage);
  }

  // Séances enregistrées mais sans aucune série validée exploitable (ex:
  // séances abandonnées en cours) — aucun signal réel, on retombe sur un
  // profil vide plutôt que de déduire quoi que ce soit d'un historique nul.
  if (totalSets === 0) {
    return { ...EMPTY_PROFILE, sessionsConsidered: sessions.length };
  }

  const avgRepsPerSet = totalReps / totalSets;

  const firstDate = new Date(sessions[0].date);
  const lastDate = new Date(sessions[sessions.length - 1].date);
  const weeksSpan = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (7 * 86_400_000));
  const weeklyFrequency = sessions.length / weeksSpan;

  // ---- Progression individuelle par exercice (pas une moyenne globale) ----
  const exerciseProgress: ExerciseProgress[] = [];
  for (const { name, entries } of historyByExercise.values()) {
    const weights = entries.map((e) => e.weight);
    const sessionsTracked = weights.length;
    const lastWeight = weights[weights.length - 1];
    const personalRecord = Math.max(...weights);

    let trend: ExerciseTrend;
    if (sessionsTracked < 2) {
      trend = "nouveau";
    } else {
      const first = weights[0];
      trend = lastWeight > first ? "progression" : lastWeight < first ? "regression" : "stagnation";
    }

    exerciseProgress.push({
      name,
      muscles: exerciseToMuscles(name),
      trend,
      sessionsTracked,
      lastWeight,
      personalRecord,
    });
  }
  exerciseProgress.sort((a, b) => b.sessionsTracked - a.sessionsTracked);
  const trackedExerciseProgress = exerciseProgress.slice(0, MAX_TRACKED_EXERCISES);

  const withTrend = exerciseProgress.filter((e) => e.trend !== "nouveau");
  const progressingCount = withTrend.filter((e) => e.trend === "progression").length;
  const recentPRCount = exerciseProgress.filter(
    (e) => e.sessionsTracked >= 2 && e.lastWeight >= e.personalRecord,
  ).length;
  const progressionRatio = withTrend.length > 0 ? progressingCount / withTrend.length : 0;

  // ---- Volume hebdomadaire par groupe musculaire ----
  const weeks = Array.from(weeklyTonnage.keys()).sort();
  const totalPerMuscle = new Map<MuscleId, number>();
  for (const muscleTonnage of weeklyMuscleTonnage.values()) {
    for (const [muscle, tonnage] of muscleTonnage) {
      totalPerMuscle.set(muscle, (totalPerMuscle.get(muscle) ?? 0) + tonnage);
    }
  }
  const weeksWithData = Math.max(1, weeks.length);
  const muscleVolume: MuscleVolumeEntry[] = Array.from(totalPerMuscle.entries())
    .map(([muscle, total]) => ({ muscle, weeklyVolume: round(total / weeksWithData) }))
    .filter((m) => m.weeklyVolume > 0)
    .sort((a, b) => b.weeklyVolume - a.weeklyVolume);

  const mostTrainedMuscles = muscleVolume.slice(0, 3).map((m) => m.muscle);
  const trainedMuscleIds = new Set(muscleVolume.map((m) => m.muscle));
  const neverTrained = ALL_MUSCLES.filter((m) => !trainedMuscleIds.has(m));
  const ascendingTrained = [...muscleVolume].sort((a, b) => a.weeklyVolume - b.weeklyVolume);
  const leastTrainedMuscles = [...neverTrained, ...ascendingTrained.map((m) => m.muscle)].slice(
    0,
    3,
  );

  // ---- Tendance de volume hebdomadaire : moitié récente vs moitié ancienne
  // des semaines réellement entraînées (plus robuste face à un rythme
  // d'entraînement irrégulier qu'une comparaison séance par séance). ----
  const mid = Math.floor(weeks.length / 2);
  const olderAvg = average(weeks.slice(0, mid).map((w) => weeklyTonnage.get(w)!));
  const recentAvg = average(weeks.slice(mid).map((w) => weeklyTonnage.get(w)!));
  const tonnageTrend = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

  // ---- Niveau : plus de séances, plus de fréquence, une surcharge qui
  // tient dans la durée et un travail musculaire large font monter le score.
  let levelScore = 0;
  if (sessions.length >= 25) levelScore += 2;
  else if (sessions.length >= 8) levelScore += 1;
  if (weeklyFrequency >= 2.5) levelScore += 2;
  else if (weeklyFrequency >= 1.2) levelScore += 1;
  if (progressionRatio >= 0.5) levelScore += 1;
  if (recentPRCount >= 2) levelScore += 1;
  if (muscleVolume.length >= 6) levelScore += 1;

  const level: AutoLevel =
    levelScore >= 6 ? "avancé" : levelScore >= 3 ? "intermédiaire" : "débutant";

  // ---- Objectif : la plage de répétitions réellement pratiquée reste le
  // signal principal ; au-delà de 12 reps, une fréquence élevée sans
  // surcharge de volume distingue un profil "dépense/perte de poids" d'une
  // vraie progression d'endurance structurée.
  let goal: AutoGoal;
  if (avgRepsPerSet <= 6) {
    goal = "force";
  } else if (avgRepsPerSet <= 12) {
    goal = "hypertrophie";
  } else if (weeklyFrequency >= 3 && tonnageTrend <= 0) {
    goal = "perte de poids";
  } else {
    goal = "endurance";
  }

  return {
    level,
    goal,
    sessionsConsidered: sessions.length,
    weeklyFrequency: round(weeklyFrequency, 1),
    avgSessionDurationMinutes:
      sessionDurations.length > 0 ? round(average(sessionDurations)) : null,
    avgRestSeconds: restSeconds.length > 0 ? round(average(restSeconds)) : null,
    muscleVolume,
    mostTrainedMuscles,
    leastTrainedMuscles,
    exerciseProgress: trackedExerciseProgress,
  };
}
