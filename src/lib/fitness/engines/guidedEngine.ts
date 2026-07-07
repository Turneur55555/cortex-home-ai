// ============================================================
// GuidedActivityEngine — moteur "Activités accompagnées" (phase 6).
//
// DIFFÉRENCE FONDAMENTALE avec tous les moteurs précédents (muscu/
// cardio/hyrox/course) : l'utilisateur participe déjà à un cours
// encadré (Pilates Lagree, Yoga, Mobilité, Stretching...). Le Sensei
// n'invente JAMAIS de séance ici — son rôle est d'accompagner le cours,
// pas de le remplacer. `generate()` produit donc une FICHE DESCRIPTIVE
// du cours (intensité, groupes sollicités, bénéfices, calories
// estimées, récupération conseillée), jamais une prescription
// (aucun "fais 10 répétitions", aucune allure/charge à atteindre).
// Le contrat WorkoutEngine.generate() reste inchangé — "générer" veut
// simplement dire ici "compiler une description", pas "inventer un plan".
//
// Familles couvertes aujourd'hui (ACTIVITIES, ci-dessous) : Pilates
// Lagree, Yoga, Mobilité, Stretching. Extensible en ajoutant une entrée
// à ACTIVITIES + son profil dans ACTIVITY_PROFILES — CrossFit (cours),
// Danse, Aquagym, Natation encadrée, cours collectifs divers pourront
// s'ajouter demain sans toucher le reste du moteur (même mécanique que
// les activités de CardioWorkoutEngine, validée en Phase 3).
//
// "Groupes musculaires sollicités" est un texte 100% INFORMATIF — il
// n'utilise PAS `MuscleId`/`muscleMapping.ts` (le vocabulaire du moteur
// de récupération/Rang) et n'alimente JAMAIS ce moteur : la frontière
// feedsRankEngine=false reste étanche même si le vocabulaire se
// ressemble en surface.
//
// Aucune notion de RPE (ressenti d'effort 1-10) : décision de Nathan
// du 02/07 (supprimé partout, jamais réintroduit). "Intensité estimée"
// ci-dessous est un LIBELLÉ FIXE par activité (propriété du cours), pas
// une auto-évaluation demandée à l'utilisateur.
//
// Calories estimées : formule kcal/min par activité x durée, pour un
// poids de référence adulte moyen (heuristique déclarée, même esprit
// que les tables d'allure de Course ou de charge HYROX) — pas une
// mesure individualisée (nécessiterait un poids réel + un vrai
// connecteur, non implémenté).
//
// feedsRankEngine=false : contenu 100% dans workouts.metadata. XP/
// streak/quêtes ("séances cette semaine") et achievements génériques
// (ex: recovery_weekly_target) fonctionnent déjà pour ce moteur SANS
// AUCUN CODE SUPPLÉMENTAIRE, car `compute_fitness_stats` (SQL, source
// de useUserStats/useActivityStreak/useGoalsWithProgress) compte la
// table `workouts` sans filtrer sur `discipline` — vérifié dans le
// code serveur avant d'écrire ce moteur, pas supposé. Une catégorie de
// succès DÉDIÉE ("guided", definitions/guided.ts) a été ajoutée cette
// phase pour un déblocage explicite propre à cette famille.
//
// cardVariant: "guided-session" — valeur posée dès la Phase 1 dans
// HistoryPresentation mais jamais consommée avant ce moteur.
// ============================================================

import { durationQuestion, gymLocationQuestion, levelQuestion } from "./sharedQuestions";
import { baseSummaryStats, segmentsFromMetadata } from "./sessionViewHelpers";
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

// Familles couvertes — extensible sans toucher le reste du fichier.
const ACTIVITIES = ["Pilates Lagree", "Yoga", "Mobilité", "Stretching"] as const;
type Activity = (typeof ACTIVITIES)[number];

interface ActivityProfile {
  intensityLabel: string;
  musclesInvolved: string;
  benefits: string;
  kcalPerMinute: number;
  recoveryHours: number;
}

const ACTIVITY_PROFILES: Record<Activity, ActivityProfile> = {
  "Pilates Lagree": {
    intensityLabel: "Modérée à élevée",
    musclesInvolved: "Sangle abdominale, fessiers, cuisses, dos",
    benefits: "Renforcement musculaire profond, gainage, posture",
    kcalPerMinute: 6,
    recoveryHours: 24,
  },
  Yoga: {
    intensityLabel: "Faible à modérée",
    musclesInvolved: "Corps entier (mobilité et gainage doux)",
    benefits: "Souplesse, respiration, gestion du stress",
    kcalPerMinute: 3,
    recoveryHours: 12,
  },
  Mobilité: {
    intensityLabel: "Faible",
    musclesInvolved: "Articulations, chaîne postérieure",
    benefits: "Amplitude articulaire, prévention des blessures",
    kcalPerMinute: 2.5,
    recoveryHours: 12,
  },
  Stretching: {
    intensityLabel: "Faible",
    musclesInvolved: "Chaîne musculaire ciblée selon la séance",
    benefits: "Récupération, relâchement musculaire",
    kcalPerMinute: 2,
    recoveryHours: 8,
  },
};

function profileFor(activity: string): ActivityProfile {
  return ACTIVITY_PROFILES[activity as Activity] ?? ACTIVITY_PROFILES.Yoga;
}

const QUESTIONS: SenseiQuestionSpec[] = [
  {
    id: "activity",
    prompt: "Quel cours suis-tu aujourd'hui ?",
    type: "single-choice",
    options: ACTIVITIES.map((a) => ({ value: a, label: a })),
  },
  levelQuestion,
  durationQuestion(45),
  gymLocationQuestion,
];

export const GuidedActivityEngine: WorkoutEngine = {
  id: "guided",
  label: "Activité accompagnée",
  comingSoon: false,
  feedsRankEngine: false,
  icon: "Sparkles",
  accentClassName: "text-violet-400",
  questions: QUESTIONS,

  async generate(answers: SenseiAnswers, _context?: SenseiContext): Promise<WorkoutTemplate> {
    const activity = String(answers.activity ?? "Yoga");
    const profile = profileFor(activity);

    const segment: SessionSegment = {
      label: activity,
      stats: [
        { label: "Groupes sollicités", value: profile.musclesInvolved },
        { label: "Bénéfices attendus", value: profile.benefits },
      ],
    };

    return {
      name: activity,
      exercises: [],
      segments: [segment],
      notes:
        "Fiche descriptive du cours — le Sensei n'invente rien, il accompagne ta séance encadrée.",
    };
  },

  toWorkoutRecord(template: WorkoutTemplate, answers: SenseiAnswers): WorkoutRecordDraft {
    const activity = String(answers.activity ?? "Yoga");
    const duration = Number(answers.duration_minutes) || 45;
    const profile = profileFor(activity);
    return {
      discipline: "guided",
      name: template.name,
      duration_minutes: duration,
      notes: template.notes,
      gym_location: typeof answers.gym_location === "string" ? answers.gym_location : undefined,
      metadata: {
        activity,
        level: answers.level,
        intensityLabel: profile.intensityLabel,
        caloriesEstimate: Math.round(profile.kcalPerMinute * duration),
        recoveryHoursEstimate: profile.recoveryHours,
        segments: template.segments ?? [],
      },
    };
  },

  toSessionView(record: WorkoutRecordDraft): SessionView {
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    const intensityLabel =
      typeof metadata.intensityLabel === "string" ? metadata.intensityLabel : "—";
    const caloriesEstimate =
      typeof metadata.caloriesEstimate === "number" ? metadata.caloriesEstimate : undefined;
    const recoveryHours =
      typeof metadata.recoveryHoursEstimate === "number"
        ? metadata.recoveryHoursEstimate
        : undefined;

    const extra: SessionStat[] = [{ label: "Intensité estimée", value: intensityLabel }];
    if (caloriesEstimate !== undefined) {
      extra.push({ label: "Calories estimées", value: `~${caloriesEstimate} kcal` });
    }
    if (recoveryHours !== undefined) {
      extra.push({ label: "Récupération conseillée", value: `~${recoveryHours} h` });
    }

    return {
      title: record.name,
      summaryStats: baseSummaryStats(record, extra),
      segments: segmentsFromMetadata(record),
      notes: record.notes,
    };
  },

  historyPresentation: {
    cardVariant: "guided-session",
  },
};
