// ============================================================
// Répartition par discipline (Phase 8) — première brique visible du
// principe "chaque discipline est un citoyen de première classe" côté
// Profil. Purement factuel (séances/durée/dernière fois par discipline,
// via computeDisciplineBreakdown, lib pure) — PAS de rang, records ou
// recommandations par discipline ici : Nathan a explicité que ça viendra
// "plus tard", volontairement hors scope de cette carte.
// ============================================================

import { useWorkouts } from "@/hooks/use-fitness";
import { computeDisciplineBreakdown } from "@/lib/fitness/engines/disciplineBreakdown";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { DisciplineBadge } from "@/components/fitness/session/DisciplineIcon";

function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr + "T00:00:00").getTime()) / 86_400_000);
  if (diff <= 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  return `il y a ${diff}j`;
}

function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  return `${(totalMinutes / 60).toFixed(1)} h`;
}

export function DisciplineBreakdownCard() {
  const { data: workouts, isLoading } = useWorkouts();
  const breakdown = computeDisciplineBreakdown(workouts);

  if (isLoading || breakdown.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Répartition par discipline
        </h2>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-3.5 shadow-card">
        {breakdown.map((entry) => {
          const engine = ENGINE_REGISTRY[entry.discipline];
          return (
            <div
              key={entry.discipline}
              className="flex items-center justify-between gap-3 rounded-xl px-1 py-1.5"
            >
              <DisciplineBadge
                icon={engine.icon}
                label={engine.label}
                accentClassName={engine.accentClassName}
              />
              <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {entry.sessionsCount} séance{entry.sessionsCount > 1 ? "s" : ""}
                </span>
                <span>· {formatDuration(entry.totalDurationMinutes)}</span>
                {entry.lastSessionDate && <span>· {daysAgo(entry.lastSessionDate)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
