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
  Moon,
  Ruler,
  Scale,
  Scan,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Wheat,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useBodyMeasurements, useWorkouts } from "@/hooks/use-fitness";
import { useLatestBodyWeight } from "@/hooks/useLatestBodyWeight";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useLatestActivity } from "@/hooks/useDailyActivity";
import { useNutrition } from "@/hooks/useNutritionData";
import { useNutritionGoals } from "@/hooks/useNutritionGoals";
import { useNutritionTotals } from "@/hooks/useNutritionTotals";
import { findLatestValue, findPreviousValue } from "@/lib/fitness/body";
import { bmiCategory, computeBMI } from "@/lib/fitness/metabolism";
import { computeWeeklyActivitySummary } from "@/lib/fitness/activitySummary";
import { localDateYMD } from "@/lib/dates";
import { StatTile } from "@/components/fitness/StatTile";
import { ComingSoonTile } from "@/components/fitness/ComingSoonTile";
import { ComingSoonCard } from "@/components/fitness/ComingSoonCard";
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

function SanteNutritionnellePage() {
  const today = localDateYMD();

  const { data: bodyRows, isLoading: bodyLoading } = useBodyMeasurements();
  const { data: latestWeight } = useLatestBodyWeight();
  const { prefs } = useUserPreferences();

  const { data: nutritionRows, isLoading: nutritionLoading } = useNutrition(today);
  const { data: nutritionGoals } = useNutritionGoals();
  const { totals, remaining } = useNutritionTotals(nutritionRows, nutritionGoals ?? null);

  const { data: workouts, isLoading: workoutsLoading } = useWorkouts();
  const { data: activity } = useLatestActivity();

  const weight = findLatestValue(bodyRows, "weight") ?? latestWeight ?? null;
  const previousWeight = findPreviousValue(bodyRows, "weight");
  const weightDelta =
    weight != null && previousWeight != null
      ? Math.round((weight - previousWeight) * 10) / 10
      : null;
  const bmi =
    weight != null && prefs.height_cm != null ? computeBMI(weight, prefs.height_cm) : null;

  const weeklyActivity = computeWeeklyActivitySummary(workouts ?? undefined, weight, 7);

  const calorieGoal = nutritionGoals?.calories ?? null;

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
          <ComingSoonTile icon={<Flame className="h-4 w-4" />} label="Métabolisme de base" />
          <ComingSoonTile icon={<Zap className="h-4 w-4" />} label="TDEE" />
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
          <ComingSoonTile icon={<Gauge className="h-4 w-4" />} label="Dépense adaptative" />
          <ComingSoonTile icon={<Footprints className="h-4 w-4" />} label="NEAT" />
          <ComingSoonTile icon={<Timer className="h-4 w-4" />} label="EAT" />
          <ComingSoonTile icon={<Flame className="h-4 w-4" />} label="TEF" />
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
      </Section>

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
