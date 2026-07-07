// ============================================================
// CourseWorkoutEngine — moteur métier dédié Course à pied (phase 5).
//
// Comme HYROX en phase 4, ceci n'est PAS une adaptation de la
// musculation : aucune notion de séries/répétitions/charge n'apparaît
// ici. Vocabulaire 100% course : distance, allure, FC/zones cardio,
// cadence, dénivelé, récupération estimée.
//
// Le Sensei choisit le type de séance en DEUX temps (mêmes principes
// qu'HYROX) plutôt qu'un menu à plat de 13 boutons : une question
// d'objectif large (endurance / vitesse / préparation compétition /
// allure cible), puis une question de suivi conditionnelle qui affine
// vers l'un des 13 types demandés. Résultat identique (13 types
// couverts), dialogue plus naturel.
//
// Génération DÉTERMINISTE, même raisonnement que Cardio/HYROX : les
// allures par niveau (ci-dessous) sont des repères d'entraînement
// raisonnables, pas des tables VDOT calibrées individuellement — un
// LLM n'apporterait ici que du bruit. Assumé, ajustable si besoin.
//
// Pas de question "lieu d'entraînement" : contrairement à la
// musculation/HYROX/Cardio (salle), la course se pratique le plus
// souvent dehors — imposer Maison/Keep Cool/On Air/Fitness Park n'a
// pas de sens. `gym_location` reste simplement absent du brouillon
// (déjà optionnel dans WorkoutRecordDraft, aucun changement de type
// nécessaire) : confirme que les fragments partagés (sharedQuestions)
// sont à usage optionnel, pas obligatoire pour chaque moteur.
//
// Préparation intégrations futures (Apple Santé/Garmin/Polar/Coros/
// Suunto/Strava) : la FC max peut être fournie soit par la question
// `max_heart_rate` (facultative — voir SenseiQuestionSpec.optional,
// ajouté cette phase), soit — si un connecteur existe un jour — par
// `context.wearable.maxHeartRate` (voir wearableTypes.ts), lue ici en
// repli SANS que la signature de generate() ni cette logique n'aient
// à changer quand un vrai connecteur sera branché. Aucun connecteur
// n'existe aujourd'hui : `context.wearable` est toujours undefined.
//
// feedsRankEngine=false : contenu 100% dans workouts.metadata, jamais
// dans exercises/exercise_sets. Frontière Rang/Badges/Succès intouchée.
// ============================================================

import { durationQuestion, levelQuestion } from "./sharedQuestions";
import { baseSummaryStats, segmentsFromMetadata } from "./sessionViewHelpers";
import { distanceForDuration, formatPace } from "@/lib/fitness/pace";
import { describeZone } from "@/lib/fitness/heartRateZones";
import type { WearableSnapshot } from "./wearableTypes";
import type {
  SenseiAnswers,
  SenseiContext,
  SenseiQuestionSpec,
  SessionSegment,
  SessionStat,
  SessionView,
  WorkoutEngine,
  WorkoutRecordDraft,
  WorkoutTemplate,
} from "./types";

type Level = "débutant" | "intermédiaire" | "avancé";

// Les 13 types de séance demandés, atteints via objectif -> sous-choix.
type SessionType =
  | "endurance_fondamentale"
  | "sortie_longue"
  | "footing_recuperation"
  | "fractionne"
  | "vma"
  | "tempo"
  | "seuil"
  | "cotes"
  | "prep_5k"
  | "prep_10k"
  | "prep_semi"
  | "prep_marathon"
  | "allure_specifique";

function byLevel<T>(level: Level, table: Record<Level, T>): T {
  return table[level] ?? table["intermédiaire"];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

// ---- Allures de référence par niveau (min/km) — repères d'entraînement,
// pas des tables VDOT individualisées (voir en-tête de fichier). ----
const EASY_PACE: Record<Level, number> = { débutant: 7.0, intermédiaire: 6.0, avancé: 5.0 };
const TEMPO_PACE: Record<Level, number> = { débutant: 6.0, intermédiaire: 5.0, avancé: 4.3 };
const THRESHOLD_PACE: Record<Level, number> = { débutant: 5.7, intermédiaire: 4.8, avancé: 4.1 };
const FAST_PACE: Record<Level, number> = { débutant: 5.0, intermédiaire: 4.2, avancé: 3.6 };
const RECOVERY_OFFSET = 1.0; // ajouté à l'allure facile pour le footing récup
const LONG_OFFSET = 0.2; // ajouté à l'allure facile pour la sortie longue
const SEMI_OFFSET = 0.3; // ajouté à l'allure tempo pour l'allure semi-marathon

// Cadence : repère général indépendant du niveau/type de séance (cue de
// forme course à pied), pas personnalisé — personnalisable plus tard via
// un vrai historique de cadence (wearable), non disponible aujourd'hui.
const CADENCE_TARGET = "170-185 pas/min";

// Récupération estimée avant la prochaine séance intense (heures), par
// type de séance puis ajustée par niveau (mieux entraîné = récupère plus
// vite). Repère d'entraînement, pas une prescription médicale.
const RECOVERY_HOURS_BASE: Record<SessionType, number> = {
  footing_recuperation: 12,
  endurance_fondamentale: 24,
  sortie_longue: 30,
  prep_marathon: 30,
  tempo: 30,
  prep_semi: 30,
  seuil: 36,
  prep_10k: 36,
  fractionne: 48,
  vma: 48,
  cotes: 48,
  prep_5k: 48,
  allure_specifique: 24,
};
const RECOVERY_LEVEL_FACTOR: Record<Level, number> = {
  débutant: 1.2,
  intermédiaire: 1.0,
  avancé: 0.85,
};

function estimateRecoveryHours(type: SessionType, level: Level): number {
  return Math.round(RECOVERY_HOURS_BASE[type] * RECOVERY_LEVEL_FACTOR[level]);
}

function continuousSegment(
  label: string,
  distanceKm: number,
  paceMinPerKm: number,
  zoneNumber: 1 | 2 | 3 | 4 | 5 | undefined,
  maxHeartRate: number | undefined,
  extraStats: SessionStat[] = [],
): SessionSegment {
  const stats: SessionStat[] = [
    { label: "Distance", value: `${distanceKm.toFixed(1)} km` },
    { label: "Allure cible", value: formatPace(paceMinPerKm) },
  ];
  if (zoneNumber)
    stats.push({ label: "Zone FC cible", value: describeZone(zoneNumber, maxHeartRate) });
  stats.push(...extraStats);
  return { label, stats };
}

/** Répétitions effort/récupération (fractionné, VMA, préparation 5 km) —
 *  format distance x distance, le plus courant en pratique. */
function intervalSegments(
  effortLabel: string,
  reps: number,
  effortMeters: number,
  effortPace: number,
  recoveryMeters: number,
  recoveryPace: number,
  zoneNumber: 1 | 2 | 3 | 4 | 5,
  maxHeartRate: number | undefined,
): SessionSegment[] {
  const segments: SessionSegment[] = [];
  for (let i = 1; i <= reps; i++) {
    segments.push({
      label: `${effortLabel} ${i}/${reps}`,
      stats: [
        { label: "Distance", value: `${effortMeters} m` },
        { label: "Allure cible", value: formatPace(effortPace) },
        { label: "Zone FC cible", value: describeZone(zoneNumber, maxHeartRate) },
      ],
    });
    segments.push({
      label: "Récupération trottinée",
      stats: [
        { label: "Distance", value: `${recoveryMeters} m` },
        { label: "Allure", value: formatPace(recoveryPace) },
      ],
    });
  }
  return segments;
}

/** Travail en côtes : répétitions montée (effort) / descente (récup),
 *  seul type de séance qui expose "Dénivelé+" — la pente rend une
 *  allure cible en min/km peu pertinente, remplacée par une durée
 *  d'effort qualitative. */
function hillSegments(reps: number, level: Level): SessionSegment[] {
  const elevationPerRep = byLevel(level, { débutant: 10, intermédiaire: 15, avancé: 20 });
  const segments: SessionSegment[] = [];
  for (let i = 1; i <= reps; i++) {
    segments.push({
      label: `Montée ${i}/${reps}`,
      stats: [
        { label: "Effort", value: "rapide, en résistance" },
        { label: "Dénivelé+", value: `${elevationPerRep} m` },
        { label: "Zone FC cible", value: describeZone(5) },
      ],
    });
    segments.push({
      label: "Descente récupération",
      stats: [{ label: "Effort", value: "footing lent" }],
    });
  }
  return segments;
}

const OBJECTIVE_OPTIONS = [
  { value: "endurance", label: "Construire mon endurance" },
  { value: "speed", label: "Travailler ma vitesse" },
  { value: "race_prep", label: "Préparer une course" },
  { value: "target_pace", label: "Travailler une allure spécifique" },
];

const ENDURANCE_OPTIONS = [
  { value: "endurance_fondamentale", label: "Endurance fondamentale" },
  { value: "sortie_longue", label: "Sortie longue" },
  { value: "footing_recuperation", label: "Footing récupération" },
];

const SPEED_OPTIONS = [
  { value: "fractionne", label: "Fractionné" },
  { value: "vma", label: "VMA" },
  { value: "tempo", label: "Tempo" },
  { value: "seuil", label: "Seuil" },
  { value: "cotes", label: "Travail en côtes" },
];

const RACE_OPTIONS = [
  { value: "prep_5k", label: "5 km" },
  { value: "prep_10k", label: "10 km" },
  { value: "prep_semi", label: "Semi-marathon" },
  { value: "prep_marathon", label: "Marathon" },
];

const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  endurance_fondamentale: "Endurance fondamentale",
  sortie_longue: "Sortie longue",
  footing_recuperation: "Footing récupération",
  fractionne: "Fractionné",
  vma: "VMA",
  tempo: "Tempo",
  seuil: "Seuil",
  cotes: "Travail en côtes",
  prep_5k: "Préparation 5 km",
  prep_10k: "Préparation 10 km",
  prep_semi: "Préparation Semi-Marathon",
  prep_marathon: "Préparation Marathon",
  allure_specifique: "Travail d'allure spécifique",
};

const QUESTIONS: SenseiQuestionSpec[] = [
  {
    id: "objective",
    prompt: "Quel est ton objectif aujourd'hui ?",
    type: "single-choice",
    options: OBJECTIVE_OPTIONS,
  },
  {
    id: "endurance_type",
    prompt: "Quel type d'endurance ?",
    type: "single-choice",
    options: ENDURANCE_OPTIONS,
    when: (a) => a.objective === "endurance",
  },
  {
    id: "speed_type",
    prompt: "Quel type de travail de vitesse ?",
    type: "single-choice",
    options: SPEED_OPTIONS,
    when: (a) => a.objective === "speed",
  },
  {
    id: "race_distance",
    prompt: "Pour quelle distance te prépares-tu ?",
    type: "single-choice",
    options: RACE_OPTIONS,
    when: (a) => a.objective === "race_prep",
  },
  {
    id: "target_pace_min_per_km",
    prompt: "Quelle allure cible (min/km, ex: 5.5 pour 5:30) ?",
    type: "number",
    when: (a) => a.objective === "target_pace",
  },
  levelQuestion,
  durationQuestion(40),
  {
    id: "max_heart_rate",
    prompt: "Ta FC max, si tu la connais (optionnel) ?",
    type: "number",
    optional: true,
  },
];

function resolveSessionType(answers: SenseiAnswers): SessionType {
  const objective = String(answers.objective ?? "endurance");
  if (objective === "endurance")
    return (answers.endurance_type as SessionType) ?? "endurance_fondamentale";
  if (objective === "speed") return (answers.speed_type as SessionType) ?? "tempo";
  if (objective === "race_prep") return (answers.race_distance as SessionType) ?? "prep_10k";
  return "allure_specifique";
}

function buildSession(
  type: SessionType,
  level: Level,
  duration: number,
  targetPace: number | undefined,
  maxHeartRate: number | undefined,
): { segments: SessionSegment[]; notes: string } {
  switch (type) {
    case "endurance_fondamentale": {
      const pace = EASY_PACE[level];
      return {
        segments: [
          continuousSegment(
            "Endurance fondamentale",
            distanceForDuration(duration, pace),
            pace,
            2,
            maxHeartRate,
          ),
        ],
        notes: "Allure conversationnelle — tu dois pouvoir parler sans être essoufflé.",
      };
    }
    case "sortie_longue": {
      const pace = EASY_PACE[level] + LONG_OFFSET;
      return {
        segments: [
          continuousSegment(
            "Sortie longue",
            distanceForDuration(duration, pace),
            pace,
            2,
            maxHeartRate,
          ),
        ],
        notes:
          duration < 60
            ? "Sortie longue courte pour ton temps dispo — augmente la durée pour un vrai travail de fond."
            : "Pense hydratation/ravitaillement au-delà de 75-90 min.",
      };
    }
    case "footing_recuperation": {
      const pace = EASY_PACE[level] + RECOVERY_OFFSET;
      return {
        segments: [
          continuousSegment(
            "Footing récupération",
            distanceForDuration(duration, pace),
            pace,
            1,
            maxHeartRate,
          ),
        ],
        notes:
          "Intensité volontairement très basse — récupération active, ne force jamais l'allure.",
      };
    }
    case "fractionne": {
      const reps = clamp(duration / 6, 4, 12);
      return {
        segments: intervalSegments(
          "400m rapide",
          reps,
          400,
          FAST_PACE[level],
          200,
          EASY_PACE[level] + RECOVERY_OFFSET,
          4,
          maxHeartRate,
        ),
        notes: `${reps} répétitions de 400m à allure rapide, 200m de récupération trottinée entre chaque.`,
      };
    }
    case "vma": {
      const reps = clamp(duration / 4, 6, 16);
      return {
        segments: intervalSegments(
          "300m très rapide",
          reps,
          300,
          FAST_PACE[level] - 0.3,
          200,
          EASY_PACE[level] + RECOVERY_OFFSET,
          5,
          maxHeartRate,
        ),
        notes: `${reps} répétitions courtes proches de ta vitesse maximale aérobie.`,
      };
    }
    case "tempo": {
      const pace = TEMPO_PACE[level];
      return {
        segments: [
          continuousSegment("Tempo", distanceForDuration(duration, pace), pace, 3, maxHeartRate),
        ],
        notes: "Effort soutenu mais contrôlé, sur la durée complète sans à-coups.",
      };
    }
    case "seuil": {
      const pace = THRESHOLD_PACE[level];
      return {
        segments: [
          continuousSegment("Seuil", distanceForDuration(duration, pace), pace, 4, maxHeartRate),
        ],
        notes:
          "Allure « confortablement dure » — juste sous le point où tu accumules de l'acide lactique.",
      };
    }
    case "cotes": {
      const reps = clamp(duration / 5, 4, 10);
      return {
        segments: hillSegments(reps, level),
        notes: `${reps} répétitions en côte — travail de puissance et de foulée, allure non pertinente sur ce terrain.`,
      };
    }
    case "prep_5k": {
      const reps = clamp(duration / 5, 5, 14);
      return {
        segments: intervalSegments(
          "400m allure 5 km",
          reps,
          400,
          FAST_PACE[level],
          200,
          EASY_PACE[level] + RECOVERY_OFFSET,
          5,
          maxHeartRate,
        ),
        notes:
          "Travail du haut du spectre : le 5 km exige de la vitesse pure en plus de l'endurance.",
      };
    }
    case "prep_10k": {
      const pace = THRESHOLD_PACE[level];
      return {
        segments: [
          continuousSegment(
            "Allure 10 km",
            distanceForDuration(duration, pace),
            pace,
            4,
            maxHeartRate,
          ),
        ],
        notes: "Bloc continu à l'allure visée pour ta course de 10 km.",
      };
    }
    case "prep_semi": {
      const pace = TEMPO_PACE[level] + SEMI_OFFSET;
      return {
        segments: [
          continuousSegment(
            "Allure semi-marathon",
            distanceForDuration(duration, pace),
            pace,
            3,
            maxHeartRate,
          ),
        ],
        notes: "Allure semi — un cran sous le tempo, tenable sur la durée.",
      };
    }
    case "prep_marathon": {
      const pace = targetPace ?? EASY_PACE[level] + LONG_OFFSET;
      return {
        segments: [
          continuousSegment(
            "Allure marathon",
            distanceForDuration(duration, pace),
            pace,
            2,
            maxHeartRate,
          ),
        ],
        notes:
          duration < 60
            ? "Séance courte pour du travail marathon — l'idéal est de progressivement allonger ce bloc."
            : "Bloc à l'allure marathon visée, dans une sortie longue.",
      };
    }
    case "allure_specifique": {
      const pace = targetPace ?? TEMPO_PACE[level];
      return {
        segments: [
          continuousSegment(
            "Allure cible",
            distanceForDuration(duration, pace),
            pace,
            undefined,
            maxHeartRate,
          ),
        ],
        notes: "Séance dédiée à habituer ton corps à cette allure précise.",
      };
    }
  }
}

export const CourseWorkoutEngine: WorkoutEngine = {
  id: "course",
  label: "Course",
  comingSoon: false,
  feedsRankEngine: false,
  questions: QUESTIONS,

  async generate(answers: SenseiAnswers, context?: SenseiContext): Promise<WorkoutTemplate> {
    const level = (answers.level as Level) ?? "intermédiaire";
    const duration = Number(answers.duration_minutes) || 40;
    const sessionType = resolveSessionType(answers);
    const targetPace =
      typeof answers.target_pace_min_per_km === "number"
        ? answers.target_pace_min_per_km
        : undefined;
    const wearable = context?.wearable as WearableSnapshot | undefined;
    const maxHeartRate =
      typeof answers.max_heart_rate === "number" ? answers.max_heart_rate : wearable?.maxHeartRate;

    const built = buildSession(sessionType, level, duration, targetPace, maxHeartRate);

    return {
      name: SESSION_TYPE_LABEL[sessionType],
      exercises: [],
      segments: built.segments,
      notes: built.notes,
    };
  },

  toWorkoutRecord(template: WorkoutTemplate, answers: SenseiAnswers): WorkoutRecordDraft {
    const level = (answers.level as Level) ?? "intermédiaire";
    const sessionType = resolveSessionType(answers);
    return {
      discipline: "course",
      name: template.name,
      duration_minutes: Number(answers.duration_minutes) || 40,
      notes: template.notes,
      metadata: {
        sessionType,
        level,
        maxHeartRate:
          typeof answers.max_heart_rate === "number" ? answers.max_heart_rate : undefined,
        cadenceTarget: CADENCE_TARGET,
        recoveryHoursEstimate: estimateRecoveryHours(sessionType, level),
        segments: template.segments ?? [],
      },
    };
  },

  toSessionView(record: WorkoutRecordDraft): SessionView {
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    const sessionType = (metadata.sessionType as SessionType) ?? "endurance_fondamentale";
    const recoveryHours =
      typeof metadata.recoveryHoursEstimate === "number"
        ? metadata.recoveryHoursEstimate
        : undefined;
    const cadence =
      typeof metadata.cadenceTarget === "string" ? metadata.cadenceTarget : CADENCE_TARGET;

    const extra: SessionStat[] = [
      { label: "Type de séance", value: SESSION_TYPE_LABEL[sessionType] ?? sessionType },
      { label: "Cadence cible", value: cadence },
    ];
    if (recoveryHours !== undefined) {
      extra.push({
        label: "Récupération estimée",
        value: `~${recoveryHours} h avant une séance intense`,
      });
    }

    return {
      title: record.name,
      summaryStats: baseSummaryStats(record, extra),
      segments: segmentsFromMetadata(record),
      notes: record.notes,
    };
  },

  historyPresentation: {
    cardVariant: "metric-grid",
  },
};
