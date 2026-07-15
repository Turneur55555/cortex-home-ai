// ============================================================
// HyroxWorkoutEngine — moteur métier dédié HYROX (phase 4).
//
// Ceci n'est PAS une adaptation du moteur Musculation. HYROX a son
// propre vocabulaire (postes, charges, distances, tours) et ses propres
// types de séance — jamais de "séries/répétitions" au sens musculation
// là où ça n'a pas de sens (Running, SkiErg, Rameur n'ont pas de
// "charge" ; Sled Push/Pull/Farmer Carry/Sandbag Lunges n'ont pas de
// "répétitions").
//
// Neuf postes couverts, chacun avec ses paramètres propres (voir
// STATION_STANDARDS) : Running, SkiErg, Rameur, Sled Push, Sled Pull,
// Farmer Carry, Sandbag Lunges, Burpee Broad Jump, Wall Balls.
//
// Le Sensei choisit "intelligemment" entre plusieurs types de séance en
// posant UNE question d'objectif (pas un menu technique de 13 options à
// plat) : simulation complète, travail spécifique sur UN poste (parmi
// les 9, choix fait via une question de suivi conditionnelle — plus
// complet que la liste illustrative fournie par Nathan qui n'en citait
// que 7), ou séance orientée (préhension/endurance/puissance/
// récupération/préparation compétition). Chaque branche construit une
// liste de segments différente — c'est ÇA, la logique métier HYROX.
//
// Génération DÉTERMINISTE (cohérent avec CardioWorkoutEngine, même
// raisonnement) : les standards d'un poste HYROX (charges, distances)
// sont connus et stables par niveau — un LLM n'apporterait ici que du
// bruit et de la latence. Les valeurs ci-dessous sont des repères
// d'ENTRAÎNEMENT raisonnables par niveau, PAS les charges officielles
// de compétition (qui varient par catégorie/fédération) — assumé et à
// ajuster si besoin.
//
// feedsRankEngine=false : ce moteur n'écrit jamais dans exercises/
// exercise_sets, tout son contenu vit dans workouts.metadata (voir
// toWorkoutRecord). Frontière Rang/Badges/Succès intouchée.
// ============================================================

import { durationQuestion, gymLocationQuestion, levelQuestion } from "./sharedQuestions";
import {
  baseSummaryStats,
  genericBuildLiveSegments,
  genericFormatLiveSegment,
  segmentsFromMetadata,
} from "./sessionViewHelpers";
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

export const STATION_IDS = [
  "Running",
  "SkiErg",
  "Rameur",
  "Sled Push",
  "Sled Pull",
  "Farmer Carry",
  "Sandbag Lunges",
  "Burpee Broad Jump",
  "Wall Balls",
] as const;
type StationId = (typeof STATION_IDS)[number];

// Ordre officiel des postes dans une course HYROX (entre deux footings).
const SIMULATION_ORDER: StationId[] = [
  "SkiErg",
  "Sled Push",
  "Sled Pull",
  "Burpee Broad Jump",
  "Rameur",
  "Farmer Carry",
  "Sandbag Lunges",
  "Wall Balls",
];

function byLevel<T>(level: Level, table: Record<Level, T>): T {
  return table[level] ?? table["intermédiaire"];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Un passage à un poste, avec ses stats propres et un nombre de tours
 *  optionnel (répétition du même effort, pas une "série" musculation). */
function stationSegment(
  id: StationId,
  level: Level,
  opts: { volumeOverride?: number; rounds?: number } = {},
): SessionSegment {
  const stats: SessionStat[] = [];
  // Miroir numérique brut de `stats` (voir `SessionSegment.metrics` —
  // solution transitoire Phase 1, permet historique/records par poste).
  const metrics: Record<string, number> = {};

  switch (id) {
    case "Running": {
      const distance = opts.volumeOverride ?? 1000;
      stats.push({ label: "Distance", value: `${distance} m` });
      metrics.distance_m = distance;
      break;
    }
    case "SkiErg":
    case "Rameur": {
      const distance =
        opts.volumeOverride ?? byLevel(level, { débutant: 600, intermédiaire: 800, avancé: 1000 });
      stats.push({ label: "Distance", value: `${distance} m` });
      metrics.distance_m = distance;
      break;
    }
    case "Sled Push":
    case "Sled Pull": {
      const load = byLevel(level, { débutant: 40, intermédiaire: 80, avancé: 120 });
      const distance = opts.volumeOverride ?? 50;
      stats.push(
        { label: "Charge", value: `${load} kg` },
        { label: "Distance", value: `${distance} m` },
      );
      metrics.charge_kg = load;
      metrics.distance_m = distance;
      break;
    }
    case "Farmer Carry": {
      const load = byLevel(level, { débutant: 16, intermédiaire: 24, avancé: 32 });
      const distance = opts.volumeOverride ?? 200;
      stats.push(
        { label: "Charge (par main)", value: `${load} kg` },
        { label: "Distance", value: `${distance} m` },
      );
      metrics.charge_kg = load;
      metrics.distance_m = distance;
      break;
    }
    case "Sandbag Lunges": {
      const load = byLevel(level, { débutant: 10, intermédiaire: 20, avancé: 30 });
      const distance = opts.volumeOverride ?? 100;
      stats.push(
        { label: "Charge", value: `${load} kg` },
        { label: "Distance", value: `${distance} m` },
      );
      metrics.charge_kg = load;
      metrics.distance_m = distance;
      break;
    }
    case "Burpee Broad Jump": {
      const reps =
        opts.volumeOverride ?? byLevel(level, { débutant: 40, intermédiaire: 60, avancé: 80 });
      stats.push({ label: "Répétitions", value: String(reps) });
      metrics.reps = reps;
      break;
    }
    case "Wall Balls": {
      const ballWeight = byLevel(level, { débutant: 4, intermédiaire: 6, avancé: 9 });
      const reps =
        opts.volumeOverride ?? byLevel(level, { débutant: 50, intermédiaire: 75, avancé: 100 });
      stats.push(
        { label: "Charge (ballon)", value: `${ballWeight} kg` },
        { label: "Répétitions", value: String(reps) },
      );
      metrics.charge_kg = ballWeight;
      metrics.reps = reps;
      break;
    }
  }

  if (opts.rounds && opts.rounds > 1) {
    stats.push({ label: "Tours", value: String(opts.rounds) });
    metrics.rounds = opts.rounds;
  }

  return { label: id, stats, metrics };
}

// Groupes de postes par intention — connaissance 100% interne à HYROX.
const FOCUS_STATIONS: Record<string, StationId[]> = {
  grip: ["Farmer Carry", "Sandbag Lunges", "Sled Pull", "Wall Balls"],
  endurance: ["Running", "Rameur", "SkiErg"],
  power: ["Sled Push", "Sled Pull", "Burpee Broad Jump"],
  recovery: ["Rameur", "Wall Balls"],
  competition_prep: ["SkiErg", "Sled Push", "Farmer Carry", "Wall Balls"],
};

const FOCUS_LABELS: Record<string, string> = {
  grip: "préhension",
  endurance: "endurance",
  power: "puissance",
  recovery: "récupération",
};

const OBJECTIVE_OPTIONS = [
  { value: "simulation_complete", label: "Simulation HYROX complète" },
  { value: "specific", label: "Travail spécifique sur un poste" },
  { value: "grip", label: "Séance orientée préhension" },
  { value: "endurance", label: "Séance orientée endurance" },
  { value: "power", label: "Séance orientée puissance" },
  { value: "recovery", label: "Séance orientée récupération" },
  { value: "competition_prep", label: "Préparation à une compétition" },
];
const OBJECTIVE_LABEL: Record<string, string> = Object.fromEntries(
  OBJECTIVE_OPTIONS.map((o) => [o.value, o.label]),
);

const QUESTIONS: SenseiQuestionSpec[] = [
  {
    id: "objective",
    prompt: "Quel est ton objectif aujourd'hui ?",
    type: "single-choice",
    options: OBJECTIVE_OPTIONS,
  },
  {
    id: "station",
    prompt: "Quel poste veux-tu travailler ?",
    type: "single-choice",
    options: STATION_IDS.map((id) => ({ value: id, label: id })),
    when: (a) => a.objective === "specific",
  },
  levelQuestion,
  durationQuestion(45),
  gymLocationQuestion,
];

function buildSimulation(
  level: Level,
  duration: number,
): { segments: SessionSegment[]; name: string; notes: string } {
  const full = duration >= 40;
  const runDistance = full ? 1000 : 500;
  // Demi-simulation : un poste sur deux, pour tenir dans un temps réduit.
  const stations = full ? SIMULATION_ORDER : SIMULATION_ORDER.filter((_, i) => i % 2 === 0);

  const segments: SessionSegment[] = [];
  for (const station of stations) {
    segments.push(stationSegment("Running", level, { volumeOverride: runDistance }));
    segments.push(stationSegment(station, level));
  }

  return {
    segments,
    name: full ? "Simulation HYROX complète" : "Simulation HYROX — format réduit",
    notes: full
      ? "8 postes, 8x1000m de course, dans l'ordre officiel."
      : `Format réduit (${stations.length} postes) adapté à ton temps disponible — augmente la durée pour la simulation complète.`,
  };
}

function buildSpecific(
  station: StationId,
  level: Level,
  duration: number,
): { segments: SessionSegment[]; name: string; notes: string } {
  const rounds = clamp(duration / 5, 1, 8);
  return {
    segments: [stationSegment(station, level, { rounds })],
    name: `Travail spécifique — ${station}`,
    notes: `${rounds} tour(s) centré(s) sur ${station}.`,
  };
}

function buildCompetitionPrep(level: Level): {
  segments: SessionSegment[];
  name: string;
  notes: string;
} {
  const stations = FOCUS_STATIONS.competition_prep;
  const segments: SessionSegment[] = [];
  for (const station of stations) {
    segments.push(stationSegment("Running", level, { volumeOverride: 500 }));
    segments.push(stationSegment(station, level));
  }
  return {
    segments,
    name: "Préparation compétition — extrait à allure cible",
    notes: "Simule un extrait de course à l'allure visée le jour J.",
  };
}

function buildFocus(
  objective: string,
  level: Level,
  duration: number,
): { segments: SessionSegment[]; name: string; notes: string } {
  const stations = FOCUS_STATIONS[objective] ?? FOCUS_STATIONS.endurance;
  const rounds = objective === "recovery" ? 1 : clamp(duration / (5 * stations.length), 1, 4);
  const segments = stations.map((station) => stationSegment(station, level, { rounds }));
  const label = FOCUS_LABELS[objective] ?? objective;
  return {
    segments,
    name: `Séance orientée ${label}`,
    notes:
      objective === "recovery"
        ? "Intensité volontairement basse — récupération active."
        : `${rounds} tour(s) sur ${stations.length} poste(s).`,
  };
}

export const HyroxWorkoutEngine: WorkoutEngine = {
  id: "hyrox",
  label: "HYROX",
  comingSoon: false,
  feedsRankEngine: false,
  icon: "Flame",
  accentClassName: "text-red-400",
  // Phase A (15/07/2026) : extension du live-tracking générique
  // (pilote Course, 09/07/2026) — voir sessionViewHelpers.ts.
  supportsLiveTracking: true,
  questions: QUESTIONS,

  async generate(answers: SenseiAnswers, _context?: SenseiContext): Promise<WorkoutTemplate> {
    const level = (answers.level as Level) ?? "intermédiaire";
    const duration = Number(answers.duration_minutes) || 45;
    const objective = String(answers.objective ?? "simulation_complete");

    let built: { segments: SessionSegment[]; name: string; notes: string };

    if (objective === "simulation_complete") {
      built = buildSimulation(level, duration);
    } else if (objective === "specific") {
      const station = (answers.station as StationId) ?? "Running";
      built = buildSpecific(station, level, duration);
    } else if (objective === "competition_prep") {
      built = buildCompetitionPrep(level);
    } else {
      built = buildFocus(objective, level, duration);
    }

    return { name: built.name, exercises: [], segments: built.segments, notes: built.notes };
  },

  toWorkoutRecord(template: WorkoutTemplate, answers: SenseiAnswers): WorkoutRecordDraft {
    return {
      discipline: "hyrox",
      name: template.name,
      duration_minutes: Number(answers.duration_minutes) || 45,
      notes: template.notes,
      gym_location: typeof answers.gym_location === "string" ? answers.gym_location : undefined,
      metadata: {
        objective: String(answers.objective ?? "simulation_complete"),
        level: answers.level,
        station: answers.station,
        segments: template.segments ?? [],
      },
    };
  },

  toSessionView(record: WorkoutRecordDraft): SessionView {
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    const objective =
      typeof metadata.objective === "string" ? metadata.objective : "simulation_complete";
    const objectiveLabel = OBJECTIVE_LABEL[objective] ?? objective;

    return {
      title: record.name,
      summaryStats: baseSummaryStats(record, [{ label: "Type de séance", value: objectiveLabel }]),
      segments: segmentsFromMetadata(record),
      notes: record.notes,
    };
  },

  buildLiveSegments: genericBuildLiveSegments,
  formatLiveSegment: genericFormatLiveSegment,

  historyPresentation: {
    cardVariant: "metric-grid",
  },
};
