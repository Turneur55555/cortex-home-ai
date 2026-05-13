import { useState, useMemo } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import { computeRecovery, STATUS_COLORS, STATUS_LABELS, type MuscleRecovery, type RecoveryStatus } from "@/lib/fitness/recovery";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import { FrontView } from "./muscles/front";
import { BackView } from "./muscles/back";
import { Loader2 } from "lucide-react";

export function MuscleMap() {
  const { data: workouts, isLoading } = useWorkouts();
  const [active, setActive] = useState<MuscleId | null>(null);

  const recoveryMap = useMemo(() => {
    if (!workouts) return new Map<MuscleId, MuscleRecovery>();
    const mapped = workouts.map((w) => ({
      date: w.date,
      exercises: w.exercises?.map((ex) => ({ name: ex.name })) ?? null,
    }));
    return computeRecovery(mapped);
  }, [workouts]);

  const getColor = (id: MuscleId): string => {
    const r = recoveryMap.get(id);
    if (!r) return STATUS_COLORS.unknown;
    return STATUS_COLORS[r.status];
  };

  const activeInfo = active ? recoveryMap.get(active) : null;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Récupération musculaire</h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          basé sur vos séances
        </span>
      </div>

      {/* Silhouettes */}
      <div
        className="relative mx-auto flex max-h-[320px] justify-center gap-2"
        onMouseLeave={() => setActive(null)}
      >
        <div className="flex flex-col items-center">
          <span className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Face
          </span>
          <div className="h-[280px] w-[120px]">
            <FrontView getColor={getColor} onMuscle={setActive} activeMuscle={active} />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Dos
          </span>
          <div className="h-[280px] w-[120px]">
            <BackView getColor={getColor} onMuscle={setActive} activeMuscle={active} />
          </div>
        </div>
      </div>

      {/* Tooltip */}
      <div className="mt-3 min-h-[44px]">
        {activeInfo ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[activeInfo.status] }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">{activeInfo.label}</p>
              <p className="text-[10px] text-muted-foreground">
                {activeInfo.status === "unknown"
                  ? "Aucune donnée récente"
                  : activeInfo.hoursSinceLast != null
                    ? `${STATUS_LABELS[activeInfo.status]} · dernière séance il y a ${formatHours(activeInfo.hoursSinceLast)}`
                    : STATUS_LABELS[activeInfo.status]}
                {activeInfo.hoursRemaining != null && activeInfo.hoursRemaining > 0 && (
                  <> · encore {formatHours(activeInfo.hoursRemaining)} de récup</>
                )}
              </p>
            </div>
          </div>
        ) : (
          <p className="py-2 text-center text-[10px] text-muted-foreground">
            Touchez un muscle pour voir son état
          </p>
        )}
      </div>

      {/* Légende */}
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {(["fatigued", "recovering", "ready", "unknown"] as RecoveryStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[s] }}
            />
            <span className="text-[10px] text-muted-foreground">{STATUS_LABELS[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return "<1h";
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}j`;
}
