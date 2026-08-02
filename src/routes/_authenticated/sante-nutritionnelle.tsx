import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Battery,
  Beef,
  Brain,
  Droplet,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Lock,
  Moon,
  Ruler,
  Scale,
  Scan,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Unlock,
  Wheat,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBodyMeasurements, useWorkouts } from "@/hooks/use-fitness";
import { useLatestBodyWeight } from "@/hooks/useLatestBodyWeight";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useActivityForDate, useLatestActivity } from "@/hooks/useDailyActivity";
import { useMetabolicProfile } from "@/hooks/useMetabolicProfile";
import { useNutrition, useNutritionRange } from "@/hooks/useNutritionData";
import {
  useApplyCalorieGoal,
  useApplyMacroGoal,
  useLastCalorieGoalAdjustment,
  useLastMacroGoalAdjustment,
  useNutritionGoals,
  useUpdateCalorieStrategyPreference,
  useUpdateMacroStrategyPreference,
} from "@/hooks/useNutritionGoals";
import { useNutritionTotals } from "@/hooks/useNutritionTotals";
import { findLatestValue, findPreviousValue } from "@/lib/fitness/body";
import { bmiCategory, computeBMI, computeBMR } from "@/lib/fitness/metabolism";
import { computeWeeklyActivitySummary } from "@/lib/fitness/activitySummary";
import { computeDailyEAT } from "@/lib/fitness/eat";
import { computeTEF } from "@/lib/fitness/tef";
import { computeNEAT, isNeatActivityLevel } from "@/lib/fitness/neat";
import { computeDailyTDEE } from "@/lib/fitness/tdee";
import { ADAPTIVE_TDEE_THRESHOLDS, computeAdaptiveTdee } from "@/lib/fitness/adaptiveTdee";
import { computeAdaptiveTdeeCalibration } from "@/lib/fitness/adaptiveTdeeCalibration";
import { buildMetabolicAnalysis } from "@/lib/fitness/metabolicAnalysis";
import {
  AUTO_CALORIE_ADJUSTMENT_CONFIG,
  CALORIE_STRATEGY_RATES,
  compareCalorieGoal,
  computeCalorieStrategy,
  evaluateAutoCalorieAdjustment,
  type CalorieStrategyGoal,
  type FatLossRate,
  type MuscleGainRate,
} from "@/lib/fitness/calorieStrategy";
import {
  clampAutomaticProteinTarget,
  compareMacros,
  computeMacroStrategy,
  evaluateAutoMacroAdjustment,
} from "@/lib/fitness/macroStrategy";
import {
  computeLeanMassProteinTargetG,
  selectBodyCompositionForNutrition,
  type BodyCompositionCandidate,
} from "@/lib/fitness/bodyCompositionForNutrition";
import { BODY_FAT_METHOD_LABELS, CONFIDENCE_LABELS } from "@/lib/fitness/bodyComposition";
import {
  computeBodyFatTargetProjection,
  computeGoalTrajectory,
} from "@/lib/fitness/goalTrajectory";
import { evaluateGoalProgress, isWeightGoalLikelyReached } from "@/lib/fitness/goalProgress";
import {
  useCancelPhysicalGoal,
  useCompletePhysicalGoal,
  usePhysicalGoal,
  useUpdatePhysicalGoalRate,
} from "@/hooks/usePhysicalGoal";
import { PhysicalGoalSheet } from "@/components/fitness/PhysicalGoalSheet";
import { addDaysYMD, localDateYMD } from "@/lib/dates";
import { StatTile } from "@/components/fitness/StatTile";
import { ComingSoonTile } from "@/components/fitness/ComingSoonTile";
import { InsufficientDataTile } from "@/components/fitness/InsufficientDataTile";
import { ComingSoonCard } from "@/components/fitness/ComingSoonCard";
import { MetabolicProfileSheet } from "@/components/fitness/MetabolicProfileSheet";
import { MetabolicAnalysisSheet } from "@/components/fitness/MetabolicAnalysisSheet";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/sante-nutritionnelle")({
  head: () => ({
    meta: [
      { title: "Santé nutritionnelle — ICORTEX" },
      {
        name: "description",
        content: "Le tableau de bord central de ta santé métabolique et nutritionnelle.",
      },
    ],
  }),
  component: SanteNutritionnellePage,
});

const BMI_LABELS: Record<ReturnType<typeof bmiCategory>, string> = {
  insuffisance: "Insuffisance pondérale",
  normal: "Corpulence normale",
  surpoids: "Surpoids",
  obesite: "Obésité",
};

/** Libellé du rythme (`CALORIE_STRATEGY_RATES`) pour un objectif physique — `fat_loss`/`muscle_gain` seulement, `maintenance` n'a pas de rythme. */
function rateLabelFor(goal: CalorieStrategyGoal, rate: FatLossRate | MuscleGainRate): string {
  if (goal === "fat_loss" && rate in CALORIE_STRATEGY_RATES.fat_loss) {
    return CALORIE_STRATEGY_RATES.fat_loss[rate as FatLossRate].label;
  }
  if (goal === "muscle_gain" && rate in CALORIE_STRATEGY_RATES.muscle_gain) {
    return CALORIE_STRATEGY_RATES.muscle_gain[rate as MuscleGainRate].label;
  }
  return rate;
}

function SanteNutritionnellePage() {
  const today = localDateYMD();
  const [showMetabolicSheet, setShowMetabolicSheet] = useState(false);
  const [showAnalysisSheet, setShowAnalysisSheet] = useState(false);
  const [showAutoModeConfirm, setShowAutoModeConfirm] = useState(false);
  const [showMacroAutoModeConfirm, setShowMacroAutoModeConfirm] = useState(false);
  const [showPhysicalGoalSheet, setShowPhysicalGoalSheet] = useState(false);

  const { data: bodyRows, isLoading: bodyLoading } = useBodyMeasurements();
  const { data: latestWeight } = useLatestBodyWeight();
  const { prefs } = useUserPreferences();
  const { data: metabolicProfile, isLoading: metabolicProfileLoading } = useMetabolicProfile();

  const { data: nutritionRows, isLoading: nutritionLoading } = useNutrition(today);
  const { data: nutritionGoals } = useNutritionGoals();
  const updateCalorieStrategyPreference = useUpdateCalorieStrategyPreference();
  const applyCalorieGoal = useApplyCalorieGoal();
  const { data: lastCalorieAdjustment } = useLastCalorieGoalAdjustment();
  const updateMacroStrategyPreference = useUpdateMacroStrategyPreference();
  const applyMacroGoal = useApplyMacroGoal();
  const { data: lastMacroAdjustment } = useLastMacroGoalAdjustment();
  const { data: physicalGoal } = usePhysicalGoal();
  const cancelPhysicalGoal = useCancelPhysicalGoal();
  const completePhysicalGoal = useCompletePhysicalGoal();
  const updatePhysicalGoalRate = useUpdatePhysicalGoalRate();
  const { totals, remaining } = useNutritionTotals(nutritionRows, nutritionGoals ?? null);

  const adaptiveWindowStart = addDaysYMD(
    today,
    -(ADAPTIVE_TDEE_THRESHOLDS.ANALYSIS_WINDOW_DAYS - 1),
  );
  const { data: nutritionRangeRows, isLoading: nutritionRangeLoading } = useNutritionRange(
    adaptiveWindowStart,
    today,
  );

  const { data: workouts, isLoading: workoutsLoading } = useWorkouts();
  const { data: activity } = useLatestActivity();
  const { data: todayActivity, isLoading: todayActivityLoading } = useActivityForDate(today);

  const weight = findLatestValue(bodyRows, "weight") ?? latestWeight ?? null;
  const previousWeight = findPreviousValue(bodyRows, "weight");
  const weightDelta =
    weight != null && previousWeight != null
      ? Math.round((weight - previousWeight) * 10) / 10
      : null;
  const bmi =
    weight != null && prefs.height_cm != null ? computeBMI(weight, prefs.height_cm) : null;

  const metabolicSex = metabolicProfile?.sex ?? null;
  const metabolicAge = metabolicProfile?.age ?? null;
  const metabolicProfileIncomplete =
    !metabolicProfileLoading && (metabolicSex == null || metabolicAge == null);
  const activityLevelMissing =
    !metabolicProfileLoading &&
    !metabolicProfileIncomplete &&
    !isNeatActivityLevel(metabolicProfile?.activity_level);
  const bmr =
    metabolicSex != null && metabolicAge != null && weight != null && prefs.height_cm != null
      ? computeBMR(metabolicSex, metabolicAge, weight, prefs.height_cm)
      : null;

  const weeklyActivity = computeWeeklyActivitySummary(workouts ?? undefined, weight, 7);
  const dailyEAT = computeDailyEAT(workouts ?? undefined, weight, today);
  const dailyTEF = computeTEF(totals);
  const dailyNEAT = computeNEAT({
    bmr,
    activityLevel: metabolicProfile?.activity_level,
    activeCalories: todayActivity?.active_calories,
    steps: todayActivity?.steps,
    weightKg: weight,
    heightCm: prefs.height_cm,
    eatKcal: dailyEAT.kcal,
  });

  const dailyTDEE = computeDailyTDEE({
    bmr,
    neat: { kcal: dailyNEAT.kcal, method: dailyNEAT.method },
    eatKcal: dailyEAT.kcal,
    tefKcal: dailyTEF.totalKcal,
  });

  const adaptiveTdee = computeAdaptiveTdee({
    weightSamples: bodyRows ?? [],
    nutritionLogs: nutritionRangeRows ?? [],
    modeledTdeeKcal: dailyTDEE.totalKcal,
    today,
  });

  const adaptiveTdeeCalibration = computeAdaptiveTdeeCalibration({
    modeledTdeeKcal: dailyTDEE.totalKcal,
    observedTdeeKcal: adaptiveTdee.observedTdeeKcal,
    observedStatus: adaptiveTdee.status,
    observedConfidence: adaptiveTdee.confidence,
  });

  const calorieGoal = nutritionGoals?.calories ?? null;

  const metabolicAnalysis = buildMetabolicAnalysis({
    dailyTDEE,
    adaptiveTdee,
    calibration: adaptiveTdeeCalibration,
    calorieGoalKcal: calorieGoal,
  });

  // Préférence de stratégie persistée (nutrition_goals.goal/target_rate/
  // calorie_strategy_mode) — jamais un state React local reparti à zéro à
  // chaque ouverture de page (limite connue de la Phase 4A, résolue ici).
  const strategyMode = nutritionGoals?.calorieStrategyMode ?? "manual";
  const strategyGoal: CalorieStrategyGoal = nutritionGoals?.goal ?? "maintenance";
  const strategyRate: FatLossRate | MuscleGainRate = nutritionGoals?.targetRate ?? "moderate";

  const calorieStrategy = computeCalorieStrategy({
    goal: strategyGoal,
    rate: strategyGoal === "maintenance" ? undefined : strategyRate,
    weightKg: weight,
    calibration: adaptiveTdeeCalibration,
  });
  const calorieGoalComparison = compareCalorieGoal(
    calorieGoal,
    calorieStrategy.recommendedCalories,
  );

  // Répartition macros — travaille sur l'objectif calorique ACTIF
  // (`calorieGoal`, nutrition_goals.calories), jamais sur une
  // recommandation Cortex pas encore appliquée (§2 du brief Phase 5A).
  // Les verrous (Phase 5B) transmettent la valeur ACTIVE correspondante —
  // jamais une valeur dédiée séparée (§4 du brief Phase 5B).
  const macroStrategyMode = nutritionGoals?.macroStrategyMode ?? "manual";
  const proteinLocked = nutritionGoals?.proteinLocked ?? false;
  const carbsLocked = nutritionGoals?.carbsLocked ?? false;
  const fatLocked = nutritionGoals?.fatLocked ?? false;

  // Phase 7 — Body Fat n'est JAMAIS une dépendance obligatoire : sans
  // composition corporelle exploitable, tout ce qui suit retombe
  // silencieusement sur le pipeline poids corporel Phase 5 (§30 du brief).
  // `bodyRows` est déjà trié du plus récent au plus ancien
  // (`useBodyMeasurements`) — même ordre attendu par
  // `selectBodyCompositionForNutrition`.
  const bodyCompositionCandidates: BodyCompositionCandidate[] = (bodyRows ?? []).map((row) => ({
    date: row.date,
    weightKg: row.weight,
    bodyFatPercent: row.body_fat,
    method: row.body_fat_method,
  }));
  const selectedBodyComposition = selectBodyCompositionForNutrition(
    bodyCompositionCandidates,
    today,
  );
  const rawLeanMassProteinTargetG = selectedBodyComposition
    ? computeLeanMassProteinTargetG(strategyGoal, selectedBodyComposition.leanMassKg)
    : null;
  // Réservé au mode AUTOMATIQUE : `null` tant que la composition
  // corporelle sélectionnée n'est pas assez fiable pour un déclenchement
  // automatique (§21/§22 du brief) — une estimation photo reste utilisable
  // pour la recommandation MANUELLE ci-dessous, jamais pour l'automatique
  // seule. Plafonné (§24/§41) pour qu'un seul ajustement automatique ne
  // saute jamais brutalement.
  const autoLeanMassProteinTargetG =
    selectedBodyComposition?.usableForAutomaticAdjustment && rawLeanMassProteinTargetG != null
      ? clampAutomaticProteinTarget(rawLeanMassProteinTargetG, nutritionGoals?.proteins ?? null)
      : null;

  // Phase 8 — objectif physique : ORCHESTRE les moteurs existants
  // (calorieStrategy pour la définition du rythme, adaptiveTdee pour le
  // poids lissé/la tendance déjà calculés plus haut) — ne recalcule
  // JAMAIS un TDEE/une calorie/une macro elle-même (§28/§29/§30/§31 du
  // brief). Le poids "actuel" utilisé pour la trajectoire préfère le
  // poids LISSÉ (`adaptiveTdee.weight.endTrendKg`) au poids brut, avec
  // repli explicite si pas encore assez de données (§41).
  const goalCurrentWeightKg = adaptiveTdee.weight.endTrendKg ?? weight;
  const physicalGoalTrajectory = physicalGoal
    ? computeGoalTrajectory({
        goal: physicalGoal.goal,
        targetRate: physicalGoal.targetRate,
        currentWeightKg: goalCurrentWeightKg,
        targetWeightKg: physicalGoal.targetWeightKg,
        todayIso: today,
      })
    : null;
  const physicalGoalBodyFatProjection =
    physicalGoal && physicalGoal.targetBodyFatPercent != null
      ? computeBodyFatTargetProjection({
          currentWeightKg: goalCurrentWeightKg,
          currentBodyFatPercent: selectedBodyComposition?.bodyFatPercent ?? null,
          targetBodyFatPercent: physicalGoal.targetBodyFatPercent,
          confidence: selectedBodyComposition?.confidence ?? null,
        })
      : null;
  const maintenanceToleranceKg = physicalGoalTrajectory?.maintenanceZoneKg
    ? (physicalGoalTrajectory.maintenanceZoneKg.maxKg -
        physicalGoalTrajectory.maintenanceZoneKg.minKg) /
      2
    : null;
  const physicalGoalProgress = physicalGoal
    ? evaluateGoalProgress({
        goal: physicalGoal.goal,
        weeklyTargetChangeKg: physicalGoalTrajectory?.weeklyTargetChangeKg ?? null,
        maintenanceToleranceKg,
        observedWeeklyTrendKg: adaptiveTdee.weight.weeklyTrendKg,
        measurementCount: adaptiveTdee.weight.measurementCount,
        windowCalendarDays: adaptiveTdee.window.calendarDays,
      })
    : null;
  const physicalGoalLikelyReached =
    physicalGoal != null &&
    isWeightGoalLikelyReached({
      targetWeightKg: physicalGoal.targetWeightKg,
      smoothedCurrentWeightKg: adaptiveTdee.weight.endTrendKg,
      measurementCount: adaptiveTdee.weight.measurementCount,
    });

  const macroStrategy = computeMacroStrategy({
    calories: calorieGoal,
    bodyWeightKg: weight,
    goal: strategyGoal,
    lockedProteinsG: proteinLocked ? (nutritionGoals?.proteins ?? null) : null,
    lockedCarbsG: carbsLocked ? (nutritionGoals?.carbs ?? null) : null,
    lockedFatsG: fatLocked ? (nutritionGoals?.fats ?? null) : null,
    proteinTargetOverrideG: rawLeanMassProteinTargetG,
  });
  const macroComparison = compareMacros(
    {
      proteins: nutritionGoals?.proteins ?? null,
      carbs: nutritionGoals?.carbs ?? null,
      fats: nutritionGoals?.fats ?? null,
    },
    macroStrategy,
  );

  const autoAdjustment = evaluateAutoCalorieAdjustment({
    mode: strategyMode,
    currentCalories: calorieGoal,
    recommendedCalories: calorieStrategy.recommendedCalories,
    calibrationState: adaptiveTdeeCalibration.state,
    lastAutoAdjustmentAt: nutritionGoals?.lastAutoAdjustmentAt ?? null,
    now: new Date().toISOString(),
  });
  const calorieAutoEligible =
    strategyMode === "automatic" &&
    autoAdjustment.eligible &&
    autoAdjustment.proposedCalories != null;

  // Recommandation macros À LA calorie PROPOSÉE par l'ajustement
  // automatique calorique (utile uniquement si les deux modes sont
  // automatiques ensemble — §21/§22 du brief Phase 5B, atomicité
  // calories+macros dans la même RPC). Override AUTOMATIQUE (clampé/
  // conditionné), jamais le brut réservé au manuel.
  const macroStrategyAtProposedCalories = computeMacroStrategy({
    calories: calorieAutoEligible ? autoAdjustment.proposedCalories : calorieGoal,
    bodyWeightKg: weight,
    goal: strategyGoal,
    lockedProteinsG: proteinLocked ? (nutritionGoals?.proteins ?? null) : null,
    lockedCarbsG: carbsLocked ? (nutritionGoals?.carbs ?? null) : null,
    lockedFatsG: fatLocked ? (nutritionGoals?.fats ?? null) : null,
    proteinTargetOverrideG: autoLeanMassProteinTargetG,
  });
  // Macros automatique SEUL (calories inchangées) — même override
  // automatique que ci-dessus, distinct de `macroStrategy` (qui sert
  // l'affichage/manuel et peut inclure une estimation photo non éligible
  // à l'automatique).
  const macroStrategyForAutoAtCurrentCalories = computeMacroStrategy({
    calories: calorieGoal,
    bodyWeightKg: weight,
    goal: strategyGoal,
    lockedProteinsG: proteinLocked ? (nutritionGoals?.proteins ?? null) : null,
    lockedCarbsG: carbsLocked ? (nutritionGoals?.carbs ?? null) : null,
    lockedFatsG: fatLocked ? (nutritionGoals?.fats ?? null) : null,
    proteinTargetOverrideG: autoLeanMassProteinTargetG,
  });
  const autoMacroAdjustmentAtCurrentCalories = evaluateAutoMacroAdjustment({
    mode: macroStrategyMode,
    recommended: macroStrategyForAutoAtCurrentCalories,
    currentProteinsG: nutritionGoals?.proteins ?? null,
    currentCarbsG: nutritionGoals?.carbs ?? null,
    currentFatsG: nutritionGoals?.fats ?? null,
  });
  const autoMacroAdjustmentAtProposedCalories = evaluateAutoMacroAdjustment({
    mode: macroStrategyMode,
    recommended: macroStrategyAtProposedCalories,
    currentProteinsG: nutritionGoals?.proteins ?? null,
    currentCarbsG: nutritionGoals?.carbs ?? null,
    currentFatsG: nutritionGoals?.fats ?? null,
  });

  // Évaluation à un moment concret (chargement de la page) — pas de faux
  // scheduler d'arrière-plan (Cortex est une PWA, voir calorieStrategy.ts).
  // `autoAppliedRef` protège contre les écritures répétées si la page se
  // re-render plusieurs fois avant que l'invalidation React Query ne
  // rafraîchisse `lastAutoAdjustmentAt` (qui fait ensuite retomber
  // `autoAdjustment.eligible` à false via le cooldown, naturellement).
  // `autoMacroAppliedRef` protège la même chose côté macros — jamais de
  // cooldown pour les macros (§26 du brief Phase 5B), seule la comparaison
  // "déjà aligné" + cette ref empêchent une double écriture.
  const autoAppliedRef = useRef(false);
  const autoMacroAppliedRef = useRef(false);

  // Cas central §21/§22 : Calories automatique ET Macros automatique se
  // déclenchent ensemble → une SEULE RPC transactionnelle (calories +
  // macros + les deux historiques), jamais deux appels séparés qui
  // pourraient laisser les macros désalignées si le second échouait.
  useEffect(() => {
    if (calorieAutoEligible && !autoAppliedRef.current && !applyCalorieGoal.isPending) {
      autoAppliedRef.current = true;
      const macroAuto =
        macroStrategyMode === "automatic" && autoMacroAdjustmentAtProposedCalories.eligible;
      if (macroAuto) {
        autoMacroAppliedRef.current = true;
      }
      applyCalorieGoal.mutate({
        mode: "automatic",
        appliedCalories: autoAdjustment.proposedCalories!,
        recommendedCalories: calorieStrategy.recommendedCalories,
        goal: strategyGoal,
        targetRate: strategyGoal === "maintenance" ? null : strategyRate,
        referenceTdeeKcal: calorieStrategy.referenceTdeeKcal,
        referenceSource: calorieStrategy.referenceSource,
        reason: `Ajustement automatique — pas maximal ${AUTO_CALORIE_ADJUSTMENT_CONFIG.MAX_AUTO_STEP_KCAL[adaptiveTdeeCalibration.state]} kcal (${adaptiveTdeeCalibration.state}).`,
        ...(macroAuto
          ? {
              macroMode: "automatic" as const,
              appliedProteins: autoMacroAdjustmentAtProposedCalories.proposedProteinsG!,
              appliedCarbs: autoMacroAdjustmentAtProposedCalories.proposedCarbsG!,
              appliedFats: autoMacroAdjustmentAtProposedCalories.proposedFatsG!,
              recommendedProteins: macroStrategyAtProposedCalories.proteinsG,
              recommendedCarbs: macroStrategyAtProposedCalories.carbsG,
              recommendedFats: macroStrategyAtProposedCalories.fatsG,
              proteinLocked,
              carbsLocked,
              fatLocked,
              macroReason: autoLeanMassProteinTargetG != null ? "lean_mass" : undefined,
            }
          : {}),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    calorieAutoEligible,
    autoAdjustment.proposedCalories,
    macroStrategyMode,
    autoMacroAdjustmentAtProposedCalories.eligible,
  ]);

  // Macros automatique SEUL (calories manuelles, ou calories automatiques
  // mais pas éligibles ce cycle-ci) — §23/§24 du brief : ce chemin ne
  // touche JAMAIS les calories (RPC `apply_macro_goal_adjustment`).
  useEffect(() => {
    if (
      !calorieAutoEligible &&
      macroStrategyMode === "automatic" &&
      autoMacroAdjustmentAtCurrentCalories.eligible &&
      !autoMacroAppliedRef.current &&
      !applyMacroGoal.isPending
    ) {
      autoMacroAppliedRef.current = true;
      applyMacroGoal.mutate({
        mode: "automatic",
        appliedProteins: autoMacroAdjustmentAtCurrentCalories.proposedProteinsG!,
        appliedCarbs: autoMacroAdjustmentAtCurrentCalories.proposedCarbsG!,
        appliedFats: autoMacroAdjustmentAtCurrentCalories.proposedFatsG!,
        recommendedProteins: macroStrategyForAutoAtCurrentCalories.proteinsG,
        recommendedCarbs: macroStrategyForAutoAtCurrentCalories.carbsG,
        recommendedFats: macroStrategyForAutoAtCurrentCalories.fatsG,
        calorieTarget: calorieGoal,
        goal: strategyGoal,
        proteinLocked,
        carbsLocked,
        fatLocked,
        reason: autoLeanMassProteinTargetG != null ? "lean_mass" : undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calorieAutoEligible, macroStrategyMode, autoMacroAdjustmentAtCurrentCalories.eligible]);

  const handleGoalChange = (goal: CalorieStrategyGoal) => {
    let targetRate: FatLossRate | MuscleGainRate | null = null;
    if (goal === "fat_loss") {
      targetRate = strategyGoal === "fat_loss" ? strategyRate : "moderate";
    } else if (goal === "muscle_gain") {
      targetRate = strategyGoal === "muscle_gain" ? (strategyRate as MuscleGainRate) : "moderate";
    }
    updateCalorieStrategyPreference.mutate({ mode: strategyMode, goal, targetRate });
  };

  const handleRateChange = (rate: FatLossRate | MuscleGainRate) => {
    updateCalorieStrategyPreference.mutate({ mode: strategyMode, targetRate: rate });
  };

  const handleModeSelect = (mode: "manual" | "automatic") => {
    if (mode === "automatic" && strategyMode !== "automatic") {
      setShowAutoModeConfirm(true);
      return;
    }
    updateCalorieStrategyPreference.mutate({ mode });
  };

  const confirmAutomaticMode = () => {
    updateCalorieStrategyPreference.mutate({ mode: "automatic" });
    setShowAutoModeConfirm(false);
  };

  const handleManualApply = () => {
    if (calorieStrategy.recommendedCalories == null) return;
    applyCalorieGoal.mutate({
      mode: "manual_apply",
      appliedCalories: calorieStrategy.recommendedCalories,
      recommendedCalories: calorieStrategy.recommendedCalories,
      goal: strategyGoal,
      targetRate: strategyGoal === "maintenance" ? null : strategyRate,
      referenceTdeeKcal: calorieStrategy.referenceTdeeKcal,
      referenceSource: calorieStrategy.referenceSource,
      reason: "Application manuelle de la recommandation Cortex.",
    });
  };

  const handleMacroModeSelect = (mode: "manual" | "automatic") => {
    if (mode === "automatic" && macroStrategyMode !== "automatic") {
      setShowMacroAutoModeConfirm(true);
      return;
    }
    updateMacroStrategyPreference.mutate({ mode });
  };

  const confirmMacroAutomaticMode = () => {
    updateMacroStrategyPreference.mutate({ mode: "automatic" });
    setShowMacroAutoModeConfirm(false);
  };

  const handleMacroManualApply = () => {
    if (
      macroStrategy.proteinsG == null ||
      macroStrategy.carbsG == null ||
      macroStrategy.fatsG == null
    ) {
      return;
    }
    applyMacroGoal.mutate({
      mode: "manual_apply",
      appliedProteins: macroStrategy.proteinsG,
      appliedCarbs: macroStrategy.carbsG,
      appliedFats: macroStrategy.fatsG,
      recommendedProteins: macroStrategy.proteinsG,
      recommendedCarbs: macroStrategy.carbsG,
      recommendedFats: macroStrategy.fatsG,
      calorieTarget: calorieGoal,
      goal: strategyGoal,
      proteinLocked,
      carbsLocked,
      fatLocked,
      reason: macroStrategy.proteinBasis === "lean_mass" ? "lean_mass" : undefined,
    });
  };

  const handleToggleLock = (which: "protein" | "carbs" | "fat") => {
    updateMacroStrategyPreference.mutate({
      proteinLocked: which === "protein" ? !proteinLocked : undefined,
      carbsLocked: which === "carbs" ? !carbsLocked : undefined,
      fatLocked: which === "fat" ? !fatLocked : undefined,
    });
  };

  const macrosAligned =
    macroComparison.proteins.differenceG === 0 &&
    macroComparison.carbs.differenceG === 0 &&
    macroComparison.fats.differenceG === 0;

  const caloriesPct = pct(totals.calories, nutritionGoals?.calories);
  const proteinsPct = pct(totals.proteins, nutritionGoals?.proteins);
  const carbsPct = pct(totals.carbs, nutritionGoals?.carbs);
  const fatsPct = pct(totals.fats, nutritionGoals?.fats);

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/profil"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Retour au profil"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">Santé nutritionnelle</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Le tableau de bord central de ta santé
          </p>
        </div>
      </div>

      {/* Métabolisme */}
      <Section title="Métabolisme">
        <div className="grid grid-cols-3 gap-2">
          {bmr != null ? (
            <StatTile
              icon={<Flame className="h-4 w-4" />}
              label="Métabolisme de base"
              value={String(bmr)}
              unit="kcal/j"
            />
          ) : (
            <ComingSoonTile icon={<Flame className="h-4 w-4" />} label="Métabolisme de base" />
          )}
          {todayActivityLoading || metabolicProfileLoading || nutritionLoading ? (
            <Skeleton className="h-[84px] rounded-2xl" />
          ) : dailyTDEE.status === "complete" ? (
            <StatTile
              icon={<Zap className="h-4 w-4" />}
              label="TDEE"
              value={String(dailyTDEE.totalKcal)}
              unit="kcal/j"
              caption="Estimation"
              title="Dépense quotidienne totale = BMR + NEAT + EAT + TEF"
            />
          ) : (
            <InsufficientDataTile icon={<Zap className="h-4 w-4" />} label="TDEE" />
          )}
          {calorieGoal != null ? (
            <StatTile
              icon={<TrendingUp className="h-4 w-4" />}
              label="Objectif calorique"
              value={String(calorieGoal)}
              unit="kcal/j"
            />
          ) : (
            <ComingSoonTile icon={<TrendingUp className="h-4 w-4" />} label="Objectif calorique" />
          )}
          {bodyLoading || nutritionRangeLoading ? (
            <Skeleton className="h-[84px] rounded-2xl" />
          ) : adaptiveTdee.status === "insufficient_data" ? (
            <InsufficientDataTile icon={<Gauge className="h-4 w-4" />} label="TDEE observé" />
          ) : (
            <StatTile
              icon={<Gauge className="h-4 w-4" />}
              label="TDEE observé"
              value={`${adaptiveTdee.status === "early_estimate" ? "~" : ""}${adaptiveTdee.observedTdeeKcal}`}
              unit="kcal/j"
              caption={
                adaptiveTdee.status === "early_estimate"
                  ? "Estimation précoce"
                  : "Basé sur tes données"
              }
              title={`Dépense estimée à partir de tes calories réellement consommées et de l'évolution de ton poids — ${adaptiveTdee.reason}`}
            />
          )}
          {bodyLoading || nutritionRangeLoading ? (
            <Skeleton className="h-[84px] rounded-2xl" />
          ) : adaptiveTdeeCalibration.adaptiveTdeeKcal != null ? (
            <StatTile
              icon={<Gauge className="h-4 w-4" />}
              label="TDEE adaptatif"
              value={String(adaptiveTdeeCalibration.adaptiveTdeeKcal)}
              unit="kcal/j"
              caption={
                adaptiveTdeeCalibration.state === "adapted"
                  ? "Basé sur ton historique"
                  : adaptiveTdeeCalibration.state === "calibrating"
                    ? "Calibration en cours"
                    : "Modèle initial"
              }
              title={`Meilleure estimation personnalisée de Cortex (modèle + observation, sans jamais remplacer l'un par l'autre) — ${adaptiveTdeeCalibration.reason}`}
            />
          ) : (
            <ComingSoonTile icon={<Gauge className="h-4 w-4" />} label="TDEE adaptatif" />
          )}
          {todayActivityLoading || metabolicProfileLoading ? (
            <Skeleton className="h-[84px] rounded-2xl" />
          ) : dailyNEAT.kcal != null ? (
            <StatTile
              icon={<Footprints className="h-4 w-4" />}
              label="NEAT"
              value={String(dailyNEAT.kcal)}
              unit="kcal/j"
              caption="Estimation"
              title="Non-Exercise Activity Thermogenesis — activité quotidienne non sportive (marche, déplacements, tâches)"
            />
          ) : (
            <InsufficientDataTile icon={<Footprints className="h-4 w-4" />} label="NEAT" />
          )}
          <StatTile
            icon={<Timer className="h-4 w-4" />}
            label="EAT"
            value={String(dailyEAT.kcal)}
            unit="kcal/j"
            caption="Estimation"
            title="Exercise Activity Thermogenesis — énergie dépensée pendant tes séances enregistrées aujourd'hui"
          />
          {nutritionLoading ? (
            <Skeleton className="h-[84px] rounded-2xl" />
          ) : (
            <StatTile
              icon={<Flame className="h-4 w-4" />}
              label="TEF"
              value={String(dailyTEF.totalKcal)}
              unit="kcal/j"
              caption="Estimation"
              title="Thermic Effect of Food — énergie dépensée pour digérer les aliments réellement consommés aujourd'hui"
            />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
          <div className="min-w-0">
            <p className="text-xs font-medium">Comprendre ton TDEE adaptatif</p>
            <p className="text-[11px] text-muted-foreground">
              Modélisé, observé, adaptatif — le détail du calcul.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAnalysisSheet(true)}
            className="shrink-0 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/30"
          >
            Voir l'analyse
          </button>
        </div>
        <div className="mt-2 grid grid-cols-1">
          <ComingSoonTile
            icon={<TrendingDown className="h-4 w-4" />}
            label="Adaptation métabolique"
          />
        </div>
        {calorieGoal == null && (
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
            Définis tes objectifs caloriques dans{" "}
            <Link
              to="/nutrition"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Nutrition
            </Link>{" "}
            pour voir ton objectif calorique quotidien.
          </p>
        )}
        {metabolicProfileIncomplete && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
            <div className="min-w-0">
              <p className="text-xs font-medium">Profil métabolique incomplet</p>
              <p className="text-[11px] text-muted-foreground">
                Âge et sexe biologique manquants pour calculer ton BMR.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMetabolicSheet(true)}
              className="shrink-0 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/30"
            >
              Compléter mon profil métabolique
            </button>
          </div>
        )}
        {activityLevelMissing && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
            <div className="min-w-0">
              <p className="text-xs font-medium">Niveau d'activité non renseigné</p>
              <p className="text-[11px] text-muted-foreground">
                Nécessaire pour estimer ton NEAT sans appareil connecté.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMetabolicSheet(true)}
              className="shrink-0 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/30"
            >
              Compléter mon profil métabolique
            </button>
          </div>
        )}
      </Section>

      {/* Stratégie calorique */}
      <Section title="Stratégie calorique">
        <div className="flex rounded-xl border border-border bg-card/50 p-0.5">
          {(
            [
              { value: "fat_loss", label: "Perte de graisse" },
              { value: "maintenance", label: "Maintien" },
              { value: "muscle_gain", label: "Prise de masse" },
            ] as const
          ).map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => handleGoalChange(g.value)}
              className={
                "flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors " +
                (strategyGoal === g.value
                  ? "bg-gradient-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {g.label}
            </button>
          ))}
        </div>

        {strategyGoal !== "maintenance" && (
          <div className="mt-2 flex gap-1.5">
            {Object.entries(CALORIE_STRATEGY_RATES[strategyGoal]).map(([key, rate]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleRateChange(key as FatLossRate | MuscleGainRate)}
                className={
                  "flex-1 rounded-full border px-2 py-1.5 text-[11px] font-medium transition-colors " +
                  (strategyRate === key
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-surface text-muted-foreground")
                }
              >
                {rate.label}
              </button>
            ))}
          </div>
        )}

        {/* Mode de gestion */}
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mode de gestion
          </p>
          <div className="flex rounded-xl border border-border bg-card/50 p-0.5">
            {(
              [
                { value: "manual", label: "Manuel" },
                { value: "automatic", label: "Automatique" },
              ] as const
            ).map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => handleModeSelect(m.value)}
                className={
                  "flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors " +
                  (strategyMode === m.value
                    ? "bg-gradient-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {showAutoModeConfirm && (
          <div className="mt-2 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold text-foreground">Activer le mode automatique ?</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
              <li>• Cortex pourra modifier ton objectif calorique.</li>
              <li>• Les ajustements sont plafonnés (jamais un grand saut d'un coup).</li>
              <li>• Ils sont espacés dans le temps, jamais quotidiens.</li>
              <li>• Tu peux revenir en manuel à tout moment.</li>
              <li>• Les macros ne sont jamais modifiées automatiquement.</li>
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={confirmAutomaticMode}
                className="flex-1 rounded-lg bg-gradient-primary py-1.5 text-[11px] font-semibold text-primary-foreground shadow-glow"
              >
                Activer
              </button>
              <button
                type="button"
                onClick={() => setShowAutoModeConfirm(false)}
                className="flex-1 rounded-lg border border-border bg-card py-1.5 text-[11px] font-semibold text-foreground"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {calorieStrategy.recommendedCalories == null ? (
          <div className="mt-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
            <p className="text-xs font-medium text-muted-foreground/70">
              Recommandation indisponible
            </p>
            {calorieStrategy.limitReasons[0] && (
              <p className="mt-1 text-[11px] text-muted-foreground/50">
                {calorieStrategy.limitReasons[0]}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2 rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  TDEE de référence
                </p>
                <p className="text-sm font-bold">{calorieStrategy.referenceTdeeKcal} kcal</p>
                <p className="text-[10px] text-muted-foreground/60">
                  {calorieStrategy.referenceSource === "adaptive" ? "Adaptatif" : "Modélisé"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Apport recommandé
                </p>
                <p className="text-sm font-bold text-primary">
                  {calorieStrategy.recommendedCalories} kcal
                </p>
                {calorieStrategy.dailyDeltaKcal !== 0 && (
                  <p className="text-[10px] text-muted-foreground/60">
                    {calorieStrategy.dailyDeltaKcal! > 0 ? "+" : ""}
                    {calorieStrategy.dailyDeltaKcal} kcal/j
                  </p>
                )}
              </div>
            </div>
            {calorieStrategy.estimatedWeeklyWeightChangeKg != null &&
              calorieStrategy.estimatedWeeklyWeightChangeKg !== 0 && (
                <p className="mt-2.5 text-[11px] text-muted-foreground">
                  Rythme estimé : {calorieStrategy.estimatedWeeklyWeightChangeKg > 0 ? "+" : ""}
                  {calorieStrategy.estimatedWeeklyWeightChangeKg} kg/semaine
                </p>
              )}

            <div className="my-3 border-t border-border" />

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Objectif actuel</span>
              <span className="font-semibold">
                {calorieGoalComparison.currentCalories != null
                  ? `${calorieGoalComparison.currentCalories} kcal`
                  : "Non défini"}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Recommandation Cortex</span>
              <span className="font-semibold">
                {calorieGoalComparison.recommendedCalories} kcal
              </span>
            </div>
            {calorieGoalComparison.differenceKcal != null &&
              calorieGoalComparison.differenceKcal !== 0 && (
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Écart</span>
                  <span className="font-semibold">
                    {calorieGoalComparison.differenceKcal > 0 ? "+" : ""}
                    {calorieGoalComparison.differenceKcal} kcal
                  </span>
                </div>
              )}

            {strategyMode === "manual" ? (
              calorieGoalComparison.differenceKcal === 0 ? (
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Ton objectif est déjà aligné avec la recommandation.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleManualApply}
                  disabled={applyCalorieGoal.isPending}
                  className="mt-3 w-full rounded-xl bg-gradient-primary py-2 text-[11px] font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
                >
                  {applyCalorieGoal.isPending ? "Application…" : "Appliquer"}
                </button>
              )
            ) : (
              <div className="mt-3 rounded-xl bg-white/[0.03] p-3">
                <p className="text-[11px] font-semibold text-foreground">Mode automatique actif</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Cortex ajuste progressivement ton objectif calorique lorsque tes données
                  justifient un changement.
                </p>
                {autoAdjustment.reasons.includes("cooldown_active") && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                    Prochain ajustement possible après la période de stabilisation.
                  </p>
                )}
              </div>
            )}

            {calorieStrategy.limited && calorieStrategy.limitReasons.length > 0 && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                {calorieStrategy.limitReasons.join(" ")}
              </p>
            )}
          </div>
        )}

        {lastCalorieAdjustment && (
          <div className="mt-2 rounded-2xl border border-border bg-card/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Dernier ajustement
            </p>
            <p className="mt-1 text-xs font-semibold">
              {lastCalorieAdjustment.previousCalories != null
                ? `${lastCalorieAdjustment.previousCalories} → ${lastCalorieAdjustment.appliedCalories} kcal`
                : `${lastCalorieAdjustment.appliedCalories} kcal`}
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              {lastCalorieAdjustment.mode === "automatic" ? "Automatique" : "Manuel"} ·{" "}
              {new Date(lastCalorieAdjustment.createdAt).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
        )}
      </Section>

      {/* Répartition recommandée (macros) */}
      <Section title="Répartition recommandée">
        {/* Mode de gestion des macros — préférence INDÉPENDANTE du mode calorique (§2 du brief Phase 5B) */}
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Gestion des macros
          </p>
          <div className="flex rounded-xl border border-border bg-card/50 p-0.5">
            {(
              [
                { value: "manual", label: "Manuel" },
                { value: "automatic", label: "Automatique" },
              ] as const
            ).map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => handleMacroModeSelect(m.value)}
                className={
                  "flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors " +
                  (macroStrategyMode === m.value
                    ? "bg-gradient-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {showMacroAutoModeConfirm && (
          <div className="mb-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold text-foreground">
              Activer les macros automatiques ?
            </p>
            <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
              <li>
                • Cortex pourra ajuster tes macros pour rester cohérent avec ton objectif calorique.
              </li>
              <li>• Les macros verrouillées ne sont jamais modifiées.</li>
              <li>
                • Aucun délai artificiel : un changement de calories réaligne tes macros le jour
                même.
              </li>
              <li>• Tu peux revenir en manuel à tout moment.</li>
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={confirmMacroAutomaticMode}
                className="flex-1 rounded-lg bg-gradient-primary py-1.5 text-[11px] font-semibold text-primary-foreground shadow-glow"
              >
                Activer
              </button>
              <button
                type="button"
                onClick={() => setShowMacroAutoModeConfirm(false)}
                className="flex-1 rounded-lg border border-border bg-card py-1.5 text-[11px] font-semibold text-foreground"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {macroStrategy.proteinsG == null ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
            <p className="text-xs font-medium text-muted-foreground/70">
              Recommandation indisponible
            </p>
            {macroStrategy.limitReasons[0] && (
              <p className="mt-1 text-[11px] text-muted-foreground/50">
                {macroStrategy.limitReasons[0]}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Objectif actif
              </span>
              <span className="text-xs font-semibold">{macroStrategy.calorieTarget} kcal</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {(
                [
                  {
                    key: "protein" as const,
                    label: "Protéines",
                    value: macroStrategy.proteinsG,
                    locked: proteinLocked,
                  },
                  {
                    key: "carbs" as const,
                    label: "Glucides",
                    value: macroStrategy.carbsG,
                    locked: carbsLocked,
                  },
                  {
                    key: "fat" as const,
                    label: "Lipides",
                    value: macroStrategy.fatsG,
                    locked: fatLocked,
                  },
                ] as const
              ).map(({ key, label, value, locked }) => (
                <div key={key} className="relative">
                  <button
                    type="button"
                    onClick={() => handleToggleLock(key)}
                    aria-label={
                      locked
                        ? `Déverrouiller ${label.toLowerCase()}`
                        : `Verrouiller ${label.toLowerCase()}`
                    }
                    className={
                      "absolute -top-1 right-0 rounded-full p-1 transition-colors " +
                      (locked
                        ? "text-primary"
                        : "text-muted-foreground/40 hover:text-muted-foreground")
                    }
                  >
                    {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                  <p className={"text-lg font-bold " + (key === "protein" ? "text-primary" : "")}>
                    {value} g
                  </p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <div className="my-3 border-t border-border" />

            {(
              [
                { label: "Protéines", entry: macroComparison.proteins },
                { label: "Glucides", entry: macroComparison.carbs },
                { label: "Lipides", entry: macroComparison.fats },
              ] as const
            ).map(({ label, entry }) => (
              <div key={label} className="mt-1 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold">
                  {entry.current != null ? `${entry.current} g` : "Non défini"}
                  {" → "}
                  {entry.recommended != null ? `${entry.recommended} g` : "—"}
                </span>
              </div>
            ))}

            {macroStrategy.proteinBasis === "lean_mass" && selectedBodyComposition && (
              <div className="mt-3 rounded-xl bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Base de calcul des protéines
                </p>
                <p className="mt-0.5 text-xs font-semibold text-foreground">Masse maigre</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Masse maigre utilisée : {selectedBodyComposition.leanMassKg.toFixed(1)} kg
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Composition corporelle : {BODY_FAT_METHOD_LABELS[selectedBodyComposition.method]}{" "}
                  · {CONFIDENCE_LABELS[selectedBodyComposition.confidence]}
                  {selectedBodyComposition.isRange ? " · estimation indicative" : ""}
                </p>
              </div>
            )}

            {macroStrategyMode === "automatic" &&
              selectedBodyComposition &&
              !selectedBodyComposition.usableForAutomaticAdjustment && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {selectedBodyComposition.method === "photo_estimate"
                    ? "Estimation photo disponible — utilisée à titre indicatif, pas encore assez fiable pour ajuster tes protéines automatiquement."
                    : "Composition corporelle disponible mais pas assez fiable pour ajuster tes protéines automatiquement — reste utilisée à titre indicatif."}
                </p>
              )}

            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              {macroStrategy.proteinBasis === "lean_mass"
                ? "Cortex peut utiliser ta composition corporelle lorsqu'elle est suffisamment récente et fiable. Sinon, la recommandation reste basée sur ton poids."
                : "Protéines basées sur ton poids et ton objectif · Lipides = minimum nutritionnel prévu par la stratégie · Glucides = calories restantes."}
            </p>

            {macroStrategyMode === "manual" ? (
              macroStrategy.allMacrosLocked ? (
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Toutes les macros sont verrouillées — Cortex ne peut rien recalculer.
                </p>
              ) : macrosAligned ? (
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Tes macros sont déjà alignées.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleMacroManualApply}
                  disabled={applyMacroGoal.isPending}
                  className="mt-3 w-full rounded-xl bg-gradient-primary py-2 text-[11px] font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
                >
                  {applyMacroGoal.isPending ? "Application…" : "Appliquer"}
                </button>
              )
            ) : (
              <div className="mt-3 rounded-xl bg-white/[0.03] p-3">
                <p className="text-[11px] font-semibold text-foreground">
                  Macros automatiques actives
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Cortex maintient tes macros cohérentes avec ton objectif calorique. Les macros
                  verrouillées ne sont jamais modifiées.
                </p>
              </div>
            )}

            {macroStrategy.locksIncompatible ? (
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Impossible d'aligner complètement les macros. Les valeurs verrouillées représentent
                déjà plus de calories que ton objectif actuel.
              </p>
            ) : (
              macroStrategy.limited &&
              macroStrategy.limitReasons.length > 0 && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {macroStrategy.limitReasons.join(" ")}
                </p>
              )
            )}
          </div>
        )}

        {lastMacroAdjustment && (
          <div className="mt-2 rounded-2xl border border-border bg-card/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Dernier ajustement macros
            </p>
            <div className="mt-1 space-y-0.5 text-xs font-semibold">
              <p>
                P{" "}
                {lastMacroAdjustment.previousProteins != null
                  ? `${lastMacroAdjustment.previousProteins} → `
                  : ""}
                {lastMacroAdjustment.appliedProteins} g
              </p>
              <p>
                G{" "}
                {lastMacroAdjustment.previousCarbs != null
                  ? `${lastMacroAdjustment.previousCarbs} → `
                  : ""}
                {lastMacroAdjustment.appliedCarbs} g
              </p>
              <p>
                L{" "}
                {lastMacroAdjustment.previousFats != null
                  ? `${lastMacroAdjustment.previousFats} → `
                  : ""}
                {lastMacroAdjustment.appliedFats} g
              </p>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/60">
              {lastMacroAdjustment.mode === "automatic" ? "Automatique" : "Manuel"} ·{" "}
              {new Date(lastMacroAdjustment.createdAt).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
        )}
      </Section>

      {showMetabolicSheet && (
        <MetabolicProfileSheet
          current={{
            sex: metabolicSex,
            age: metabolicAge,
            activityLevel: metabolicProfile?.activity_level ?? null,
          }}
          onClose={() => setShowMetabolicSheet(false)}
        />
      )}

      {showAnalysisSheet && (
        <MetabolicAnalysisSheet
          analysis={metabolicAnalysis}
          onClose={() => setShowAnalysisSheet(false)}
        />
      )}

      {/* Corps */}
      <Section title="Corps">
        <div className="grid grid-cols-3 gap-2">
          {bodyLoading ? (
            <>
              <Skeleton className="h-[84px] rounded-2xl" />
              <Skeleton className="h-[84px] rounded-2xl" />
              <Skeleton className="h-[84px] rounded-2xl" />
            </>
          ) : (
            <>
              {weight != null ? (
                <StatTile
                  icon={<Scale className="h-4 w-4" />}
                  label="Poids actuel"
                  value={String(weight)}
                  unit="kg"
                  title={
                    weightDelta != null
                      ? `${weightDelta > 0 ? "+" : ""}${weightDelta} kg vs mesure précédente`
                      : undefined
                  }
                />
              ) : (
                <ComingSoonTile icon={<Scale className="h-4 w-4" />} label="Poids actuel" />
              )}
              {bmi != null ? (
                <StatTile
                  icon={<Ruler className="h-4 w-4" />}
                  label="IMC"
                  value={String(bmi)}
                  title={BMI_LABELS[bmiCategory(bmi)]}
                />
              ) : (
                <ComingSoonTile icon={<Ruler className="h-4 w-4" />} label="IMC" />
              )}
              <ComingSoonTile icon={<TrendingUp className="h-4 w-4" />} label="Objectif de poids" />
            </>
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <ComingSoonTile icon={<Gauge className="h-4 w-4" />} label="Masse grasse" />
          <ComingSoonTile icon={<Gauge className="h-4 w-4" />} label="Masse musculaire" />
          <ComingSoonTile icon={<Ruler className="h-4 w-4" />} label="Tour de taille" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
          <div className="min-w-0">
            <p className="text-xs font-medium">Historique du poids</p>
            <p className="text-[11px] text-muted-foreground">
              {bodyRows && bodyRows.length > 0
                ? `${bodyRows.length} mesure${bodyRows.length > 1 ? "s" : ""} enregistrée${bodyRows.length > 1 ? "s" : ""}`
                : "Aucune mesure enregistrée"}
            </p>
          </div>
          <Link
            to="/corps"
            className="shrink-0 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/30"
          >
            Voir tout
          </Link>
        </div>
        <div className="mt-2">
          <ComingSoonRow icon={<Scan className="h-4 w-4" />} label="Analyse corporelle IA" />
        </div>
      </Section>

      {/* Objectif physique — Phase 8 */}
      <Section title="Objectif physique">
        {!physicalGoal ? (
          <button
            type="button"
            onClick={() => setShowPhysicalGoalSheet(true)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3.5 text-left"
          >
            <div>
              <p className="text-xs font-medium">Aucun objectif physique actif</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Définis un objectif de poids/composition corporelle et suis ta progression.
              </p>
            </div>
            <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">
                {physicalGoal.goal === "fat_loss"
                  ? "Perte de gras"
                  : physicalGoal.goal === "muscle_gain"
                    ? "Prise de masse"
                    : "Maintien"}
              </span>
              {physicalGoal.targetRate && (
                <span className="text-[11px] text-muted-foreground">
                  {rateLabelFor(physicalGoal.goal, physicalGoal.targetRate)}
                </span>
              )}
            </div>

            <p className="mt-1 text-sm font-semibold">
              {physicalGoal.startingWeightKg != null ? `${physicalGoal.startingWeightKg} kg` : "—"}
              {physicalGoal.targetWeightKg != null && ` → ${physicalGoal.targetWeightKg} kg`}
            </p>

            {physicalGoalProgress && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground">Progression</span>
                <span className="font-semibold text-foreground">
                  {
                    {
                      insufficient_data: "Pas encore assez de données",
                      on_track: "Conforme",
                      ahead: "En avance",
                      behind: "À ajuster",
                      maintaining: "Stable",
                    }[physicalGoalProgress.state]
                  }
                </span>
              </div>
            )}

            {physicalGoalTrajectory?.status === "ok" &&
              physicalGoalTrajectory.estimatedDurationWeeks != null && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  ≈ {physicalGoalTrajectory.estimatedDurationWeeks} semaine
                  {physicalGoalTrajectory.estimatedDurationWeeks > 1 ? "s" : ""} restantes
                  (estimation)
                </p>
              )}
            {physicalGoalTrajectory?.maintenanceZoneKg && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Zone de maintien ≈ {physicalGoalTrajectory.maintenanceZoneKg.minKg}–
                {physicalGoalTrajectory.maintenanceZoneKg.maxKg} kg
              </p>
            )}
            {physicalGoalBodyFatProjection?.status === "ok" && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Poids théorique à {physicalGoal.targetBodyFatPercent} % BF ≈{" "}
                {physicalGoalBodyFatProjection.projectedWeightAtTargetBFKg} kg (projection
                théorique, masse maigre supposée constante)
              </p>
            )}

            {physicalGoal.goal !== "maintenance" && (
              <div className="mt-3 flex gap-1.5">
                {Object.entries(CALORIE_STRATEGY_RATES[physicalGoal.goal]).map(([key, rate]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      updatePhysicalGoalRate.mutate({
                        id: physicalGoal.id,
                        targetRate: key as FatLossRate | MuscleGainRate,
                      })
                    }
                    disabled={updatePhysicalGoalRate.isPending}
                    className={
                      "flex-1 rounded-full border px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-60 " +
                      (physicalGoal.targetRate === key
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-surface text-muted-foreground")
                    }
                  >
                    {rate.label}
                  </button>
                ))}
              </div>
            )}

            {physicalGoalLikelyReached && (
              <button
                type="button"
                onClick={() => completePhysicalGoal.mutate(physicalGoal.id)}
                disabled={completePhysicalGoal.isPending}
                className="mt-3 w-full rounded-xl bg-gradient-primary py-2 text-[11px] font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
              >
                Marquer comme atteint
              </button>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowPhysicalGoalSheet(true)}
                className="flex-1 rounded-xl border border-border bg-card py-2 text-[11px] font-semibold text-foreground"
              >
                Nouvel objectif
              </button>
              <button
                type="button"
                onClick={() => cancelPhysicalGoal.mutate(physicalGoal.id)}
                disabled={cancelPhysicalGoal.isPending}
                className="flex-1 rounded-xl border border-border bg-card py-2 text-[11px] font-semibold text-muted-foreground disabled:opacity-60"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </Section>

      {showPhysicalGoalSheet && (
        <PhysicalGoalSheet
          onClose={() => setShowPhysicalGoalSheet(false)}
          currentWeightKg={goalCurrentWeightKg}
          selectedBodyComposition={selectedBodyComposition}
          defaultGoal={strategyGoal}
        />
      )}

      {/* Nutrition */}
      <Section title="Nutrition">
        <div className="space-y-3 rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
          {nutritionLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <MacroBar
                icon={<Flame className="h-3.5 w-3.5 text-primary" />}
                label="Calories"
                value={Math.round(totals.calories)}
                goal={nutritionGoals?.calories ?? null}
                unit="kcal"
                pctValue={caloriesPct}
                barClass="from-primary to-primary-glow"
              />
              <MacroBar
                icon={<Beef className="h-3.5 w-3.5 text-red-400" />}
                label="Protéines"
                value={Math.round(totals.proteins)}
                goal={nutritionGoals?.proteins ?? null}
                unit="g"
                pctValue={proteinsPct}
                barClass="from-red-500 to-orange-400"
              />
              <MacroBar
                icon={<Wheat className="h-3.5 w-3.5 text-amber-400" />}
                label="Glucides"
                value={Math.round(totals.carbs)}
                goal={nutritionGoals?.carbs ?? null}
                unit="g"
                pctValue={carbsPct}
                barClass="from-amber-500 to-yellow-400"
              />
              <MacroBar
                icon={<Flame className="h-3.5 w-3.5 text-fuchsia-400" />}
                label="Lipides"
                value={Math.round(totals.fats)}
                goal={nutritionGoals?.fats ?? null}
                unit="g"
                pctValue={fatsPct}
                barClass="from-fuchsia-500 to-pink-400"
              />
              {remaining && (
                <p className="pt-1 text-[11px] text-muted-foreground">
                  {remaining.calories != null
                    ? remaining.calories >= 0
                      ? `${remaining.calories} kcal restantes aujourd'hui`
                      : `${Math.abs(remaining.calories)} kcal au-delà de l'objectif`
                    : "Définis un objectif calorique pour suivre ta progression"}
                </p>
              )}
            </>
          )}
        </div>
        <div className="mt-2 grid grid-cols-1">
          <ComingSoonRow icon={<Droplet className="h-4 w-4" />} label="Hydratation" />
        </div>
      </Section>

      {/* Activité */}
      <Section title="Activité">
        <div className="grid grid-cols-2 gap-2">
          {workoutsLoading ? (
            <>
              <Skeleton className="h-[84px] rounded-2xl" />
              <Skeleton className="h-[84px] rounded-2xl" />
            </>
          ) : (
            <>
              <StatTile
                icon={<HeartPulse className="h-4 w-4" />}
                label="Séances (7j)"
                value={String(weeklyActivity.sessionCount)}
              />
              <StatTile
                icon={<Flame className="h-4 w-4" />}
                label="Calories brûlées (7j)"
                value={String(weeklyActivity.caloriesBurned)}
                unit="kcal"
              />
            </>
          )}
          {activity?.steps != null ? (
            <StatTile
              icon={<Footprints className="h-4 w-4" />}
              label="Pas (dernier relevé)"
              value={String(activity.steps)}
            />
          ) : (
            <ComingSoonTile icon={<Footprints className="h-4 w-4" />} label="Pas quotidiens" />
          )}
          <ComingSoonTile icon={<Timer className="h-4 w-4" />} label="Temps actif" />
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
          Les données de montres connectées (pas, fréquence cardiaque en continu, temps actif)
          arriveront progressivement via l'import santé.
        </p>
      </Section>

      {/* Santé */}
      <Section title="Santé">
        <div className="grid grid-cols-2 gap-2">
          <ComingSoonTile icon={<Moon className="h-4 w-4" />} label="Sommeil" />
          {activity?.avg_hr != null ? (
            <StatTile
              icon={<HeartPulse className="h-4 w-4" />}
              label="Fréquence cardiaque"
              value={String(activity.avg_hr)}
              unit="bpm"
            />
          ) : (
            <ComingSoonTile icon={<HeartPulse className="h-4 w-4" />} label="Fréquence cardiaque" />
          )}
          <ComingSoonTile icon={<Sparkles className="h-4 w-4" />} label="Variabilité (HRV)" />
          <ComingSoonTile icon={<Battery className="h-4 w-4" />} label="Récupération" />
        </div>
        <div className="mt-2 grid grid-cols-1">
          <ComingSoonRow icon={<Brain className="h-4 w-4" />} label="Niveau de stress" />
        </div>
      </Section>

      {/* Analyse IA */}
      <Section title="Analyse IA">
        <ComingSoonCard
          icon={<Sparkles className="h-5 w-5" />}
          title="Analyse IA"
          description="Les analyses intelligentes arriveront prochainement."
        />
      </Section>

      {/* Disclaimer */}
      <p className="mt-2 rounded-2xl border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted-foreground">
        ⚠️ Ces indicateurs sont fournis à titre informatif et ne remplacent pas l'avis d'un
        professionnel de santé.
      </p>
    </main>
  );
}

function pct(value: number, goal: number | null | undefined): number | null {
  if (goal == null || goal <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((value / goal) * 100)));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function MacroBar({
  icon,
  label,
  value,
  goal,
  unit,
  pctValue,
  barClass,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  goal: number | null;
  unit: string;
  pctValue: number | null;
  barClass: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {icon}
          {label}
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
          {value}
          {goal != null ? ` / ${goal}` : ""} {unit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${barClass}`}
          initial={{ width: 0 }}
          animate={{ width: `${pctValue ?? 0}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function ComingSoonRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-muted-foreground/50">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground/60">Bientôt disponible</p>
      </div>
    </div>
  );
}
