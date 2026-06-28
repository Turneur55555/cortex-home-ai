import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { ActiveWorkout } from "@/hooks/use-fitness";
import { estimate1RM, workoutTonnage, formatTonnage } from "@/lib/fitness/strength";

// ── Confetti CSS ──────────────────────────────────────────────────────────────
const CONFETTI_STYLE = `
@keyframes confettiBurst {
  0%   { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translateY(-70vh) rotate(720deg) scale(0.4); opacity: 0; }
}
`;

const COLORS = ["#6c63ff", "#f59e0b", "#22c55e", "#ec4899", "#06b6d4", "#f97316"];

function Confetti() {
  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        left: `${5 + (i * 3.9) % 92}%`,
        color: COLORS[i % COLORS.length],
        delay: `${(i * 0.04).toFixed(2)}s`,
        duration: `${(0.8 + (i % 5) * 0.22).toFixed(2)}s`,
        size: 5 + (i % 4) * 2,
        shape: i % 3 === 0 ? "2px" : "50%",
      })),
    [],
  );

  return (
    <>
      <style>{CONFETTI_STYLE}</style>
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            style={{
              position: "absolute",
              bottom: "30%",
              left: p.left,
              width: p.size,
              height: p.size,
              borderRadius: p.shape,
              background: p.color,
              animation: `confettiBurst ${p.duration} ${p.delay} ease-out forwards`,
            }}
          />
        ))}
      </div>
    </>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold leading-none">{value}</p>
      {sub && (
        <p className="mt-0.5 truncate text-[9px] text-muted-foreground/60">{sub}</p>
      )}
    </div>
  );
}

// ── Main overlay ──────────────────────────────────────────────────────────────

export function WorkoutSummaryOverlay({
  workout,
  onConfirm,
  onCancel,
  isPending,
}: {
  workout: ActiveWorkout;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const durationMin = Math.max(
    1,
    Math.round((Date.now() - new Date(workout.created_at).getTime()) / 60_000),
  );

  const allSets = (workout.exercises ?? []).flatMap((ex) => ex.exercise_sets ?? []);
  const completedSets = allSets.filter((s) => s.completed).length;
  const tonnage = workoutTonnage(workout.exercises ?? []);

  const top1RM = useMemo(() => {
    let best: { name: string; value: number } | null = null;
    for (const ex of workout.exercises ?? []) {
      for (const s of ex.exercise_sets ?? []) {
        const e = estimate1RM(s.weight, s.reps);
        if (e != null && e > (best?.value ?? 0)) best = { name: ex.name, value: e };
      }
    }
    return best;
  }, [workout]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-safe-or-6">
      <Confetti />

      <div className="w-full max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300 rounded-3xl border border-white/8 bg-card shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)] p-6">
        {/* Header */}
        <div className="text-center">
          <div className="text-5xl">💪</div>
          <h2 className="mt-3 text-xl font-bold tracking-tight">Séance terminée !</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{workout.name}</p>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <StatTile label="Durée" value={`${durationMin} min`} />
          <StatTile
            label="Séries"
            value={`${completedSets}`}
            sub={allSets.length > completedSets ? `${allSets.length - completedSets} non validées` : "toutes validées"}
          />
          <StatTile label="Tonnage" value={formatTonnage(tonnage)} />
          {top1RM ? (
            <StatTile
              label="Meilleur 1RM"
              value={`${Math.round(top1RM.value)} kg`}
              sub={top1RM.name}
            />
          ) : (
            <StatTile label="Exercices" value={`${(workout.exercises ?? []).length}`} />
          )}
        </div>

        {/* CTAs */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Continuer
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 rounded-xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Clore 🏆"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
