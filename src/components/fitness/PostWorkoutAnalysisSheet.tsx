import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Heart,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ActiveWorkout } from "@/hooks/use-fitness";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import { exerciseToMuscles } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkoutAnalysis = {
  summary: {
    headline: string;
    tonnage_comment: string;
    duration_comment?: string;
  };
  muscles: {
    trained: string[];
    balance_comment: string;
    overloaded?: string[];
  };
  performance: {
    prs?: Array<{ exercise: string; detail: string }>;
    intensity_comment: string;
    progression_comment?: string;
  };
  recovery: {
    rest_hours: number;
    priority_muscles: string[];
    recovery_tip: string;
    overtraining_risk: "low" | "medium" | "high";
  };
  next_session: {
    recommended_muscles: string[];
    session_type: string;
    load_adjustment?: string;
    timing: string;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(risk: "low" | "medium" | "high") {
  return risk === "low"
    ? "text-green-400 bg-green-500/10"
    : risk === "medium"
    ? "text-amber-400 bg-amber-500/10"
    : "text-red-400 bg-red-500/10";
}

function riskLabel(risk: "low" | "medium" | "high") {
  return risk === "low" ? "Faible" : risk === "medium" ? "Modéré" : "Élevé";
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  workout: ActiveWorkout;
  workoutId: string;
  previousWorkouts?: Array<{
    date: string;
    name: string;
    exercises?: Array<{ name: string; weight: number | null; reps: number | null }> | null;
  }>;
  recoveryMap?: Map<MuscleId, MuscleRecovery>;
  onClose: () => void;
}

export function PostWorkoutAnalysisSheet({
  workout,
  workoutId,
  previousWorkouts = [],
  recoveryMap,
  onClose,
}: Props) {
  const [analysis, setAnalysis] = useState<WorkoutAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    (async () => {
      try {
        // Build recovery map payload
        const recoveryPayload: Record<string, { status: string; hoursRemaining: number | null }> = {};
        if (recoveryMap) {
          for (const [id, rec] of recoveryMap.entries()) {
            recoveryPayload[id] = { status: rec.status, hoursRemaining: rec.hoursRemaining };
          }
        }

        // Build exercise summaries with muscle groups
        const exercises = (workout.exercises ?? []).map((ex) => {
          const muscles = exerciseToMuscles(ex.name);
          return {
            name: ex.name,
            muscles,
            sets: (ex.exercise_sets ?? []).map((s) => ({
              reps: s.reps,
              weight: s.weight,
              completed: s.completed,
            })),
          };
        });

        const durationMin = Math.max(
          1,
          Math.round((Date.now() - new Date(workout.created_at).getTime()) / 60_000),
        );

        const { data, error: fnErr } = await supabase.functions.invoke("analyze-workout", {
          body: {
            workout_id: workoutId,
            workout: {
              name: workout.name,
              duration_minutes: durationMin,
              exercises,
            },
            history: previousWorkouts.slice(0, 8).map((w) => ({
              date: w.date,
              name: w.name,
              exercises: (w.exercises ?? []).map((ex) => ({
                name: ex.name,
                weight: ex.weight,
                reps: ex.reps,
              })),
            })),
            recovery_map: recoveryPayload,
          },
        });

        if (fnErr) throw new Error(fnErr.message);
        setAnalysis(data as WorkoutAnalysis);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur d'analyse");
      } finally {
        setLoading(false);
      }
    })();
  }, [workout, workoutId, previousWorkouts, recoveryMap]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex h-[92vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card shadow-elevated animate-in slide-in-from-bottom-4 duration-300">
        {/* Handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="shrink-0 px-5 pb-3 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-bold">Analyse IA</h2>
                <p className="text-xs text-muted-foreground">{workout.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="relative">
                <Brain className="h-10 w-10 text-primary/40" />
                <Loader2 className="absolute -right-2 -top-2 h-5 w-5 animate-spin text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Analyse en cours…</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  L'IA analyse tes performances
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive/60" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium"
              >
                Fermer
              </button>
            </div>
          )}

          {analysis && !loading && (
            <div className="flex flex-col gap-3">
              {/* ── 1. Bilan ── */}
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
                <p className="text-sm font-bold leading-snug">{analysis.summary.headline}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {analysis.summary.tonnage_comment}
                </p>
                {analysis.summary.duration_comment && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {analysis.summary.duration_comment}
                  </p>
                )}
              </div>

              {/* ── 2. Muscles ── */}
              <SectionCard icon={<Dumbbell className="h-4 w-4" />} title="Muscles travaillés">
                {analysis.muscles.trained.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {analysis.muscles.trained.map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{analysis.muscles.balance_comment}</p>
                {analysis.muscles.overloaded && analysis.muscles.overloaded.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                    <p className="text-xs text-amber-400">
                      Potentiellement sur-sollicités : {analysis.muscles.overloaded.join(", ")}
                    </p>
                  </div>
                )}
              </SectionCard>

              {/* ── 3. Performances ── */}
              <SectionCard icon={<TrendingUp className="h-4 w-4" />} title="Performances">
                {analysis.performance.prs && analysis.performance.prs.length > 0 && (
                  <div className="mb-3 flex flex-col gap-1.5">
                    {analysis.performance.prs.map((pr, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                        <div>
                          <p className="text-xs font-semibold">{pr.exercise}</p>
                          <p className="text-[11px] text-muted-foreground">{pr.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{analysis.performance.intensity_comment}</p>
                {analysis.performance.progression_comment && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {analysis.performance.progression_comment}
                  </p>
                )}
              </SectionCard>

              {/* ── 4. Récupération ── */}
              <SectionCard icon={<Heart className="h-4 w-4" />} title="Récupération">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{analysis.recovery.rest_hours}h</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Repos recommandé
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${riskColor(analysis.recovery.overtraining_risk)}`}
                  >
                    Surmenage : {riskLabel(analysis.recovery.overtraining_risk)}
                  </span>
                </div>

                {analysis.recovery.priority_muscles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {analysis.recovery.priority_muscles.map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
                  <p className="text-xs text-muted-foreground">{analysis.recovery.recovery_tip}</p>
                </div>
              </SectionCard>

              {/* ── 5. Prochaine séance ── */}
              <SectionCard icon={<Target className="h-4 w-4" />} title="Prochaine séance">
                <p className="mb-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{analysis.next_session.session_type}</span>
                  {" · "}
                  {analysis.next_session.timing}
                </p>
                {analysis.next_session.recommended_muscles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {analysis.next_session.recommended_muscles.map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
                {analysis.next_session.load_adjustment && (
                  <div className="flex items-center gap-1.5">
                    <ChevronRight className="h-3 w-3 text-primary" />
                    <p className="text-xs text-muted-foreground">
                      {analysis.next_session.load_adjustment}
                    </p>
                  </div>
                )}
              </SectionCard>

              {/* Fermer */}
              <button
                type="button"
                onClick={onClose}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow"
              >
                Fermer l'analyse
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
