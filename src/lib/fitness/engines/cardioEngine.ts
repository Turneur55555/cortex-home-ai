// ============================================================
// CardioWorkoutEngine — famille Cardio (phase 3, retouché phase 4).
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
// Phase 4 : bascule sur `WorkoutTemplate.segments` + les helpers partagés
// (sessionViewHelpers.ts), extraits en préparation du moteur HYROX — la
// génération construit les stats UNE fois, `toSessionView` les relit
// telles quelles, aucune re-dérivation dupliquée entre les deux.
//
// Ce fichier ne doit JAMAIS contenir de logique propre à une autre
// discipline. Toute évolution des paramètres cardio (nouvelle machine,
// nouveau champ) vit ici et nulle part ailleurs.
// ============================================================

import { durationQuestion, gymLocationQuestion } from "./sharedQuestions";
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
  SessionStat,
  SessionView,
  WorkoutEngine,
  WorkoutRecordDraft,
  WorkoutTemplate,
} from "./types";

export const ACTIVITIES = [
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

// Clés de paramètres propres à l'activité (tout sauf activity/duration/lieu,
// qui sont portées par des champs dédiés de WorkoutRecordDraft).
const METADATA_KEYS = Object.keys(PARAM_META);

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

/** Construit les stats affichables à partir des réponses — appelé UNE
 *  fois à la génération, jamais re-dérivé ensuite (voir sessionViewHelpers.ts). */
function buildStats(answers: SenseiAnswers): SessionStat[] {
  return METADATA_KEYS.filter((key) => answers[key] !== undefined).map((key) => {
    const meta = PARAM_META[key];
    const value = answers[key];
    return { label: meta.label, value: meta.unit ? `${value} ${meta.unit}` : String(value) };
  });
}

/** Miroir numérique brut de `buildStats` (voir `SessionSegment.metrics` —
 *  solution transitoire Phase 1). "escalier_level" est renommé depuis la
 *  clé de réponse `level` pour ne jamais entrer en collision avec un
 *  futur "niveau" numérique d'une autre discipline dans
 *  SEGMENT_METRIC_CONFIG (table globale à toutes les disciplines). */
function buildMetrics(answers: SenseiAnswers): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const key of METADATA_KEYS) {
    const value = answers[key];
    if (typeof value !== "number") continue;
    metrics[key === "level" ? "escalier_level" : key] = value;
  }
  return metrics;
}

// ── Lot V4 (2026-07-16) — MODÈLE MÉTIER DE LA RÉPÉTITION par activité ──
// "Une répétition de Tapis/Marche inclinée = 1 km (vitesse, inclinaison)",
// "une répétition de Rameur = 1 bloc (distance, temps, allure /500 m,
// watts, cadence, FC)"... Le composant de carte reste 100% partagé : c'est
// CETTE table qui rend chaque activité spécifique. Correspondance par
// motif sur le libellé (pas par enum) pour couvrir aussi les exercices
// tapés librement au picker ("Tapis de course", "Rameur 2000m"...).
const REP_MODELS: Array<{ pattern: RegExp; keys: string[] }> = [
  {
    pattern: /rameur|rowing|row\b/i,
    keys: [
      "distance_m",
      "duration_s",
      "pace_per_500m",
      "watts",
      "stroke_rate_spm",
      "heart_rate_bpm",
    ],
  },
  // Lot V6 (Tapis de course) : le tapis N'EST PAS une marche inclinée.
  // Même unité métier (le kilomètre) mais identités distinctes — sur
  // tapis, vitesse/allure/FC racontent le kilomètre et l'inclinaison
  // n'est qu'un réglage occasionnel ; sur marche inclinée, l'inclinaison
  // EST l'exercice. `/marche/` testé d'abord : "Marche sur tapis" reste
  // une marche.
  { pattern: /marche/i, keys: ["speed_kmh", "incline_pct", "heart_rate_bpm"] },
  {
    pattern: /tapis|treadmill/i,
    keys: ["speed_kmh", "pace_min_per_km", "heart_rate_bpm", "incline_pct"],
  },
  { pattern: /assault/i, keys: ["distance_m", "watts", "calories_estimate", "heart_rate_bpm"] },
  {
    pattern: /v[ée]lo|bike|cycl/i,
    keys: ["distance_m", "resistance", "cadence_rpm", "heart_rate_bpm"],
  },
  { pattern: /escalier|stair/i, keys: ["escalier_level", "duration_min", "heart_rate_bpm"] },
  { pattern: /elliptique/i, keys: ["distance_m", "resistance", "heart_rate_bpm"] },
];

function repMetricKeysForImpl(exerciseLabel: string): string[] {
  const model = REP_MODELS.find((m) => m.pattern.test(exerciseLabel));
  return model ? model.keys : ["distance_m", "duration_min"];
}

/** Seeds de séance live spécifiques Cardio (lot V4.1, retour de Nathan) :
 *  - Marche inclinée / Tapis : LE KILOMÈTRE EST L'UNITÉ MÉTIER — la
 *    séance démarre sur la répétition "Km 1" (vitesse/inclinaison
 *    pré-remplies depuis les réponses), et l'utilisateur AJOUTE
 *    simplement un nouveau kilomètre à mesure qu'il avance. AUCUNE
 *    estimation automatique, AUCUNE conversion durée → kilomètres
 *    (l'ancienne heuristique durée × vitesse est supprimée sur demande
 *    explicite). Le numéro de kilomètre = la capsule de la répétition.
 *  - Rameur : une répétition = un intervalle LIBRE (500 m, 750 m,
 *    2000 m...) — le premier bloc reprend la distance choisie au Sensei
 *    comme point de départ, jamais un format imposé ; les intervalles
 *    suivants s'ajoutent librement (mêmes champs, voir repMetricKeysFor).
 *  - Autres activités : comportement générique inchangé. */
function buildLiveSegmentsImpl(
  template: WorkoutTemplate,
  draft: WorkoutRecordDraft,
): ReturnType<typeof genericBuildLiveSegments> {
  const first = template.segments?.[0];
  if (first && /marche|tapis|treadmill/i.test(first.label)) {
    const metrics = first.metrics ?? {};
    const perKm: Record<string, number> = {};
    if (typeof metrics.speed_kmh === "number") perKm.speed_kmh = metrics.speed_kmh;
    if (typeof metrics.incline_pct === "number") perKm.incline_pct = metrics.incline_pct;
    return [{ label: first.label, metrics: perKm }];
  }
  return genericBuildLiveSegments(template, draft);
}

export const CardioWorkoutEngine: WorkoutEngine = {
  id: "cardio",
  label: "Cardio",
  comingSoon: false,
  feedsRankEngine: false,
  icon: "HeartPulse",
  accentClassName: "text-pink-400",
  // Phase A (15/07/2026) : extension du live-tracking générique
  // (pilote Course, 09/07/2026) — voir sessionViewHelpers.ts.
  supportsLiveTracking: true,
  questions: QUESTIONS,

  async generate(answers: SenseiAnswers, _context?: SenseiContext): Promise<WorkoutTemplate> {
    const activity = String(answers.activity ?? "Cardio");
    const duration = Number(answers.duration_minutes) || 30;
    return {
      name: `${activity} — ${duration} min`,
      exercises: [],
      segments: [{ label: activity, stats: buildStats(answers), metrics: buildMetrics(answers) }],
    };
  },

  toWorkoutRecord(template: WorkoutTemplate, answers: SenseiAnswers): WorkoutRecordDraft {
    const activity = String(answers.activity ?? "Cardio");
    const metadata: Record<string, unknown> = { activity, segments: template.segments ?? [] };
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

    return {
      title: record.name,
      summaryStats: baseSummaryStats(record, [{ label: "Activité", value: activity }]),
      segments: segmentsFromMetadata(record),
      notes: record.notes,
    };
  },

  buildLiveSegments: buildLiveSegmentsImpl,
  formatLiveSegment: genericFormatLiveSegment,
  repMetricKeysFor: repMetricKeysForImpl,

  historyPresentation: {
    cardVariant: "metric-grid",
  },
};
