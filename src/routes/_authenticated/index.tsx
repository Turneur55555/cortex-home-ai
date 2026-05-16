import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  Dumbbell,
  House,
  Flame,
  ChevronRight,
  Loader2,
  Check,
  Droplets,
  Moon,
  Zap,
  Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { ChatBot } from "@/components/ChatBot";
import { getContextualQuote } from "@/lib/quotes";
import { useWorkouts } from "@/hooks/use-fitness";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { useStreak } from "@/hooks/useStreak";
import { RECOVERY_COLORS } from "@/lib/fitness/recovery";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ICORTEX — Accueil" },
      { name: "description", content: "Votre Personal Performance OS." },
    ],
  }),
  component: HomePage,
});

// ─── Supplement data (daily localStorage tracking) ────────────────────────────

const SUPPLEMENTS = [
  { id: "creatine", label: "Créatine", hint: "5g · matin", icon: Zap },
  { id: "zinc", label: "Zinc", hint: "15mg · soir", icon: Shield },
  { id: "magnesium", label: "Magnésium", hint: "200mg · nuit", icon: Moon },
  { id: "eau", label: "Hydratation", hint: "2L+ · objectif", icon: Droplets },
] as const;

function useSupplementChecks() {
  const key = `icortex.supps.${new Date().toISOString().slice(0, 10)}`;
  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  });

  const toggle = useCallback(
    (id: string) => {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {}
        return next;
      });
    },
    [key],
  );

  return { checked, toggle };
}

// ─── Latest body measurement ──────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

function HomePage() {
  const { user } = useAuth();
  const fallback = user?.email?.split("@")[0] ?? "vous";
  const { pseudo: name } = useProfile(fallback);
  const { data: workouts, isLoading: fitnessLoading } = useWorkouts();
  const recoveryMap = useRecoveryMap(workouts);
  const streak = useStreak();
  const { data: latestBody } = useLatestBody();
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

  const lastWorkout = workouts?.[0];

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      {/* ── Header ── */}
      <header className="mb-5">
        <h1 className="mt-0.5 text-xl font-bold tracking-tight">
          {greeting},{" "}
          <span className="text-primary">{name}</span>
        </h1>
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

      {/* ── Performance ── */}
      <FitnessHero
        loading={fitnessLoading}
        recoveryScore={recoveryScore}
        weeklyCount={weeklyCount}
        streak={streak.current}
      />

      {/* ── Corps ── */}
      <BodySummaryCard
        loading={fitnessLoading}
        latestBody={latestBody}
        recoveryMap={recoveryMap}
        lastWorkout={lastWorkout}
      />

      {/* ── Rappels ── */}
      <SupplementCard />

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
    <section className="overflow-hidden rounded-3xl border border-border bg-gradient-surface p-5 shadow-elevated">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="text-sm font-semibold">Performance</span>
        </div>
        <Link
          to="/fitness"
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
              + Nouvelle séance
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

// ─── Body summary card ────────────────────────────────────────────────────────

function BodySummaryCard({
  loading,
  latestBody,
  recoveryMap,
  lastWorkout,
}: {
  loading: boolean;
  latestBody: { weight: number | null; body_fat: number | null; muscle_mass: number | null } | null | undefined;
  recoveryMap: ReturnType<typeof useRecoveryMap>;
  lastWorkout: { name: string; date: string } | undefined;
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
    <section className="mt-4 overflow-hidden rounded-3xl border border-border bg-gradient-surface p-5 shadow-elevated">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold">Corps</span>
        <Link
          to="/fitness"
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
          {/* Body metrics */}
          {hasBodyData ? (
            <div className="mb-4 grid grid-cols-3 gap-2">
              {latestBody?.weight != null && (
                <KpiCard label="Poids" value={`${latestBody.weight} kg`} />
              )}
              {latestBody?.body_fat != null && (
                <KpiCard label="Masse grasse" value={`${latestBody.body_fat}%`} />
              )}
              {leanMass != null && (
                <KpiCard label="Masse maigre" value={`${leanMass} kg`} />
              )}
            </div>
          ) : (
            <p className="mb-4 text-[11px] text-muted-foreground">
              Aucune mesure enregistrée. Ajoutez votre première.
            </p>
          )}

          {/* Muscle status */}
          {trainedMuscles.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
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

          {/* Last workout */}
          {lastWorkout && (
            <p className="mb-4 text-[11px] text-muted-foreground">
              Dernière séance :{" "}
              <span className="font-semibold text-foreground">{lastWorkout.name}</span>
              <span className="ml-1 text-muted-foreground/60">· {formatDate(lastWorkout.date)}</span>
            </p>
          )}

          <Link
            to="/fitness"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-xs font-semibold transition-colors hover:border-primary/40"
          >
            Voir Corps →
          </Link>
        </>
      )}
    </section>
  );
}

// ─── Supplement reminders ─────────────────────────────────────────────────────

function SupplementCard() {
  const { checked, toggle } = useSupplementChecks();
  const done = SUPPLEMENTS.filter((s) => checked.has(s.id)).length;

  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-border bg-gradient-surface p-5 shadow-elevated">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Rappels du jour</span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {done}/{SUPPLEMENTS.length}
        </span>
      </div>
      <ul className="space-y-2">
        {SUPPLEMENTS.map(({ id, label, hint, icon: Icon }) => {
          const active = checked.has(id);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => toggle(id)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2.5 text-left transition-all active:scale-[0.99]"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-muted-foreground"}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1">
                  <span
                    className={`block text-xs font-semibold ${active ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    {label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground/60">{hint}</span>
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${active ? "border-emerald-500 bg-emerald-500 text-white" : "border-white/20 bg-transparent"}`}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

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

// ─── Utilities ────────────────────────────────────────────────────────────────

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
