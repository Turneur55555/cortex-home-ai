import { useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  Brain,
  Dumbbell,
  Gauge,
  Loader2,
  Minus,
  Scale,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useExerciseSetHistory } from "@/hooks/useExerciseSetHistory";
import { useExerciseAnalysis } from "@/hooks/useExerciseAnalysis";
import { useDeepExerciseAI } from "@/hooks/useDeepExerciseAI";
import { useTrainingObjective } from "@/hooks/useTrainingObjective";
import { buildSessionStats, currentBests } from "@/lib/fitness/progression";
import { formatTonnage } from "@/lib/fitness/strength";
import { RECOVERY_COLORS, RECOVERY_LABELS } from "@/lib/fitness/recovery";
import {
  OBJECTIVE_LABELS,
  RELEVANCE_LABELS,
  ROLE_LABELS,
  type MuscleContribution,
  type MuscleRole,
  type Trend,
  type TrainingObjective,
} from "@/lib/fitness/analysis";
import { ExerciseRankCard } from "./ExerciseRankCard";

type Tab = "weight" | "volume" | "1rm";

const OBJECTIVE_ORDER: TrainingObjective[] = [
  "force",
  "hypertrophie",
  "seche",
  "endurance",
  "posture",
  "general",
];

export function ExerciseAnalysisSheet({
  exerciseName,
  weightHistory,
  volumeHistory,
  pr,
  imageUrl,
  onClose,
}: {
  exerciseName: string;
  weightHistory: Array<{ date: string; weight: number }>;
  volumeHistory: Array<{ date: string; volume: number }>;
  pr: number | undefined;
  imageUrl?: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("weight");
  const { data: history } = useExerciseSetHistory(exerciseName);
  const { analysis } = useExerciseAnalysis(exerciseName);
  const deep = useDeepExerciseAI(analysis);
  const { objective: explicitObjective, setObjective } = useTrainingObjective();
  const [showObjective, setShowObjective] = useState(false);

  const stats = useMemo(
    () =>
      buildSessionStats(
        (history ?? []).map((h) => ({
          date: h.date,
          workoutId: h.workoutId,
          sets: h.sets.map((s) => ({ reps: s.reps, weight: s.weight })),
        })),
      ),
    [history],
  );
  const hasReal = stats.some((s) => s.setCount > 0 && s.best1RM != null);
  const bests = useMemo(() => currentBests(stats), [stats]);

  const realSeries = useMemo(
    () => stats.filter((s) => s.best1RM != null).map((s) => ({ date: s.date, value: s.best1RM as number })),
    [stats],
  );
  const weightSeries = useMemo(
    () => stats.filter((s) => s.topWeight != null).map((s) => ({ date: s.date, value: s.topWeight as number })),
    [stats],
  );
  const volumeSeries = useMemo(
    () => stats.filter((s) => s.tonnage > 0).map((s) => ({ date: s.date, value: s.tonnage })),
    [stats],
  );

  const rawData =
    tab === "weight"
      ? weightSeries.length > 0
        ? weightSeries
        : weightHistory.map((p) => ({ date: p.date, value: p.weight }))
      : tab === "volume"
        ? volumeSeries.length > 0
          ? volumeSeries
          : volumeHistory.map((p) => ({ date: p.date, value: p.volume }))
        : realSeries;

  const chartData = rawData.map((p) => ({
    date: format(parseISO(p.date), "d MMM", { locale: fr }),
    value: p.value,
  }));
  const unit = tab === "volume" ? "vol." : "kg";
  const cutoff30 = subDays(new Date(), 30);
  const last30 = rawData.filter((p) => parseISO(p.date) >= cutoff30);
  const avg30 = last30.length > 0 ? last30.reduce((s, p) => s + p.value, 0) / last30.length : null;
  const firstVal = rawData[0]?.value ?? 0;
  const lastVal = rawData[rawData.length - 1]?.value ?? 0;
  const progression = rawData.length >= 2 && firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : null;

  const tabs: Tab[] = hasReal ? ["weight", "volume", "1rm"] : ["weight", "volume"];
  const tabLabel: Record<Tab, string> = { weight: "Poids (kg)", volume: "Volume", "1rm": "1RM est." };
  const sessionsDesc = useMemo(() => [...stats].reverse(), [stats]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold capitalize">{exerciseName}</h3>
              <p className="text-[11px] text-muted-foreground">Fiche d'analyse intelligente</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="-mx-1 space-y-4 overflow-y-auto px-1">
          {/* Résumé intelligent + pertinence */}
          {analysis && (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
              <div className="mb-2 flex items-center justify-between">
                <StarRating stars={analysis.relevance.stars} />
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {RELEVANCE_LABELS[analysis.relevance.label]}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-foreground/90">{analysis.smartSummary}</p>
            </div>
          )}

          {/* Rang RPG + XP + progression vers le niveau suivant */}
          <ExerciseRankCard exerciseName={exerciseName} />

          {/* Photo */}
          {imageUrl && (
            <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/5">
              <img src={imageUrl} alt={exerciseName} className="max-h-56 w-full object-contain" loading="lazy" />
            </div>
          )}

          {/* Analyse IA rédigée */}
          {analysis && (
            <SectionCard icon={<Sparkles className="h-3.5 w-3.5" />} title="Analyse">
              <p className="text-[12px] leading-relaxed text-foreground/85">
                {deep.text ?? analysis.narrative}
              </p>
              {deep.error && (
                <p className="mt-2 text-[11px] text-destructive">{deep.error}</p>
              )}
              {!deep.text && (
                <button
                  onClick={deep.run}
                  disabled={deep.isLoading}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary disabled:opacity-60"
                >
                  {deep.isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Brain className="h-3.5 w-3.5" />
                  )}
                  Analyse IA approfondie
                </button>
              )}
              {/* Objectif (inféré / explicite) */}
              <div className="mt-3 border-t border-border pt-3">
                <button
                  onClick={() => setShowObjective((v) => !v)}
                  className="flex w-full items-center justify-between text-[11px] text-muted-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" />
                    Objectif : <span className="font-semibold text-foreground">{OBJECTIVE_LABELS[analysis.objective]}</span>
                    {!explicitObjective && <span className="text-muted-foreground/70">(auto)</span>}
                  </span>
                  <span className="text-primary">{showObjective ? "Fermer" : "Modifier"}</span>
                </button>
                {showObjective && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <ObjChip active={!explicitObjective} label="Auto" onClick={() => setObjective(null)} />
                    {OBJECTIVE_ORDER.map((o) => (
                      <ObjChip
                        key={o}
                        active={explicitObjective === o}
                        label={OBJECTIVE_LABELS[o]}
                        onClick={() => setObjective(o)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Toggle poids / volume / 1RM */}
          <div className="flex gap-1 rounded-xl bg-surface p-1">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {tabLabel[t]}
              </button>
            ))}
          </div>

          {/* Graphique */}
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} domain={["dataMin - 5", "dataMax + 5"]} width={32} />
                <Tooltip
                  contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [`${v} ${unit}`, tab === "weight" ? "Poids" : tab === "volume" ? "Volume" : "1RM est."]}
                />
                <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-primary)" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-6 text-center text-[11px] text-muted-foreground">Pas encore de données pour cette vue.</p>
          )}

          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-2">
            {tab === "weight" && pr != null && (
              <StatTileMini icon={<Trophy className="h-3 w-3 text-warning" />} label="PR" value={`${pr} kg`} highlight />
            )}
            {tab === "1rm" && bests.best1RM != null && (
              <StatTileMini icon={<Trophy className="h-3 w-3 text-warning" />} label="1RM max" value={`${bests.best1RM} kg`} highlight />
            )}
            {avg30 != null && <StatTileMini label="Moy. 30j" value={`${avg30.toFixed(1)} ${unit}`} />}
            {progression != null && (
              <StatTileMini
                icon={progression >= 0 ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-destructive" />}
                label="Prog."
                value={`${progression >= 0 ? "+" : ""}${progression.toFixed(1)}%`}
                valueClass={progression >= 0 ? "text-green-500" : "text-destructive"}
              />
            )}
          </div>

          {/* Comparaison aux séances précédentes */}
          {analysis && analysis.comparison.metrics.length > 0 && (
            <SectionCard icon={<Scale className="h-3.5 w-3.5" />} title="Évolution vs séance précédente">
              <div className="grid grid-cols-2 gap-2">
                {analysis.comparison.metrics.map((m) => (
                  <div key={m.key} className="rounded-xl bg-surface p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</span>
                      <TrendIcon trend={m.trend} />
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-sm font-bold">{m.current ?? "—"}</span>
                      {m.deltaPct != null && (
                        <span className={`text-[10px] font-semibold ${m.trend === "up" ? "text-green-500" : m.trend === "down" ? "text-destructive" : "text-muted-foreground"}`}>
                          {m.deltaPct >= 0 ? "+" : ""}{m.deltaPct}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {analysis.comparison.prsBroken.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {analysis.comparison.prsBroken.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-[10px] font-bold text-warning">
                      <Trophy className="h-3 w-3" /> {p}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11.5px] leading-relaxed text-foreground/80">{analysis.comparison.explanation}</p>
            </SectionCard>
          )}

          {/* Muscles par rôle */}
          {analysis && analysis.muscles.length > 0 && (
            <SectionCard icon={<Activity className="h-3.5 w-3.5" />} title="Muscles sollicités">
              <div className="space-y-3">
                {(["primary", "secondary", "stabilizer"] as MuscleRole[]).map((role) => {
                  const group = analysis.muscles.filter((m) => m.role === role);
                  if (group.length === 0) return null;
                  return (
                    <div key={role}>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {ROLE_LABELS[role]}
                      </p>
                      <div className="space-y-2">
                        {group.map((m) => <MuscleRow key={m.id} m={m} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Impact physique */}
          {analysis && analysis.physicalImpact.length > 0 && (
            <SectionCard icon={<Gauge className="h-3.5 w-3.5" />} title="Impact sur le physique">
              <div className="space-y-2">
                {analysis.physicalImpact.map((t) => (
                  <div key={t.trait}>
                    <div className="mb-0.5 flex items-center justify-between text-[11px]">
                      <span className="text-foreground/85">{t.label}</span>
                      <span className="font-semibold text-muted-foreground">{t.score}</span>
                    </div>
                    <Bar value={t.score} />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Recommandations */}
          {analysis && analysis.recommendations.length > 0 && (
            <SectionCard icon={<Target className="h-3.5 w-3.5" />} title="Recommandations">
              <div className="space-y-2.5">
                {analysis.recommendations.map((r, i) => (
                  <div key={i} className="rounded-xl bg-surface p-3">
                    <p className="text-[12px] font-semibold text-foreground">{r.text}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{r.rationale}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Déséquilibres */}
          {analysis && (
            <SectionCard icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Déséquilibres détectés">
              {analysis.imbalances.length === 0 ? (
                <p className="text-[11.5px] text-muted-foreground">Aucun déséquilibre majeur détecté à partir de tes données. 👍</p>
              ) : (
                <div className="space-y-2.5">
                  {analysis.imbalances.map((im, i) => (
                    <div key={i} className={`rounded-xl border-l-2 bg-surface p-3 ${im.severity === "alert" ? "border-destructive" : im.severity === "warning" ? "border-warning" : "border-primary"}`}>
                      <p className="text-[12px] font-medium text-foreground">{im.text}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{im.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* Détail des séries */}
          {hasReal && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Dumbbell className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Détail des séries</span>
              </div>
              <div className="space-y-2">
                {sessionsDesc.map((s) => {
                  const session = history?.find((h) => h.workoutId === s.workoutId);
                  return (
                    <div key={s.workoutId ?? s.date} className="rounded-xl border border-border bg-surface p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-semibold capitalize text-foreground">
                          {format(parseISO(s.date), "EEE d MMM yyyy", { locale: fr })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          {s.best1RM != null && <span className="text-[10px] font-medium text-muted-foreground">1RM {s.best1RM} kg</span>}
                          {s.isPR1RM && <Trophy className="h-3 w-3 text-warning" aria-label="Record" />}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(session?.sets ?? []).map((row, idx) => (
                          <span key={idx} className="rounded-lg bg-card px-2 py-1 text-[10px] font-medium text-foreground/80">
                            {row.reps ?? "—"}×{row.weight ?? "—"}<span className="text-muted-foreground/70"> kg</span>
                          </span>
                        ))}
                      </div>
                      <div className="mt-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/60">Tonnage {formatTonnage(s.tonnage)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StarRating({ stars }: { stars: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= stars ? "fill-warning text-warning" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
  if (trend === "flat") return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground/40" />;
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/5">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

function MuscleRow({ m }: { m: MuscleContribution }) {
  const c = RECOVERY_COLORS[m.recovery];
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-[11.5px] text-foreground/85">{m.label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-primary" style={{ width: `${m.solicitation}%` }} />
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold"
        style={{ color: c.stroke, background: c.fill }}
      >
        {RECOVERY_LABELS[m.recovery]}
      </span>
    </div>
  );
}

function StatTileMini({
  icon,
  label,
  value,
  highlight,
  valueClass,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={`rounded-xl p-3 text-center ${highlight ? "bg-warning/10" : "bg-surface"}`}>
      <div className="mb-1 flex items-center justify-center gap-1">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className={`text-sm font-bold ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}

function ObjChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}
