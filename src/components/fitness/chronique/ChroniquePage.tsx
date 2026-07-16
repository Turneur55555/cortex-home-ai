// ============================================================
// LOT C1 — Le module immersif « Chronique »
//
// Toucher une chronique (séance de musculation passée) ouvre cette page
// plein écran : le journal d'un athlète. La page des Chroniques ne change
// pas — seule l'action au clic ouvre ce module (voir SeancesTab.tsx).
//
// Contraintes respectées :
// - AUCUNE donnée métier modifiée : lecture seule de la séance et de
//   l'historique déjà chargés (useWorkouts), calculs via les helpers PURS
//   existants (workoutGrouping, strength, calories, muscleMapping).
// - Réutilisation des composants existants : BodyMap (Scan des Titans),
//   WorkoutProgressCharts (Progression), le bilan IA persisté
//   (useStoredWorkoutAnalysis / workout_analyses).
// - Même langage visuel que La Forge / les parcours cardio : verre teinté,
//   halos, titres serif italique, révélation progressive au défilement.
// ============================================================

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Flame,
  Heart,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";

import type { WorkoutRow } from "@/components/fitness/WorkoutCard";
import { SectionReveal } from "@/components/fitness/SectionReveal";
import { BodyMap } from "@/components/fitness/BodyMap";
import { WorkoutProgressCharts } from "@/components/fitness/WorkoutProgressCharts";
import { StatTileRow, type StatTileSpec } from "@/components/fitness/StatTileRow";
import { DisciplineBadge } from "@/components/fitness/session/DisciplineIcon";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { buildGroups, sessionMuscleActivation } from "@/lib/fitness/workoutGrouping";
import { formatTonnage, workoutTonnage } from "@/lib/fitness/strength";
import { estimateWorkoutCalories, deriveIntensity } from "@/lib/fitness/calories";
import { MUSCLE_META, type MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import { useLatestBodyWeight } from "@/hooks/useLatestBodyWeight";
import { useStoredWorkoutAnalysis } from "@/hooks/useWorkoutAnalyses";

// ── Helpers de présentation ───────────────────────────────────────────────────

const INTENSITY_LABEL: Record<string, string> = {
  light: "Légère",
  moderate: "Modérée",
  intense: "Intense",
  cardio: "Cardio",
};

function metricOf(w: WorkoutRow, bodyWeightKg: number | null) {
  const volume = Math.round(workoutTonnage(w.exercises ?? []));
  const duration = w.duration_minutes ?? 0;
  const calories = estimateWorkoutCalories({
    durationMinutes: duration,
    volumeKg: volume,
    bodyWeightKg,
  });
  const intensity = deriveIntensity(volume, duration);
  return { volume, duration, calories, intensity };
}

// Records tombés par séance : un seul balayage chronologique de tout
// l'historique muscu. Un exercice jamais vu = « nouvel exercice » ; un
// exercice dont la charge max dépasse STRICTEMENT le meilleur passé = PR.
// Aucune donnée inventée — uniquement la comparaison des charges réelles.
type SessionRecord = { key: string; name: string; weight: number; isNew: boolean };

function computeRecordsBySession(muscuWorkouts: WorkoutRow[]) {
  const sorted = [...muscuWorkouts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const ca = (a as { created_at?: string }).created_at ?? "";
    const cb = (b as { created_at?: string }).created_at ?? "";
    return ca.localeCompare(cb);
  });
  const runningMax = new Map<string, number>();
  const bySession = new Map<string, SessionRecord[]>();
  for (const w of sorted) {
    const groups = buildGroups(w.exercises ?? []);
    const records: SessionRecord[] = [];
    for (const g of groups) {
      if (g.maxWeight == null) continue;
      const prev = runningMax.get(g.key);
      if (prev == null) {
        records.push({ key: g.key, name: g.name, weight: g.maxWeight, isNew: true });
        runningMax.set(g.key, g.maxWeight);
      } else if (g.maxWeight > prev) {
        records.push({ key: g.key, name: g.name, weight: g.maxWeight, isNew: false });
        runningMax.set(g.key, g.maxWeight);
      }
    }
    bySession.set(w.id, records);
  }
  return bySession;
}

function activationToRecoveryMap(
  activation: ReturnType<typeof sessionMuscleActivation>,
): Map<MuscleId, MuscleRecovery> {
  const map = new Map<MuscleId, MuscleRecovery>();
  if (activation.length === 0) return map;
  const maxVol = Math.max(activation[0].volume, 1);
  for (const a of activation) {
    const ratio = a.volume > 0 ? a.volume / maxVol : a.sets / Math.max(activation[0].sets, 1);
    // Réutilise l'échelle de couleur du Scan (fatigued/recovering/ready) pour
    // représenter l'INTENSITÉ de sollicitation de la séance, pas la récup.
    const status: MuscleRecovery["status"] =
      ratio >= 0.6 ? "fatigued" : ratio >= 0.3 ? "recovering" : "ready";
    map.set(a.id, {
      id: a.id,
      label: a.label,
      status,
      lastTrained: null,
      hoursSinceLast: null,
      recoveryWindowHours: MUSCLE_META[a.id].recoveryHours,
      hoursRemaining: null,
    });
  }
  return map;
}

// ── Blocs de présentation ─────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      <h2 className="font-serif text-[15px] font-semibold italic text-white/90">{children}</h2>
    </div>
  );
}

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] shadow-card backdrop-blur-xl " +
        className
      }
    >
      {children}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export function ChroniquePage({
  workout,
  allWorkouts,
  prByName,
  histByName,
  nameByKey,
  onBack,
  onNavigate,
}: {
  workout: WorkoutRow;
  /** Historique complet (trié desc par date, tel que renvoyé par useWorkouts). */
  allWorkouts: WorkoutRow[];
  prByName: Map<string, number>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  nameByKey: Map<string, string>;
  onBack: () => void;
  onNavigate: (w: WorkoutRow) => void;
}) {
  const { data: bodyWeightKg } = useLatestBodyWeight();
  const { data: analysis } = useStoredWorkoutAnalysis(workout.id);

  const muscuWorkouts = useMemo(
    () => allWorkouts.filter((w) => ((w.discipline as string | undefined) ?? "muscu") === "muscu"),
    [allWorkouts],
  );

  const groups = useMemo(() => buildGroups(workout.exercises ?? []), [workout.exercises]);
  const activation = useMemo(
    () => sessionMuscleActivation(workout.exercises ?? []),
    [workout.exercises],
  );
  const sessionRecoveryMap = useMemo(() => activationToRecoveryMap(activation), [activation]);
  const recordsBySession = useMemo(() => computeRecordsBySession(muscuWorkouts), [muscuWorkouts]);
  const records = recordsBySession.get(workout.id) ?? [];
  const prs = records.filter((r) => !r.isNew);
  const newExercises = records.filter((r) => r.isNew);

  // Agrégats réels de la séance.
  const agg = useMemo(() => {
    const today = metricOf(workout, bodyWeightKg ?? null);
    let totalSeries = 0;
    let bestSet: { name: string; weight: number; reps: number | null } | null = null;
    let topVolume: { name: string; volume: number } | null = null;
    for (const g of groups) {
      totalSeries += g.totalSeries;
      for (const s of g.series) {
        if (s.weight != null && (bestSet == null || s.weight > bestSet.weight)) {
          bestSet = { name: g.name, weight: s.weight, reps: s.reps };
        }
      }
      if (g.volume > 0 && (topVolume == null || g.volume > topVolume.volume)) {
        topVolume = { name: g.name, volume: g.volume };
      }
    }
    return { ...today, totalSeries, exoCount: groups.length, bestSet, topVolume };
  }, [workout, groups, bodyWeightKg]);

  const primaryMuscle = activation[0]?.label ?? null;

  // Résumé « histoire » : le bilan IA persisté si disponible, sinon une
  // phrase factuelle construite depuis les chiffres réels (jamais inventée).
  const heroSummary = useMemo(() => {
    if (analysis?.summary?.headline) return analysis.summary.headline;
    const parts: string[] = [];
    if (primaryMuscle && agg.volume > 0) {
      parts.push(
        `Ton ${primaryMuscle.toLowerCase()} a encaissé ${formatTonnage(agg.volume)}${
          agg.duration > 0 ? ` en ${agg.duration} minutes` : ""
        }.`,
      );
    } else if (agg.volume > 0) {
      parts.push(`${formatTonnage(agg.volume)} soulevés sur cette séance.`);
    }
    if (prs.length > 0) {
      parts.push(prs.length === 1 ? "Un record est tombé." : `${prs.length} records sont tombés.`);
    }
    if (parts.length === 0)
      parts.push("Chaque série compte. Cette séance fait partie de ta légende.");
    return parts.join(" ");
  }, [analysis, primaryMuscle, agg.volume, agg.duration, prs.length]);

  // Progression : on cible les exercices de CETTE séance qui ont au moins 2
  // points d'historique (le composant existant ignore les autres).
  const sessionExerciseKeys = useMemo(() => {
    const keys = groups.map((g) => g.key).filter((k) => (histByName.get(k)?.length ?? 0) >= 2);
    return Array.from(new Set(keys)).slice(0, 4);
  }, [groups, histByName]);

  // Comparaison : aujourd'hui vs moyenne 30 jours vs meilleure séance (volume).
  const comparison = useMemo(() => {
    const workoutDate = parseISO(workout.date);
    const window = muscuWorkouts.filter(
      (w) => Math.abs(differenceInCalendarDays(workoutDate, parseISO(w.date))) <= 30,
    );
    const metrics = window.map((w) => ({
      m: metricOf(w, bodyWeightKg ?? null),
      records: (recordsBySession.get(w.id) ?? []).filter((r) => !r.isNew).length,
    }));
    const n = metrics.length || 1;
    const avg = {
      volume: Math.round(metrics.reduce((s, x) => s + x.m.volume, 0) / n),
      calories: Math.round(metrics.reduce((s, x) => s + (x.m.calories ?? 0), 0) / n),
      duration: Math.round(metrics.reduce((s, x) => s + x.m.duration, 0) / n),
      records: Math.round((metrics.reduce((s, x) => s + x.records, 0) / n) * 10) / 10,
    };
    // Meilleure séance = plus gros volume de tout l'historique muscu.
    let best: WorkoutRow | null = null;
    let bestVol = -1;
    for (const w of muscuWorkouts) {
      const v = workoutTonnage(w.exercises ?? []);
      if (v > bestVol) {
        bestVol = v;
        best = w;
      }
    }
    const bestMetric = best ? metricOf(best, bodyWeightKg ?? null) : null;
    const bestRecords = best
      ? (recordsBySession.get(best.id) ?? []).filter((r) => !r.isNew).length
      : 0;
    return { avg, bestMetric, bestRecords, isBest: best?.id === workout.id };
  }, [workout, muscuWorkouts, bodyWeightKg, recordsBySession]);

  // Navigation historique (desc : index+1 = plus ancienne, index-1 = plus récente).
  const idx = muscuWorkouts.findIndex((w) => w.id === workout.id);
  const olderWorkout = idx >= 0 && idx < muscuWorkouts.length - 1 ? muscuWorkouts[idx + 1] : null;
  const newerWorkout = idx > 0 ? muscuWorkouts[idx - 1] : null;

  const [muscleDetail, setMuscleDetail] = useState<MuscleId | null>(null);
  const muscleDetailData = muscleDetail ? activation.find((a) => a.id === muscleDetail) : null;

  const dateLong = format(parseISO(workout.date), "EEEE d MMMM", { locale: fr });
  const dateShort = format(parseISO(workout.date), "d MMM", { locale: fr });
  const timeLabel = format(parseISO(workout.date), "HH'h'mm", { locale: fr });

  const heroTiles: StatTileSpec[] = [
    {
      key: "duree",
      icon: <Clock className="h-3.5 w-3.5" />,
      label: "Durée",
      value: agg.duration > 0 ? `${agg.duration}` : "—",
      unit: agg.duration > 0 ? "min" : undefined,
    },
    {
      key: "tonnage",
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      label: "Tonnage",
      value: agg.volume > 0 ? formatTonnage(agg.volume) : "—",
    },
    {
      key: "calories",
      icon: <Flame className="h-3.5 w-3.5" />,
      label: "Calories",
      value: agg.calories != null ? `${agg.calories}` : "—",
      unit: agg.calories != null ? "kcal" : undefined,
    },
    {
      key: "exos",
      icon: <Layers className="h-3.5 w-3.5" />,
      label: "Exos",
      value: `${agg.exoCount}`,
    },
  ];

  return (
    <motion.section
      key={workout.id}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-5 pb-4"
    >
      {/* ── Barre de retour — navigation native ───────────────────────── */}
      <div className="sticky top-0 z-30 -mx-1 flex items-center gap-3 bg-background/70 px-1 py-2 backdrop-blur-xl">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full bg-white/[0.06] py-2 pl-2.5 pr-4 text-sm font-semibold text-white/90 transition-all active:scale-95 hover:bg-white/[0.1]"
          aria-label="Retour aux Chroniques"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour
        </button>
        <span className="truncate font-serif text-[13px] font-semibold italic text-white/60">
          Chronique du {dateShort}
        </span>
      </div>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <SectionReveal>
        <GlassCard className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 20% 0%, rgba(99,102,241,0.16) 0%, transparent 55%), radial-gradient(80% 70% at 100% 100%, rgba(234,179,8,0.06) 0%, transparent 60%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-6 top-0 h-px"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)",
            }}
          />
          <div className="relative p-6">
            <p className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
              {dateLong} • {timeLabel}
              <DisciplineBadge
                icon={ENGINE_REGISTRY.muscu.icon}
                label={ENGINE_REGISTRY.muscu.label}
                accentClassName={ENGINE_REGISTRY.muscu.accentClassName}
              />
            </p>
            <h1 className="mt-2 font-serif text-[28px] font-semibold italic leading-tight tracking-wide text-white">
              {workout.name || "Séance"}
            </h1>

            {primaryMuscle && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1">
                <Dumbbell className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-primary">
                  Dominante {primaryMuscle}
                </span>
              </div>
            )}

            {/* Résumé — la séance raconte une histoire */}
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-[13px] leading-relaxed text-white/80">{heroSummary}</p>
            </div>

            <div className="mt-4">
              <StatTileRow tiles={heroTiles} />
            </div>
          </div>
        </GlassCard>
      </SectionReveal>

      {/* ── EXPLOITS ──────────────────────────────────────────────────── */}
      {(prs.length > 0 || newExercises.length > 0 || agg.bestSet || agg.topVolume) && (
        <SectionReveal>
          <div>
            <SectionTitle icon={<Trophy className="h-4 w-4 text-amber-400" />}>
              Exploits du jour
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {prs.map((r) => (
                <GlassCard key={`pr-${r.key}`} className="border-amber-400/20">
                  <div className="flex items-start gap-2 p-4">
                    <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                        Record
                      </p>
                      <p className="truncate text-sm font-semibold text-white/90">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.weight} kg</p>
                    </div>
                  </div>
                </GlassCard>
              ))}
              {newExercises.map((r) => (
                <GlassCard key={`new-${r.key}`} className="border-primary/20">
                  <div className="flex items-start gap-2 p-4">
                    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                        Nouvel exercice
                      </p>
                      <p className="truncate text-sm font-semibold text-white/90">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.weight} kg</p>
                    </div>
                  </div>
                </GlassCard>
              ))}
              {agg.bestSet && (
                <GlassCard>
                  <div className="flex items-start gap-2 p-4">
                    <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-white/70" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                        Meilleure série
                      </p>
                      <p className="truncate text-sm font-semibold text-white/90">
                        {agg.bestSet.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {agg.bestSet.weight} kg
                        {agg.bestSet.reps != null ? ` × ${agg.bestSet.reps}` : ""}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              )}
              {agg.topVolume && (
                <GlassCard>
                  <div className="flex items-start gap-2 p-4">
                    <Layers className="mt-0.5 h-4 w-4 shrink-0 text-white/70" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                        Plus gros tonnage
                      </p>
                      <p className="truncate text-sm font-semibold text-white/90">
                        {agg.topVolume.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTonnage(agg.topVolume.volume)}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              )}
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── PROGRESSION — graphes existants, en grand ─────────────────── */}
      {sessionExerciseKeys.length > 0 && (
        <SectionReveal>
          <div>
            <SectionTitle icon={<TrendingUp className="h-4 w-4" />}>Progression</SectionTitle>
            <WorkoutProgressCharts
              topExercises={sessionExerciseKeys}
              histByName={histByName}
              prByName={prByName}
              nameByKey={nameByKey}
            />
          </div>
        </SectionReveal>
      )}

      {/* ── SCAN DES TITANS — composant existant, sollicitation du jour ─ */}
      {activation.length > 0 && (
        <SectionReveal>
          <div>
            <SectionTitle icon={<Activity className="h-4 w-4 text-cyan-300" />}>
              Scan des Titans
            </SectionTitle>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Ce que cette séance a réveillé — touche un muscle pour son détail.
            </p>
            <BodyMap
              mode="recovery"
              recoveryMap={sessionRecoveryMap}
              onMuscleClick={(id) => setMuscleDetail(id)}
            />
            {muscleDetailData && (
              <div className="mt-2 flex items-center justify-between rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] px-4 py-3">
                <span className="text-sm font-semibold text-cyan-100/90">
                  {muscleDetailData.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {muscleDetailData.sets} série{muscleDetailData.sets > 1 ? "s" : ""}
                  {muscleDetailData.volume > 0
                    ? ` · ${formatTonnage(muscleDetailData.volume)}`
                    : ""}
                </span>
              </div>
            )}
          </div>
        </SectionReveal>
      )}

      {/* ── TIMELINE — chronologie de la séance ───────────────────────── */}
      {groups.length > 0 && (
        <SectionReveal>
          <div>
            <SectionTitle icon={<Clock className="h-4 w-4" />}>Déroulé de la séance</SectionTitle>
            <GlassCard>
              <ol className="relative p-5">
                <span
                  aria-hidden
                  className="absolute bottom-6 left-[26px] top-6 w-px bg-gradient-to-b from-primary/40 via-white/10 to-transparent"
                />
                {groups.map((g, i) => {
                  const isPR = prs.some((r) => r.key === g.key);
                  const isNew = newExercises.some((r) => r.key === g.key);
                  return (
                    <li key={g.key} className="relative flex gap-4 pb-5 last:pb-0">
                      <span
                        className={
                          "z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-4 ring-background " +
                          (isPR ? "bg-amber-400 text-black" : "bg-primary/20 text-primary")
                        }
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white/90">{g.name}</p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground/80">
                          {g.totalSeries} série{g.totalSeries > 1 ? "s" : ""}
                          {g.maxWeight != null ? ` · max ${g.maxWeight} kg` : ""}
                          {g.totalReps > 0 ? ` · ${g.totalReps} reps` : ""}
                        </p>
                        {(isPR || isNew) && (
                          <span
                            className={
                              "mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold " +
                              (isPR
                                ? "bg-amber-400/15 text-amber-400"
                                : "bg-primary/15 text-primary")
                            }
                          >
                            <Trophy className="h-3 w-3" />
                            {isPR ? "Nouveau record" : "Nouvel exercice"}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </GlassCard>
          </div>
        </SectionReveal>
      )}

      {/* ── ANALYSE IA — cartes courtes (bilan persisté) ──────────────── */}
      {analysis && (
        <SectionReveal>
          <div>
            <SectionTitle icon={<Sparkles className="h-4 w-4" />}>Analyse IA</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {analysis.performance.intensity_comment && (
                <AnalysisCard
                  icon={<TrendingUp className="h-4 w-4" />}
                  title="Points forts"
                  body={analysis.performance.intensity_comment}
                />
              )}
              {analysis.muscles.balance_comment && (
                <AnalysisCard
                  icon={<Activity className="h-4 w-4" />}
                  title="Équilibre"
                  body={analysis.muscles.balance_comment}
                  chips={analysis.muscles.overloaded}
                  chipTone="warning"
                />
              )}
              {analysis.muscles.trained.length > 0 && (
                <AnalysisCard
                  icon={<Dumbbell className="h-4 w-4" />}
                  title="Muscles sollicités"
                  chips={analysis.muscles.trained}
                />
              )}
              {analysis.recovery.recovery_tip && (
                <AnalysisCard
                  icon={<Heart className="h-4 w-4" />}
                  title="Récupération"
                  body={`${analysis.recovery.rest_hours}h de repos — ${analysis.recovery.recovery_tip}`}
                  chips={analysis.recovery.priority_muscles}
                />
              )}
              {analysis.next_session.session_type && (
                <AnalysisCard
                  icon={<Target className="h-4 w-4" />}
                  title="Prochaine séance"
                  body={`${analysis.next_session.session_type} · ${analysis.next_session.timing}`}
                  chips={analysis.next_session.recommended_muscles}
                  chipTone="success"
                />
              )}
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── COMPARAISON ───────────────────────────────────────────────── */}
      <SectionReveal>
        <div>
          <SectionTitle icon={<Layers className="h-4 w-4" />}>Comparaison</SectionTitle>
          <GlassCard>
            <div className="p-4">
              <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] gap-2 border-b border-white/[0.06] pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                <span />
                <span className="text-center text-primary">Aujourd'hui</span>
                <span className="text-center">Moy. 30j</span>
                <span className="text-center">Record</span>
              </div>
              {[
                {
                  label: "Volume",
                  today: agg.volume > 0 ? formatTonnage(agg.volume) : "—",
                  avg: comparison.avg.volume > 0 ? formatTonnage(comparison.avg.volume) : "—",
                  best:
                    comparison.bestMetric && comparison.bestMetric.volume > 0
                      ? formatTonnage(comparison.bestMetric.volume)
                      : "—",
                },
                {
                  label: "Calories",
                  today: agg.calories != null ? `${agg.calories}` : "—",
                  avg: comparison.avg.calories > 0 ? `${comparison.avg.calories}` : "—",
                  best:
                    comparison.bestMetric?.calories != null
                      ? `${comparison.bestMetric.calories}`
                      : "—",
                },
                {
                  label: "Intensité",
                  today: INTENSITY_LABEL[agg.intensity] ?? agg.intensity,
                  avg: "—",
                  best: comparison.bestMetric
                    ? (INTENSITY_LABEL[comparison.bestMetric.intensity] ??
                      comparison.bestMetric.intensity)
                    : "—",
                },
                {
                  label: "Records",
                  today: `${prs.length}`,
                  avg: `${comparison.avg.records}`,
                  best: `${comparison.bestRecords}`,
                },
                {
                  label: "Temps",
                  today: agg.duration > 0 ? `${agg.duration} min` : "—",
                  avg: comparison.avg.duration > 0 ? `${comparison.avg.duration} min` : "—",
                  best:
                    comparison.bestMetric && comparison.bestMetric.duration > 0
                      ? `${comparison.bestMetric.duration} min`
                      : "—",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[1.1fr_1fr_1fr_1fr] items-center gap-2 border-b border-white/[0.04] py-2.5 text-sm last:border-0"
                >
                  <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
                  <span className="text-center font-bold tabular-nums text-primary">
                    {row.today}
                  </span>
                  <span className="text-center tabular-nums text-white/70">{row.avg}</span>
                  <span className="text-center tabular-nums text-white/70">{row.best}</span>
                </div>
              ))}
              {comparison.isBest && (
                <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-amber-400/10 py-2 text-[11px] font-semibold text-amber-400">
                  <Trophy className="h-3.5 w-3.5" />
                  Ta meilleure séance en volume
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </SectionReveal>

      {/* ── HISTORIQUE — chronique précédente / suivante ──────────────── */}
      <SectionReveal>
        <div className="flex items-stretch gap-3">
          <button
            type="button"
            disabled={!olderWorkout}
            onClick={() => olderWorkout && onNavigate(olderWorkout)}
            className="flex flex-1 items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-left transition-all active:scale-[0.98] hover:bg-white/[0.06] disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Précédente
              </p>
              <p className="truncate text-xs font-semibold text-white/80">
                {olderWorkout ? format(parseISO(olderWorkout.date), "d MMM", { locale: fr }) : "—"}
              </p>
            </div>
          </button>
          <button
            type="button"
            disabled={!newerWorkout}
            onClick={() => newerWorkout && onNavigate(newerWorkout)}
            className="flex flex-1 items-center justify-end gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-right transition-all active:scale-[0.98] hover:bg-white/[0.06] disabled:opacity-30"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Suivante
              </p>
              <p className="truncate text-xs font-semibold text-white/80">
                {newerWorkout ? format(parseISO(newerWorkout.date), "d MMM", { locale: fr }) : "—"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      </SectionReveal>
    </motion.section>
  );
}

// ── Carte d'analyse courte ────────────────────────────────────────────────────

function AnalysisCard({
  icon,
  title,
  body,
  chips,
  chipTone = "primary",
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  chips?: string[];
  chipTone?: "primary" | "warning" | "success";
}) {
  const toneClass =
    chipTone === "warning"
      ? "bg-amber-500/10 text-amber-400"
      : chipTone === "success"
        ? "bg-green-500/10 text-green-400"
        : "bg-primary/15 text-primary";
  return (
    <GlassCard>
      <div className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <h3 className="text-[13px] font-semibold text-white/90">{title}</h3>
        </div>
        {body && <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>}
        {chips && chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c}
                className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + toneClass}
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
