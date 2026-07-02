import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Dumbbell,
  Flame,
  Apple,
  TrendingDown,
  TrendingUp,
  Minus,
  Quote as QuoteIcon,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { ChatBot } from "@/components/ChatBot";
import { getContextualQuote } from "@/lib/quotes";
import { useWorkouts, useNutrition, useNutritionGoals } from "@/hooks/use-fitness";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { useStreak } from "@/hooks/useStreak";
import { useNutritionHistory } from "@/hooks/use-nutrition-history";
import { workoutTonnage } from "@/lib/fitness/strength";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ICORTEX — Accueil" },
      { name: "description", content: "Ton tableau de bord nutrition & muscu." },
    ],
  }),
  component: HomePage,
});

// ─── Data ─────────────────────────────────────────────────────────────────────

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
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const { data: meals } = useNutrition(today);
  const { data: nutritionGoal } = useNutritionGoals();
  const { data: weightHistory } = useWeightHistory();
  const { data: nutritionHistory } = useNutritionHistory(7);
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

  const todayTotals = useMemo(() => {
    const acc = { calories: 0, proteins: 0 };
    for (const m of meals ?? []) {
      acc.calories += m.calories ?? 0;
      acc.proteins += m.proteins ?? 0;
    }
    return { calories: Math.round(acc.calories), proteins: Math.round(acc.proteins) };
  }, [meals]);

  const lastWorkout = useMemo(() => (workouts ?? [])[0] ?? null, [workouts]);

  const weightPoints = useMemo(
    () =>
      (weightHistory ?? [])
        .map((d) => d.weight)
        .filter((v): v is number => v != null)
        .slice(-14),
    [weightHistory],
  );

  const tonnage7d = useMemo(() => {
    if (!workouts) return [] as number[];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    cutoff.setHours(0, 0, 0, 0);
    const byDay = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      byDay.set(d.toISOString().split("T")[0], 0);
    }
    for (const w of workouts) {
      if (byDay.has(w.date)) {
        byDay.set(w.date, (byDay.get(w.date) ?? 0) + workoutTonnage(w.exercises ?? []));
      }
    }
    return [...byDay.values()];
  }, [workouts]);

  const proteins7d = useMemo(
    () => (nutritionHistory ?? []).map((d) => d.proteins),
    [nutritionHistory],
  );

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      {/* 1 ── Header compact ── */}
      <HeaderCompact greeting={greeting} name={name} streak={streak.current} />

      {/* 2 ── Nutrition du jour (ring double) ── */}
      <TodayRingCard
        calories={todayTotals.calories}
        proteins={todayTotals.proteins}
        goalKcal={nutritionGoal?.calories ?? null}
        goalProt={nutritionGoal?.proteins ?? null}
      />

      {/* 3 ── Muscu : récup + séances + dernière + CTA ── */}
      <MuscuCard
        loading={fitnessLoading}
        recoveryScore={recoveryScore}
        weeklyCount={weeklyCount}
        lastWorkout={lastWorkout}
      />

      {/* 4 ── Progression (tabs) ── */}
      <ProgressionCard
        weight={weightPoints}
        tonnage={tonnage7d}
        proteins={proteins7d}
      />

      <ChatBot />
    </main>
  );
}

// ─── 1. Header ────────────────────────────────────────────────────────────────

function HeaderCompact({
  greeting,
  name,
  streak,
}: {
  greeting: string;
  name: string;
  streak: number;
}) {
  const [showQuote, setShowQuote] = useState(false);
  const quote = useMemo(() => getContextualQuote(), []);

  return (
    <header className="mb-5">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Tableau de bord
      </p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}, <span className="text-primary">{name}</span>
        </h1>
        {streak > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/20 bg-orange-400/10 px-2.5 py-1 text-[11px] font-semibold text-orange-300">
            <Flame className="h-3 w-3" />
            {streak}j
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowQuote((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-primary"
      >
        <QuoteIcon className="h-2.5 w-2.5" />
        {showQuote ? "Masquer" : "Citation du jour"}
      </button>
      {showQuote && (
        <blockquote className="mt-2 border-l-2 border-primary/40 pl-3">
          <p className="text-[12px] italic leading-relaxed text-muted-foreground">
            "{quote.text}"
          </p>
          <footer className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            — {quote.author}
          </footer>
        </blockquote>
      )}
    </header>
  );
}

// ─── 2. Today Ring (nutrition) ────────────────────────────────────────────────

function TodayRingCard({
  calories,
  proteins,
  goalKcal,
  goalProt,
}: {
  calories: number;
  proteins: number;
  goalKcal: number | null;
  goalProt: number | null;
}) {
  const kcalPct = goalKcal && goalKcal > 0 ? Math.min(100, (calories / goalKcal) * 100) : 0;
  const protPct = goalProt && goalProt > 0 ? Math.min(100, (proteins / goalProt) * 100) : 0;
  const hasGoals = goalKcal != null || goalProt != null;

  return (
    <section className="overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-5 shadow-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Apple className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold">Nutrition du jour</span>
        </div>
        <Link
          to="/nutrition"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Détails →
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <DualRing kcalPct={kcalPct} protPct={protPct} />
        <div className="min-w-0 flex-1 space-y-2">
          <MacroLine
            color="text-emerald-400"
            label="Calories"
            value={calories}
            unit="kcal"
            goal={goalKcal}
          />
          <MacroLine
            color="text-blue-400"
            label="Protéines"
            value={proteins}
            unit="g"
            goal={goalProt}
          />
          {!hasGoals && (
            <p className="text-[10px] text-muted-foreground">
              Définis tes objectifs dans <Link to="/profil" className="text-primary">Profil</Link>.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function DualRing({ kcalPct, protPct }: { kcalPct: number; protPct: number }) {
  const size = 96;
  const cx = size / 2;
  const cy = size / 2;
  const r1 = 40;
  const r2 = 30;
  const c1 = 2 * Math.PI * r1;
  const c2 = 2 * Math.PI * r2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={cx} cy={cy} r={r1} fill="none" strokeWidth="6" className="stroke-white/8" />
      <circle
        cx={cx}
        cy={cy}
        r={r1}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c1}
        strokeDashoffset={c1 * (1 - kcalPct / 100)}
        className="stroke-emerald-400 transition-all duration-700"
      />
      <circle cx={cx} cy={cy} r={r2} fill="none" strokeWidth="6" className="stroke-white/8" />
      <circle
        cx={cx}
        cy={cy}
        r={r2}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c2}
        strokeDashoffset={c2 * (1 - protPct / 100)}
        className="stroke-blue-400 transition-all duration-700"
      />
    </svg>
  );
}

function MacroLine({
  color,
  label,
  value,
  unit,
  goal,
}: {
  color: string;
  label: string;
  value: number;
  unit: string;
  goal: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm font-bold">
        <span className={color}>{value}</span>
        <span className="text-[10px] font-normal text-muted-foreground">
          {goal != null ? ` / ${goal}` : ""} {unit}
        </span>
      </span>
    </div>
  );
}

// ─── 3. Muscu ─────────────────────────────────────────────────────────────────

function MuscuCard({
  loading,
  recoveryScore,
  weeklyCount,
  lastWorkout,
}: {
  loading: boolean;
  recoveryScore: number | null;
  weeklyCount: number;
  lastWorkout:
    | { id: string; name: string; date: string; duration_minutes: number | null }
    | null;
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
    <section className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-5 shadow-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Muscu</span>
        </div>
        <Link
          to="/seances"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Historique →
        </Link>
      </div>

      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-card/50 px-3 py-3 text-center">
              <div className={`text-xl font-bold ${scoreColor}`}>
                {recoveryScore != null ? `${recoveryScore}%` : "—"}
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Récupération</p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 px-3 py-3 text-center">
              <div className="text-xl font-bold">{weeklyCount}</div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Séances / sem.</p>
            </div>
          </div>

          {lastWorkout && (
            <p className="mb-3 text-[11px] text-muted-foreground">
              Dernière :{" "}
              <span className="font-medium text-foreground">
                {lastWorkout.name || "Séance"}
              </span>{" "}
              · {formatRelative(lastWorkout.date)}
              {lastWorkout.duration_minutes ? ` · ${lastWorkout.duration_minutes} min` : ""}
            </p>
          )}

          <Link
            to="/seances"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-glow"
          >
            + Nouvelle séance
          </Link>
        </>
      )}
    </section>
  );
}

// ─── 4. Progression (tabs) ────────────────────────────────────────────────────

type Tab = "weight" | "tonnage" | "proteins";

function ProgressionCard({
  weight,
  tonnage,
  proteins,
}: {
  weight: number[];
  tonnage: number[];
  proteins: number[];
}) {
  const [tab, setTab] = useState<Tab>("weight");

  const config: Record<
    Tab,
    { label: string; points: number[]; unit: string; color: string; to: "/corps" | "/seances" | "/nutrition" }
  > = {
    weight: { label: "Poids", points: weight, unit: "kg", color: "text-primary", to: "/corps" },
    tonnage: { label: "Tonnage 7j", points: tonnage, unit: "kg", color: "text-orange-400", to: "/seances" },
    proteins: { label: "Protéines 7j", points: proteins, unit: "g", color: "text-blue-400", to: "/nutrition" },
  };

  const cur = config[tab];
  const last = cur.points.length ? cur.points[cur.points.length - 1] : null;
  const prev = cur.points.length >= 2 ? cur.points[cur.points.length - 2] : null;
  const delta = last != null && prev != null ? Math.round((last - prev) * 10) / 10 : null;
  const TrendIcon = delta == null ? Minus : delta < 0 ? TrendingDown : delta > 0 ? TrendingUp : Minus;
  const trendColor =
    delta == null
      ? "text-muted-foreground"
      : (tab === "weight" ? delta < 0 : delta > 0)
        ? "text-emerald-400"
        : delta === 0
          ? "text-muted-foreground"
          : "text-amber-400";

  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-5 shadow-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold">Progression</span>
        <Link
          to={cur.to}
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Voir →
        </Link>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl border border-border bg-card/40 p-1">
        {(Object.keys(config) as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              "flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors " +
              (tab === k
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {config[k].label}
          </button>
        ))}
      </div>

      {cur.points.filter((p) => p > 0).length < 2 ? (
        <p className="py-4 text-center text-[11px] text-muted-foreground">
          Pas assez de données pour tracer la tendance.
        </p>
      ) : (
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={`text-2xl font-bold leading-none ${cur.color}`}>
              {last != null ? Math.round(last) : "—"}
              <span className="ml-1 text-xs font-normal text-muted-foreground">{cur.unit}</span>
            </p>
            <p className={`mt-1.5 flex items-center gap-1 text-[11px] font-medium ${trendColor}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              {delta == null
                ? "—"
                : `${delta > 0 ? "+" : ""}${delta} ${cur.unit}`}
            </p>
          </div>
          <Sparkline points={cur.points} colorClass={cur.color} />
        </div>
      )}
    </section>
  );
}

function Sparkline({ points, colorClass }: { points: number[]; colorClass: string }) {
  if (points.length < 2) return null;
  const w = 140;
  const h = 44;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - ((p - min) / span) * h]);
  const d = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={colorClass}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

function formatRelative(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff <= 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  if (diff < 7) return `il y a ${diff}j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
