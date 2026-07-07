// ============================================================
// CardioWorkoutEngine — famille Cardio (phase 3).
//
// Une seule discipline "cardio" qui couvre plusieurs activités
// (Marche inclinée, Escalier, Vélo, Elliptique, Assault Bike, Rameur),
// chacune avec ses propres paramètres, via les questions conditionnelles
// (`when`) posées en phase 1 pour exactement ce cas.
//
// Génération DÉLIBÉRÉMENT déterministe, sans appel IA : contrairement à
// la musculation (choix des exercices, ordre, charges) ou HYROX/Course
// (structure de blocs à composer), une séance cardio n'a rien à
// "programmer" — l'utilisateur a déjà entièrement spécifié son activité
// et ses paramètres. Générer via un LLM ici ajouterait coût et latence
// pour zéro valeur ajoutée.
//
// Ce fichier ne doit JAMAIS contenir de logique propre à une autre
// discipline. Toute évolution des paramètres cardio (nouvelle machine,
// nouveau champ) vit ici et nulle part ailleurs.
// ============================================================

import { durationQuestion, gymLocationQuestion } from "./sharedQuestions";
import type {
  SenseiAnswers,
  SenseiContext,
  SenseiQuestionSpec,
  SessionStat,
  SessionView,
  WorkoutEngine,
  WorkoutRecordDraft,
  WorkoutTemplate,
} from "./types";

const ACTIVITIES = [
  "Marche inclinée",
  "Escalier",
  "Vélo",
  "Elliptique",
  "Assault Bike",
  "Rameur",
] as const;

const isActivity = (answers: SenseiAnswers, ...names: string[]) =>
  names.includes(String(answers.activity ?? ""));

// Clé de réponse → libellé + unité pour l'affichage générique (SessionView).
// Connaissance 100% interne à Cardio — aucune autre discipline n'a besoin
// de connaître ces clés ni ce format.
const PARAM_META: Record<string, { label: string; unit?: string }> = {
  speed_kmh: { label: "Vitesse", unit: "km/h" },
  incline_pct: { label: "Inclinaison", unit: "%" },
  level: { label: "Niveau" },
  resistance: { label: "Résistance" },
  cadence_rpm: { label: "Cadence", unit: "rpm" },
  distance_m: { label: "Distance", unit: "m" },
  intensity: { label: "Intensité" },
};

const QUESTIONS: SenseiQuestionSpec[] = [
  {
    id: "activity",
    prompt: "Quelle activité cardio ?",
    type: "single-choice",
    options: ACTIVITIES.map((a) => ({ value: a, label: a })),
  },
  durationQuestion(30),
  {
    id: "speed_kmh",
    prompt: "À quelle vitesse (km/h) ?",
    type: "number",
    defaultValue: 5.5,
    when: (a) => isActivity(a, "Marche inclinée"),
  },
  {
    id: "incline_pct",
    prompt: "Quelle inclinaison (%) ?",
    type: "number",
    defaultValue: 10,
    when: (a) => isActivity(a, "Marche inclinée"),
  },
  {
    id: "level",
    prompt: "Quel niveau (1 à 20) ?",
    type: "number",
    defaultValue: 8,
    when: (a) => isActivity(a, "Escalier"),
  },
  {
    id: "resistance",
    prompt: "Quelle résistance (1 à 20) ?",
    type: "number",
    defaultValue: 10,
    when: (a) => isActivity(a, "Vélo", "Elliptique"),
  },
  {
    id: "cadence_rpm",
    prompt: "Quelle cadence (rpm) ?",
    type: "number",
    defaultValue: 80,
    when: (a) => isActivity(a, "Vélo"),
  },
  {
    id: "distance_m",
    prompt: "Quelle distance (mètres) ?",
    type: "number",
    defaultValue: 2000,
    when: (a) => isActivity(a, "Rameur"),
  },
  {
    id: "intensity",
    prompt: "Quelle intensité ?",
    type: "single-choice",
    options: [
      { value: "légère", label: "Légère" },
      { value: "modérée", label: "Modérée" },
      { value: "intense", label: "Intense" },
    ],
    defaultValue: "modérée",
    when: (a) => isActivity(a, "Elliptique", "Rameur", "Assault Bike"),
  },
  gymLocationQuestion,
];

// Clés de métadonnées propres à l'activité (tout sauf activity/duration/lieu,
// qui sont portées par des champs dédiés de WorkoutRecordDraft).
const METADATA_KEYS = [
  "speed_kmh",
  "incline_pct",
  "level",
  "resistance",
  "cadence_rpm",
  "distance_m",
  "intensity",
];

export const CardioWorkoutEngine: WorkoutEngine = {
  id: "cardio",
  label: "Cardio",
  comingSoon: false,
  feedsRankEngine: false,
  questions: QUESTIONS,

  async generate(answers: SenseiAnswers, _context?: SenseiContext): Promise<WorkoutTemplate> {
    const activity = String(answers.activity ?? "Cardio");
    const duration = Number(answers.duration_minutes) || 30;
    return {
      name: `${activity} — ${duration} min`,
      exercises: [],
    };
  },

  toWorkoutRecord(template: WorkoutTemplate, answers: SenseiAnswers): WorkoutRecordDraft {
    const activity = String(answers.activity ?? "Cardio");
    const metadata: Record<string, unknown> = { activity };
    for (const key of METADATA_KEYS) {
      if (answers[key] !== undefined) metadata[key] = answers[key];
    }
    return {
      discipline: "cardio",
      name: template.name,
      duration_minutes: Number(answers.duration_minutes) || 30,
      notes: template.notes,
      gym_location: typeof answers.gym_location === "string" ? answers.gym_location : undefined,
      metadata,
    };
  },

  toSessionView(record: WorkoutRecordDraft): SessionView {
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    const activity = typeof metadata.activity === "string" ? metadata.activity : "Cardio";

    const stats: SessionStat[] = Object.entries(metadata)
      .filter(([key]) => key !== "activity")
      .map(([key, value]) => {
        const meta = PARAM_META[key] ?? { label: key };
        return { label: meta.label, value: meta.unit ? `${value} ${meta.unit}` : String(value) };
      });

    return {
      title: record.name,
      summaryStats: [
        { label: "Durée", value: `${record.duration_minutes} min` },
        { label: "Activité", value: activity },
      ],
      segments: [{ label: activity, stats }],
      notes: record.notes,
    };
  },

  historyPresentation: {
    cardVariant: "metric-grid",
  },
};
