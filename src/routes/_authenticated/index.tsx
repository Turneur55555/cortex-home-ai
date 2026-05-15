import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Dumbbell,
  House,
  Flame,
  ChevronRight,
  Bell,
  Plus,
  Loader2,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { ChatBot } from "@/components/ChatBot";
import { getContextualQuote } from "@/lib/quotes";
import { useWorkouts } from "@/hooks/use-fitness";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { useStreak } from "@/hooks/useStreak";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ICORTEX — Accueil" },
      { name: "description", content: "Votre Personal Performance OS." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user } = useAuth();
  const fallback = user?.email?.split("@")[0] ?? "vous";
  const { pseudo: name } = useProfile(fallback);
  const { data: workouts, isLoading: fitnessLoading } = useWorkouts();
  const recoveryMap = useRecoveryMap(workouts);
  const streak = useStreak();
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
    const values = [...recoveryMap.values()];
    const trained = values.filter((m) => m.status !== "unknown");
    if (!trained.length) return null;
    const sum = trained.reduce((acc, m) => {
      if (m.status === "ready") return acc + 1;
      if (m.status === "recovering") return acc + 0.6;
      return acc + 0.1;
    }, 0);
    return Math.round((sum / trained.length) * 100);
  }, [recoveryMap]);

  const fatiguedMuscles = useMemo(
    () =>
      [...recoveryMap.values()]
        .filter((m) => m.status === "fatigued")
        .map((m) => m.label)
        .slice(0, 3),
    [recoveryMap],
  );

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-10">
      {/* ── Header ── */}
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {greeting}
          </p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight">
            Bonjour, <span className="text-primary">{name}</span>
          </h1>
        </div>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
      </header>

      {/* ── Quote ── */}
      <blockquote className="mb-6 border-l-2 border-primary/40 pl-3">
        <p className="text-[12px] italic leading-relaxed text-muted-foreground">
          "{quote.text}"
        </p>
        <footer className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          — {quote.author}
        </footer>
      </blockquote>

      {/* ── Fitness Hero ── */}
      <FitnessHero
        loading={fitnessLoading}
        recoveryScore={recoveryScore}
        weeklyCount={weeklyCount}
        streak={streak.current}
        fatiguedMuscles={fatiguedMuscles}
      />

      {/* ── Maison ── */}
      <Link
        to="/stocks"
        className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:border-primary/30 hover:shadow-elevated"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-glow">
          <House className="h-5 w-5 text-white" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">Maison</p>
          <p className="text-xs text-muted-foreground">Frigo, pharmacie, habits</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      <ChatBot />
    </main>
  );
}

function FitnessHero({
  loading,
  recoveryScore,
  weeklyCount,
  streak,
  fatiguedMuscles,
}: {
  loading: boolean;
  recoveryScore: number | null;
  weeklyCount: number;
  streak: number;
  fatiguedMuscles: string[];
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
    <section className="overflow-hidden rounded-3xl border border-border bg-gradient-surface p-5 shadow-elevated">
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="text-sm font-semibold">Performance</span>
        </div>
        <Link to="/fitness" className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80">
          Voir tout →
        </Link>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <KpiCard
              label="Récup."
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

          {/* Recovery progress bar */}
          {recoveryScore != null && (
            <div className="mb-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500"
                  style={{ width: `${recoveryScore}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {recoveryScore >= 70
                  ? "Muscles majoritairement prêts"
                  : recoveryScore >= 40
                    ? "Récupération en cours"
                    : "Repos recommandé"}
              </p>
            </div>
          )}

          {/* Fatigued muscles */}
          {fatiguedMuscles.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {fatiguedMuscles.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10px] font-medium text-red-400"
                >
                  <MapPin className="h-2.5 w-2.5" />
                  {m}
                </span>
              ))}
            </div>
          )}

          {/* CTAs */}
          <div className="flex gap-2">
            <Link
              to="/fitness"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-xs font-semibold transition-colors hover:border-primary/40"
            >
              <Dumbbell className="h-3.5 w-3.5" />
              Mes séances
            </Link>
            <Link
              to="/fitness"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-glow"
            >
              <Plus className="h-3.5 w-3.5" />
              Nouvelle séance
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

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
