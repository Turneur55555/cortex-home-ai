import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Dumbbell,
  Flame,
  Apple,
  Target,
  Trophy,
  TrendingDown,
  TrendingUp,
  Minus,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { ChatBot } from "@/components/ChatBot";
import { ReportSummaryWidget } from "@/components/reports/ReportSummaryWidget";
import { getContextualQuote } from "@/lib/quotes";
import { useWorkouts, useNutrition, useNutritionGoals } from "@/hooks/use-fitness";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { useStreak } from "@/hooks/useStreak";
import { useGoalsWithProgress } from "@/hooks/useGoalsWithProgress";
import { useUserBadges } from "@/hooks/useUserBadges";
import { RECOVERY_COLORS } from "@/lib/fitness/recovery";
import { workoutTonnage } from "@/lib/fitness/strength";
import { supabase } from "@/integrations/supabase/client";
import { HomeDashboard } from "@/components/home/HomeDashboard";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ICORTEX — Accueil" },
      { name: "description", content: "Votre tableau de bord fitness." },
    ],
  }),
  component: HomePage,
});

// ─── Data ─────────────────────────────────────────────────────────────────────

function useLatestBody() {
  return useQuery({
    queryKey: ["body_tracking_latest"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("body_tracking")
        .select("date, weight, body_fat, muscle_mass")
        .or("weight.not.is.null,body_fat.not.is.null,muscle_mass.not.is.null")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useWeightHistory() {
  return useQuery({
    queryKey: ["home_weight_history"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("body_tracking")
        .select("weight, date")
        .not("weight", "is", null)
        .order("date", { ascending: true })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as { weight: number | null; date: string }[];
    },
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function HomePage() {
  const { user } = useAuth();
  const fallback = user?.email?.split("@")[0] ?? "vous";
  const { pseudo: name } = useProfile(fallback);
  const { data: workouts, isLoading: fitnessLoading } = useWorkouts();
  const recoveryMap = useRecoveryMap(workouts);
  const streak = useStreak();
  const { data: latestBody } = useLatestBody();
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const { data: meals } = useNutrition(today);
  const { data: nutritionGoal } = useNutritionGoals();
  const { goals } = useGoalsWithProgress();
  const { data: badges } = useUserBadges(6);
  const { data: weightHistory } = useWeightHistory();
  const quote = useMemo(() => getContextualQuote(), []);
  const greeting = getGreeting();

  const weeklyCount = useMemo(() => {
    if (!workouts) return 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    cutoff.setHours(0, 0, 0, 0);
    return workouts.filter((w) => new Date(w.date + "T00:00:00") >= cutoff).length;
  }, [workouts]);

  const recoveryScore = useMemo(() => {
    const trained = [...recoveryMap.values()].filter((m) => m.status !== "unknown");
    if (!trained.length) return null;
    const sum = trained.reduce((acc, m) => {
      if (m.status === "ready") return acc + 1;
      if (m.status === "recovering") return acc + 0.6;
      return acc + 0.1;
    }, 0);
    return Math.round((sum / trained.length) * 100);
  }, [recoveryMap]);

  const caloriesIn = useMemo(
    () => (meals ?? []).reduce((a, m) => a + (m.calories ?? 0), 0),
    [meals],
  );

  const caloriesOut = useMemo(() => {
    if (!workouts) return 0;
    return workouts
      .filter((w) => w.date === today)
      .reduce((a, w) => {
        const dur = w.duration_minutes ?? 0;
        const ton = workoutTonnage(w.exercises ?? []);
        return a + dur * 5 + Math.round(ton * 0.05);
      }, 0);
  }, [workouts, today]);

  const goalCalories = nutritionGoal?.calories ?? null;

  const activeGoals = useMemo(
    () => (goals ?? []).filter((g) => g.status !== "done").slice(0, 3),
    [goals],
  );

  const lastWorkouts = useMemo(() => (workouts ?? []).slice(0, 3), [workouts]);

  const weightTrend = useMemo(() => {
    const ws = (weightHistory ?? []).filter((d) => d.weight != null) as {
      weight: number;
      date: string;
    }[];
    if (!ws.length) return null;
    const latest = ws[ws.length - 1].weight;
    const prev = ws.length >= 2 ? ws[ws.length - 2].weight : null;
    return {
      latest,
      delta: prev != null ? Math.round((latest - prev) * 10) / 10 : null,
      points: ws.slice(-14).map((d) => d.weight),
    };
  }, [weightHistory]);

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      {/* ── Header ── */}
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Tableau de bord
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {greeting}, <span className="text-primary">{name}</span>
        </h1>
      </header>

      {/* ── Quote ── */}
      <blockquote className="mb-5 border-l-2 border-primary/40 pl-3">
        <p className="text-[12px] italic leading-relaxed text-muted-foreground">"{quote.text}"</p>
        <footer className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          — {quote.author}
        </footer>
      </blockquote>

      {/* ── Performance / récupération ── */}
      <FitnessHero
        loading={fitnessLoading}
        recoveryScore={recoveryScore}
        weeklyCount={weeklyCount}
        streak={streak.current}
      />

      {/* ── Calories du jour ── */}
      <CaloriesCard caloriesIn={caloriesIn} caloriesOut={caloriesOut} goal={goalCalories} />

      {/* ── Objectifs actifs ── */}
      {activeGoals.length > 0 && <GoalsCard goals={activeGoals} />}

      {/* ── Progression du poids ── */}
      {weightTrend && <WeightTrendCard trend={weightTrend} />}

      {/* ── Dernières séances ── */}
      <LastSessionsCard loading={fitnessLoading} workouts={lastWorkouts} />

      {/* ── Corps ── */}
      <BodySummaryCard loading={fitnessLoading} latestBody={latestBody} recoveryMap={recoveryMap} />

      {/* ── Badges & succès ── */}
      {badges && badges.length > 0 && <BadgesCard badges={badges} />}

      {/* ── Rapport hebdo IA ── */}
      <ReportSummaryWidget />

      {/* ── Cross-domaine (catégories) ── */}
      <div className="mt-6">
        <HomeDashboard />
      </div>

      <ChatBot />
    </main>
  );
}

// ─── Performance card ─────────────────────────────────────────────────────────

function FitnessHero({
  loading,
  recoveryScore,
  weeklyCount,
  streak,
}: {
  loading: boolean;
  recoveryScore: number | null;
  weeklyCount: number;
  streak: number;
}) {
  const scoreColor =
    recoveryScore == null
      ? "text-muted-foreground"
      : recoveryScore >= 70
        ? "text-emerald-400"
        : recoveryScore >= 40
          ? "text-amber-400"
          : "text-red-400";

  return (
    <section className="overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-5 shadow-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="text-sm font-semibold">Performance</span>
        </div>
        <Link
          to="/seances"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Voir tout →
        </Link>
      </div>

      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <KpiCard
              label="Récupération"
              value={recoveryScore != null ? `${recoveryScore}%` : "—"}
              valueClass={scoreColor}
            />
            <KpiCard label="Séances / sem." value={String(weeklyCount)} />
            <KpiCard
              label="Streak"
              value={`${streak}j`}
              icon={<Flame className="h-3 w-3 text-orange-400" />}
            />
          </div>

          {recoveryScore != null && (
            <div className="mb-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-700"
                  style={{ width: `${recoveryScore}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {recoveryScore >= 70
                  ? "Muscles prêts à l'entraînement"
                  : recoveryScore >= 40
                    ? "Récupération en cours"
                    : "Repos recommandé aujourd'hui"}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Link
              to="/seances"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-xs font-semibold transition-colors hover:border-primary/40"
            >
              <Dumbbell className="h-3.5 w-3.5" />
              Mes séances
            </Link>
            <Link
              to="/seances"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-glow"
            >
              + Nouvelle séance
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

// ─── Calories card ────────────────────────────────────────────────────────────

function CaloriesCard({
  caloriesIn,
  caloriesOut,
  goal,
}: {
  caloriesIn: number;
  caloriesOut: number;
  goal: number | null;
}) {
  const net = caloriesIn - caloriesOut;
  const goalPct = goal && goal > 0 ? Math.min(100, Math.round((caloriesIn / goal) * 100)) : null;
  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-5 shadow-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Apple className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold">Calories du jour</span>
        </div>
        <Link
          to="/nutrition"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Nutrition →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <KpiCard label="Consommées" value={`${Math.round(caloriesIn)}`} />
        <KpiCard label="Brûlées" value={`${Math.round(caloriesOut)}`} valueClass="text-orange-400" />
        <KpiCard
          label="Bilan"
          value={`${net >= 0 ? "+" : ""}${Math.round(net)}`}
          valueClass={net >= 0 ? "text-foreground" : "text-emerald-400"}
        />
      </div>

      {goalPct != null && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-700"
              style={{ width: `${goalPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {goalPct}% de ton objectif ({goal} kcal)
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Goals card ───────────────────────────────────────────────────────────────

function GoalsCard({
  goals,
}: {
  goals: {
    id: string;
    title: string;
    progress: number;
    current_value: number;
    target_value: number | null;
    status: string;
  }[];
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-5 shadow-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Objectifs actifs</span>
        </div>
        <Link
          to="/profil"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Gérer →
        </Link>
      </div>

      <ul className="space-y-3">
        {goals.map((g) => (
          <li key={g.id}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{g.title}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {g.current_value}
                {g.target_value != null ? ` / ${g.target_value}` : ""}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                className={
                  "h-full rounded-full transition-all duration-700 " +
                  (g.status === "late"
                    ? "bg-red-400/80"
                    : g.progress >= 75
                      ? "bg-gradient-to-r from-emerald-500 to-cyan-400"
                      : "bg-gradient-primary")
                }
                style={{ width: `${Math.max(4, g.progress)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Weight trend card ────────────────────────────────────────────────────────

function WeightTrendCard({
  trend,
}: {
  trend: { latest: number; delta: number | null; points: number[] };
}) {
  const TrendIcon =
    trend.delta == null ? Minus : trend.delta < 0 ? TrendingDown : trend.delta > 0 ? TrendingUp : Minus;
  const trendColor =
    trend.delta == null
      ? "text-muted-foreground"
      : trend.delta < 0
        ? "text-emerald-400"
        : trend.delta > 0
          ? "text-amber-400"
          : "text-muted-foreground";

  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-5 shadow-elevated backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Progression du poids</span>
        <Link
          to="/corps"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Corps →
        </Link>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-2xl font-bold leading-none">{trend.latest} kg</p>
          <p className={`mt-1.5 flex items-center gap-1 text-[11px] font-medium ${trendColor}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            {trend.delta == null
              ? "Première mesure"
              : `${trend.delta > 0 ? "+" : ""}${trend.delta} kg`}
          </p>
        </div>
        <Sparkline points={trend.points} />
      </div>
    </section>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - ((p - min) / span) * h]);
  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Last sessions card ───────────────────────────────────────────────────────

function LastSessionsCard({
  loading,
  workouts,
}: {
  loading: boolean;
  workouts: {
    id: string;
    name: string;
    date: string;
    duration_minutes: number | null;
    exercises: unknown[] | null;
  }[];
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-5 shadow-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Dernières séances</span>
        </div>
        <Link
          to="/seances"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Tout →
        </Link>
      </div>

      {loading ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : workouts.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Aucune séance. Lance-toi !</p>
      ) : (
        <ul className="space-y-2">
          {workouts.map((w) => (
            <li key={w.id}>
              <Link
                to="/seances"
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/50 px-3 py-2.5 transition-colors hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{w.name || "Séance"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(w.date)}
                    {w.duration_minutes ? ` · ${w.duration_minutes} min` : ""}
                    {w.exercises ? ` · ${w.exercises.length} exos` : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Body summary card ────────────────────────────────────────────────────────

function BodySummaryCard({
  loading,
  latestBody,
  recoveryMap,
}: {
  loading: boolean;
  latestBody:
    | { weight: number | null; body_fat: number | null; muscle_mass: number | null }
    | null
    | undefined;
  recoveryMap: ReturnType<typeof useRecoveryMap>;
}) {
  const leanMass = useMemo(() => {
    const { weight, body_fat } = latestBody ?? {};
    if (weight == null || body_fat == null) return null;
    return Math.round(weight * (1 - body_fat / 100) * 10) / 10;
  }, [latestBody]);

  const trainedMuscles = useMemo(
    () => [...recoveryMap.values()].filter((m) => m.status !== "unknown"),
    [recoveryMap],
  );

  const hasBodyData = latestBody?.weight != null || latestBody?.body_fat != null;

  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-5 shadow-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold">Corps</span>
        <Link
          to="/corps"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Mesures →
        </Link>
      </div>

      {loading ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {hasBodyData ? (
            <div className="mb-4 grid grid-cols-3 gap-2">
              {latestBody?.weight != null && <KpiCard label="Poids" value={`${latestBody.weight} kg`} />}
              {latestBody?.body_fat != null && (
                <KpiCard label="Masse grasse" value={`${latestBody.body_fat}%`} />
              )}
              {leanMass != null && <KpiCard label="Masse maigre" value={`${leanMass} kg`} />}
            </div>
          ) : (
            <p className="mb-4 text-[11px] text-muted-foreground">
              Aucune mesure enregistrée. Ajoute ta première.
            </p>
          )}

          {trainedMuscles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {trainedMuscles.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/5 px-2.5 py-0.5 text-[10px] font-medium"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: RECOVERY_COLORS[m.status].stroke }}
                  />
                  {m.label}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Badges card ──────────────────────────────────────────────────────────────

function BadgesCard({
  badges,
}: {
  badges: { id: string; label: string; icon: string; unlocked_at: string }[];
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-5 shadow-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold">Badges & succès</span>
        </div>
        <Link
          to="/profil"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Tout →
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {badges.map((b) => (
          <span
            key={b.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-medium"
          >
            <span className="text-sm leading-none">{b.icon || "🏅"}</span>
            {b.label}
          </span>
        ))}
      </div>
    </section>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  valueClass = "text-foreground",
  icon,
}: {
  label: string;
  value: string;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 px-2 py-3 text-center">
      <div className={`flex items-center justify-center gap-1 text-xl font-bold ${valueClass}`}>
        {icon}
        {value}
      </div>
      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
