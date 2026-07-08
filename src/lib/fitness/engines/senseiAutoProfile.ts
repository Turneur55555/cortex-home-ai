// ============================================================
// Profil d'entraînement Sensei (musculation) — domaine pur, zéro React.
//
// Remplace les questions "Quel est ton niveau ?" / "Quel est ton
// objectif ?" du dialogue Sensei : au lieu de les demander, ce module
// construit un véritable profil d'entraînement à partir de TOUT
// l'historique disponible (voir useSenseiTrainingHistory.ts, pas les
// 60 dernières séances de useWorkouts()) — charges, séries,
// répétitions, volume par séance et par semaine PAR GROUPE MUSCULAIRE,
// surcharge progressive et tendance PAR EXERCICE (fenêtre récente vs
// fenêtre antérieure, pas juste premier-vs-dernier sur tout
// l'historique), records personnels, fréquence, muscles négligés /
// sous-entraînés / surentraînés (relatif aux propres muscles de
// l'utilisateur), volume hebdomadaire "optimal" observé (corrélé aux
// séances qui ont précédé un record), cycles de progression déjà
// vécus, exercices jamais pratiqués mais pertinents pour combler un
// manque, durée moyenne de séance et repos moyen quand ces données
// existent. `level`/`goal` restent exposés comme résumé compact
// (cadrage général du prompt IA), l'essentiel de la valeur est dans
// les données structurées que StrengthWorkoutEngine transmet telles
// quelles à l'edge `coach-workout` pour une vraie adaptation de la
// programmation plutôt qu'un simple choix de catégorie.
//
// Aucun seuil binaire "assez/pas assez de séances" : chaque signal se
// dégrade individuellement (ex: sessionsTracked=1 → trend "nouveau",
// pas de tentative de deviner une tendance ; historique trop pauvre
// pour comparer les groupes musculaires entre eux → tous "équilibre").
// Compatible avec les séances antérieures au set-by-set (avant le
// 13/06/2026, sans aucune ligne exercise_sets) via un repli sur les
// colonnes résumé exercises.reps/weight/sets, même convention que
// useExerciseSetHistory.ts ("Repli 4bis").
//
// NB : le RIR n'entre pas dans le calcul — la colonne exercise_sets.rpe
// a été supprimée le 02/07/2026 ("pas de RPE dans l'app", voir
// 20260702100030_seances_status_completed_drop_rpe.sql) : aucune
// donnée n'existe pour ce signal.
// ============================================================

import { normalize, EXERCISE_CATALOG } from "@/lib/fitness/exerciseCatalog";
import { exerciseToMuscles, MUSCLE_META, type MuscleId } from "@/lib/fitness/muscleMapping";

export type AutoLevel = "débutant" | "intermédiaire" | "avancé";
export type AutoGoal = "hypertrophie" | "force" | "endurance" | "perte de poids";
export type ExerciseTrend = "progression" | "stagnation" | "regression" | "nouveau";
export type ExercisePace = "rapide" | "normale";
export type MuscleTrainingStatus = "neglige" | "sous-entraine" | "equilibre" | "surentraine";

export interface AutoProfileSet {
  reps: number | null;
  weight: number | null;
  completed?: boolean | null;
  rest_seconds?: number | null;
}

export interface AutoProfileExercise {
  name: string;
  exercise_sets?: AutoProfileSet[] | null;
  /** Colonnes résumé (pré set-by-set) — repli uniquement si `exercise_sets`
   *  est vide, voir en-tête de fichier. */
  reps?: number | null;
  weight?: number | null;
  sets?: number | null;
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
  /** Uniquement renseigné si trend === "progression". */
  pace?: ExercisePace;
  /** Uniquement renseigné si trend === "stagnation". */
  stagnantWeeks?: number;
  sessionsTracked: number;
  lastWeight: number;
  personalRecord: number;
  /** Charge de départ concrète pour la prochaine séance — calculée depuis
   *  l'historique réel (jamais une valeur générique quand une donnée
   *  historique existe), voir computeSuggestedWeight(). */
  suggestedWeight: number;
  /** Nombre de séries suggéré, moyenne arrondie des séances suivies. */
  suggestedSets: number;
}

/** Exercice jamais pratiqué par l'utilisateur mais issu du catalogue —
 *  candidat pour combler un manque (muscle négligé/sous-entraîné). */
export interface NeverDoneExercise {
  name: string;
  muscles: MuscleId[];
}

/** Volume hebdomadaire moyen (tonnage) par groupe musculaire, sur les
 *  semaines réellement entraînées, avec statut RELATIF aux propres
 *  muscles de l'utilisateur (pas de comparaison inter-utilisateurs). */
export interface MuscleVolumeEntry {
  muscle: MuscleId;
  weeklyVolume: number;
  status: MuscleTrainingStatus;
}

/** Résumé d'une séance récente — sert uniquement à éviter que Sensei
 *  reprenne quasiment la même séance à chaque génération. */
export interface RecentSession {
  date: string;
  exerciseNames: string[];
  avgReps: number;
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
  /** Volume hebdomadaire total (tous muscles) observé dans les semaines qui
   *  ont précédé un record personnel chez cet utilisateur — null s'il n'y a
   *  pas assez de records datés pour dégager une tendance fiable. */
  optimalWeeklyVolume: number | null;
  /** Nombre de blocs de progression déjà vécus (≥3 semaines consécutives de
   *  hausse de tonnage), tous muscles confondus. */
  progressionCyclesCompleted: number;
  /** Triés par volume décroissant, TOUS les groupes musculaires (0 pour un
   *  muscle jamais travaillé récemment). */
  muscleVolume: MuscleVolumeEntry[];
  mostTrainedMuscles: MuscleId[];
  /** Muscles négligés ou sous-entraînés (les 0 priment) — borné à 3. */
  leastTrainedMuscles: MuscleId[];
  /** Muscles proportionnellement surentraînés vs les autres — borné à 3. */
  overTrainedMuscles: MuscleId[];
  /** Triés par nombre de séances suivies décroissant, borné à 8 entrées. */
  exerciseProgress: ExerciseProgress[];
  /** Candidats du catalogue jamais pratiqués, triés pour prioriser les
   *  muscles négligés/sous-entraînés — borné à 12 (non filtré par la
   *  sélection de muscles de la séance en cours, voir MuscleQuestionField). */
  neverDoneExercises: NeverDoneExercise[];
  /** Dernières séances (3 max, la plus récente en premier) — pour que
   *  Sensei varie la programmation plutôt que répéter la même. */
  recentSessions: RecentSession[];
}

const EMPTY_PROFILE: Omit<SenseiAutoProfile, "sessionsConsidered"> = {
  level: "intermédiaire",
  goal: "hypertrophie",
  weeklyFrequency: 0,
  avgSessionDurationMinutes: null,
  avgRestSeconds: null,
  optimalWeeklyVolume: null,
  progressionCyclesCompleted: 0,
  muscleVolume: [],
  mostTrainedMuscles: [],
  leastTrainedMuscles: [],
  overTrainedMuscles: [],
  exerciseProgress: [],
  neverDoneExercises: [],
  recentSessions: [],
};

const MAX_TRACKED_EXERCISES = 8;
const MAX_NEVER_DONE = 12;
const MAX_RECENT_SESSIONS = 3;
const ALL_MUSCLES = Object.keys(MUSCLE_META) as MuscleId[];

// Un mouvement de charge est considéré significatif au-delà de ce seuil ;
// en-deçà, c'est du bruit de mesure (arrondis de poids, variation de forme).
const TREND_NOISE_BAND = 0.02;
// Rythme hebdomadaire de hausse à partir duquel une progression est "rapide".
const FAST_PACE_WEEKLY_RATE = 0.015;
// Statut musculaire relatif : un muscle est "sous-entraîné"/"surentraîné" à
// partir de cet écart avec la médiane des AUTRES muscles réellement
// travaillés par CET utilisateur (jamais de comparaison inter-utilisateurs).
const UNDER_TRAINED_RATIO = 0.5;
const OVER_TRAINED_RATIO = 1.6;
const MIN_TRAINED_MUSCLES_FOR_STATUS = 3;

/** Semaine ISO-ish simplifiée (année + n° de semaine depuis le 1er janvier),
 *  même convention que src/lib/profile/achievements/muscleVolume.ts. */
function weekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const firstJan = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - firstJan.getTime()) / 86_400_000);
  const week = Math.floor((days + firstJan.getDay()) / 7);
  // Zero-pad : un historique complet dépasse largement la semaine 9 (jusqu'à
  // ~53/an) — sans padding, un tri lexical ("2026-W10" < "2026-W2") casserait
  // l'ordre chronologique utilisé par progressionCyclesCompleted et la
  // tendance de tonnage récente/ancienne.
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

interface ExerciseHistoryEntry {
  date: string;
  weight: number;
  setCount: number;
}

interface TrendResult {
  trend: ExerciseTrend;
  pace?: ExercisePace;
  stagnantWeeks?: number;
}

/** Tendance récente d'un exercice : compare une fenêtre RÉCENTE à la fenêtre
 *  qui la précède immédiatement (pas premier-vs-dernier sur tout
 *  l'historique) — plus fiable avec un historique long où une charge
 *  ancienne ne doit pas dicter le diagnostic d'aujourd'hui. */
function computeExerciseTrend(entries: ReadonlyArray<ExerciseHistoryEntry>): TrendResult {
  if (entries.length < 2) return { trend: "nouveau" };

  const windowSize = Math.max(1, Math.min(3, Math.floor(entries.length / 2)));
  const recentWindow = entries.slice(-windowSize);
  const priorWindow = entries.slice(-windowSize * 2, -windowSize);
  const recentAvg = average(recentWindow.map((e) => e.weight));
  const priorAvg =
    priorWindow.length > 0 ? average(priorWindow.map((e) => e.weight)) : entries[0].weight;
  const delta = priorAvg > 0 ? (recentAvg - priorAvg) / priorAvg : 0;

  if (delta > TREND_NOISE_BAND) {
    const startDate = priorWindow.length > 0 ? priorWindow[0].date : entries[0].date;
    const endDate = recentWindow[recentWindow.length - 1].date;
    const weeksElapsed = Math.max(1, daysBetween(startDate, endDate) / 7);
    const weeklyRate = delta / weeksElapsed;
    return {
      trend: "progression",
      pace: weeklyRate >= FAST_PACE_WEEKLY_RATE ? "rapide" : "normale",
    };
  }

  if (delta < -TREND_NOISE_BAND) {
    return { trend: "regression" };
  }

  // Stagnation : nombre de semaines depuis la dernière vraie hausse (>2%).
  let lastJumpDate = entries[0].date;
  for (let i = 1; i < entries.length; i += 1) {
    const prev = entries[i - 1].weight;
    const curr = entries[i].weight;
    if (prev > 0 && (curr - prev) / prev > TREND_NOISE_BAND) lastJumpDate = entries[i].date;
  }
  const stagnantWeeks = Math.round(daysBetween(lastJumpDate, entries[entries.length - 1].date) / 7);
  return { trend: "stagnation", stagnantWeeks };
}

/** Charge de départ concrète pour la prochaine séance : jamais une valeur
 *  générique quand un historique existe. Légère hausse en progression
 *  (davantage si rapide), léger deload après 3+ semaines de stagnation
 *  franche, charge stable sinon (régression : on ne pousse pas plus bas
 *  automatiquement, à l'IA/l'utilisateur de réévaluer). */
function computeSuggestedWeight(lastWeight: number, trend: TrendResult): number {
  if (trend.trend === "progression") {
    const bump = trend.pace === "rapide" ? 0.05 : 0.025;
    return Math.max(lastWeight + 1, round(lastWeight * (1 + bump)));
  }
  if (trend.trend === "stagnation" && (trend.stagnantWeeks ?? 0) >= 3) {
    return round(lastWeight * 0.95);
  }
  return lastWeight;
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
  // Historique chronologique par exercice — alimente surcharge progressive,
  // records personnels et charges/séries suggérées.
  const historyByExercise = new Map<string, { name: string; entries: ExerciseHistoryEntry[] }>();
  const recentSessions: RecentSession[] = [];
  // Semaine → nouveau record atteint cette semaine-là (pour optimalWeeklyVolume).
  const prWeeks = new Set<string>();
  const runningMaxByExercise = new Map<string, number>();

  for (const w of sessions) {
    if (w.duration_minutes != null && w.duration_minutes > 0) {
      sessionDurations.push(w.duration_minutes);
    }
    const wk = weekKey(w.date);
    const muscleTonnage = weeklyMuscleTonnage.get(wk) ?? new Map<MuscleId, number>();
    let sessionTonnage = 0;
    const sessionExerciseNames: string[] = [];
    const sessionReps: number[] = [];

    for (const ex of w.exercises ?? []) {
      // Repli sur les colonnes résumé pour les séances antérieures au
      // set-by-set (aucune ligne exercise_sets) — voir en-tête de fichier.
      const detailedSets = (ex.exercise_sets ?? []).filter(
        (s) => s.completed !== false && s.reps != null && s.reps > 0,
      );
      const validSets: Array<{ reps: number; weight: number }> =
        detailedSets.length > 0
          ? detailedSets.map((s) => ({ reps: s.reps as number, weight: s.weight ?? 0 }))
          : ex.reps != null && ex.reps > 0
            ? Array.from({ length: Math.max(1, ex.sets ?? 1) }, () => ({
                reps: ex.reps as number,
                weight: ex.weight ?? 0,
              }))
            : [];
      if (validSets.length === 0) continue;

      sessionExerciseNames.push(ex.name.trim());
      let topWeight = 0;
      let exerciseTonnage = 0;
      for (const s of validSets) {
        totalSets += 1;
        totalReps += s.reps;
        sessionReps.push(s.reps);
        if (s.weight > 0) {
          exerciseTonnage += s.weight * s.reps;
          if (s.weight > topWeight) topWeight = s.weight;
        }
      }
      for (const s of detailedSets) {
        if (s.rest_seconds != null && s.rest_seconds > 0) restSeconds.push(s.rest_seconds);
      }

      if (exerciseTonnage > 0) {
        sessionTonnage += exerciseTonnage;
        for (const muscle of exerciseToMuscles(ex.name)) {
          muscleTonnage.set(muscle, (muscleTonnage.get(muscle) ?? 0) + exerciseTonnage);
        }
      }

      if (topWeight > 0) {
        const key = normalize(ex.name);
        const entry = historyByExercise.get(key) ?? { name: ex.name.trim(), entries: [] };
        entry.entries.push({ date: w.date, weight: topWeight, setCount: validSets.length });
        historyByExercise.set(key, entry);

        const runningMax = runningMaxByExercise.get(key) ?? 0;
        if (topWeight > runningMax) {
          runningMaxByExercise.set(key, topWeight);
          if (runningMax > 0) prWeeks.add(wk); // pas le tout premier essai
        }
      }
    }

    if (sessionTonnage > 0) {
      weeklyTonnage.set(wk, (weeklyTonnage.get(wk) ?? 0) + sessionTonnage);
    }
    weeklyMuscleTonnage.set(wk, muscleTonnage);
    if (sessionExerciseNames.length > 0) {
      recentSessions.push({
        date: w.date,
        exerciseNames: sessionExerciseNames,
        avgReps: round(average(sessionReps), 1),
      });
    }
  }

  // Séances enregistrées mais sans aucune série exploitable (ex: séances
  // abandonnées en cours) — aucun signal réel, on retombe sur un profil
  // vide plutôt que de déduire quoi que ce soit d'un historique nul.
  if (totalSets === 0) {
    return { ...EMPTY_PROFILE, sessionsConsidered: sessions.length };
  }

  const avgRepsPerSet = totalReps / totalSets;

  const firstDate = new Date(sessions[0].date);
  const lastDate = new Date(sessions[sessions.length - 1].date);
  const weeksSpan = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (7 * 86_400_000));
  const weeklyFrequency = sessions.length / weeksSpan;

  // ---- Progression individuelle par exercice (fenêtre récente vs antérieure,
  // pas juste premier-vs-dernier sur tout l'historique) ----
  const exerciseProgress: ExerciseProgress[] = [];
  const trackedExerciseKeys = new Set<string>();
  for (const [key, { name, entries }] of historyByExercise) {
    trackedExerciseKeys.add(key);
    const sessionsTracked = entries.length;
    const lastWeight = entries[entries.length - 1].weight;
    const personalRecord = Math.max(...entries.map((e) => e.weight));
    const trendResult = computeExerciseTrend(entries);
    const suggestedSets = Math.max(
      1,
      Math.min(6, Math.round(average(entries.map((e) => e.setCount)))),
    );

    exerciseProgress.push({
      name,
      muscles: exerciseToMuscles(name),
      trend: trendResult.trend,
      pace: trendResult.pace,
      stagnantWeeks: trendResult.stagnantWeeks,
      sessionsTracked,
      lastWeight,
      personalRecord,
      suggestedWeight: computeSuggestedWeight(lastWeight, trendResult),
      suggestedSets,
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

  // ---- Volume hebdomadaire par groupe musculaire (statut RELATIF) ----
  const weeks = Array.from(weeklyTonnage.keys()).sort();
  const totalPerMuscle = new Map<MuscleId, number>();
  for (const muscleTonnage of weeklyMuscleTonnage.values()) {
    for (const [muscle, tonnage] of muscleTonnage) {
      totalPerMuscle.set(muscle, (totalPerMuscle.get(muscle) ?? 0) + tonnage);
    }
  }
  const weeksWithData = Math.max(1, weeks.length);
  const nonZeroVolumes = Array.from(totalPerMuscle.values()).map((total) =>
    round(total / weeksWithData),
  );
  const medianVolume = median(nonZeroVolumes);
  const enoughDataForStatus = totalPerMuscle.size >= MIN_TRAINED_MUSCLES_FOR_STATUS;

  const muscleVolume: MuscleVolumeEntry[] = ALL_MUSCLES.map((muscle) => {
    const weeklyVolume = round((totalPerMuscle.get(muscle) ?? 0) / weeksWithData);
    let status: MuscleTrainingStatus;
    if (weeklyVolume === 0) {
      status = "neglige";
    } else if (!enoughDataForStatus || medianVolume === 0) {
      status = "equilibre";
    } else if (weeklyVolume < medianVolume * UNDER_TRAINED_RATIO) {
      status = "sous-entraine";
    } else if (weeklyVolume > medianVolume * OVER_TRAINED_RATIO) {
      status = "surentraine";
    } else {
      status = "equilibre";
    }
    return { muscle, weeklyVolume, status };
  }).sort((a, b) => b.weeklyVolume - a.weeklyVolume);

  const mostTrainedMuscles = muscleVolume
    .filter((m) => m.weeklyVolume > 0)
    .slice(0, 3)
    .map((m) => m.muscle);
  const leastTrainedMuscles = [...muscleVolume]
    .sort((a, b) => a.weeklyVolume - b.weeklyVolume)
    .slice(0, 3)
    .map((m) => m.muscle);
  const overTrainedMuscles = muscleVolume
    .filter((m) => m.status === "surentraine")
    .slice(0, 3)
    .map((m) => m.muscle);

  // ---- Tendance de volume hebdomadaire : moitié récente vs moitié ancienne
  // des semaines réellement entraînées (plus robuste face à un rythme
  // d'entraînement irrégulier qu'une comparaison séance par séance). ----
  const mid = Math.floor(weeks.length / 2);
  const olderAvg = average(weeks.slice(0, mid).map((w) => weeklyTonnage.get(w)!));
  const recentAvg = average(weeks.slice(mid).map((w) => weeklyTonnage.get(w)!));
  const tonnageTrend = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

  // ---- Volume hebdomadaire "optimal" : volume total des semaines qui ont
  // précédé un nouveau record personnel chez CET utilisateur (pas une norme
  // externe). Nécessite au moins 2 semaines qualifiantes pour être fiable.
  const prWeekVolumes = Array.from(prWeeks)
    .map((wk) => weeklyTonnage.get(wk))
    .filter((v): v is number => v != null && v > 0);
  const optimalWeeklyVolume = prWeekVolumes.length >= 2 ? round(median(prWeekVolumes)) : null;

  // ---- Cycles de progression déjà vécus : runs d'au moins 3 semaines
  // entraînées consécutives (dans la séquence des semaines avec données,
  // pas forcément calendaires) avec un tonnage en hausse d'une semaine à
  // l'autre. ----
  let progressionCyclesCompleted = 0;
  let runLength = 1;
  for (let i = 1; i < weeks.length; i += 1) {
    const prev = weeklyTonnage.get(weeks[i - 1])!;
    const curr = weeklyTonnage.get(weeks[i])!;
    if (curr > prev * (1 + TREND_NOISE_BAND)) {
      runLength += 1;
    } else {
      if (runLength >= 3) progressionCyclesCompleted += 1;
      runLength = 1;
    }
  }
  if (runLength >= 3) progressionCyclesCompleted += 1;

  // ---- Exercices jamais pratiqués mais pertinents : candidats du catalogue
  // qui touchent des muscles négligés/sous-entraînés en priorité. ----
  const priorityMuscles = new Set(
    muscleVolume
      .filter((m) => m.status === "neglige" || m.status === "sous-entraine")
      .map((m) => m.muscle),
  );
  const neverDoneExercises: NeverDoneExercise[] = EXERCISE_CATALOG.filter(
    (c) => !trackedExerciseKeys.has(normalize(c.name)),
  )
    .map((c) => ({ name: c.name, muscles: exerciseToMuscles(c.name) }))
    .filter((c) => c.muscles.length > 0)
    .sort((a, b) => {
      const aPriority = a.muscles.some((m) => priorityMuscles.has(m)) ? 1 : 0;
      const bPriority = b.muscles.some((m) => priorityMuscles.has(m)) ? 1 : 0;
      return bPriority - aPriority;
    })
    .slice(0, MAX_NEVER_DONE);

  // ---- Niveau : plus de séances, plus de fréquence, une surcharge qui
  // tient dans la durée et un travail musculaire large font monter le score.
  let levelScore = 0;
  if (sessions.length >= 25) levelScore += 2;
  else if (sessions.length >= 8) levelScore += 1;
  if (weeklyFrequency >= 2.5) levelScore += 2;
  else if (weeklyFrequency >= 1.2) levelScore += 1;
  if (progressionRatio >= 0.5) levelScore += 1;
  if (recentPRCount >= 2) levelScore += 1;
  if (totalPerMuscle.size >= 6) levelScore += 1;

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
    optimalWeeklyVolume,
    progressionCyclesCompleted,
    muscleVolume,
    mostTrainedMuscles,
    leastTrainedMuscles,
    overTrainedMuscles,
    exerciseProgress: trackedExerciseProgress,
    neverDoneExercises,
    recentSessions: recentSessions.slice(-MAX_RECENT_SESSIONS).reverse(),
  };
}
