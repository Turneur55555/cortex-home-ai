import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Flame, Swords, Target } from "lucide-react";
import { useGoalsWithProgress } from "@/hooks/useGoalsWithProgress";
import { useActivityStreak } from "@/hooks/useActivityStreak";

/**
 * Aperçu compact des Quêtes — répond à "Que dois-je faire ensuite ?" sans
 * réafficher la liste complète (rôle de l'écran `/quetes`, qui héberge le
 * `<GoalsManager>` existant tel quel). Réutilise `useGoalsWithProgress` /
 * `useActivityStreak` déjà utilisés ailleurs dans Profil — aucune nouvelle
 * requête, aucun nouveau concept persisté.
 */
export function QuestsPreview() {
  const { goals } = useGoalsWithProgress();
  const { current: streak } = useActivityStreak();

  const mainQuest = useMemo(() => {
    const active = goals.filter((g) => !g.is_completed);
    if (active.length === 0) return null;
    return [...active].sort((a, b) => b.progress - a.progress)[0];
  }, [goals]);

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Swords className="h-3 w-3 text-muted-foreground" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Quêtes
        </h2>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-4">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Target className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">
              Quête principale
            </p>
            <p className="truncate text-sm font-bold text-white/90">
              {mainQuest ? mainQuest.title : "Aucune quête active"}
            </p>
            {mainQuest && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${mainQuest.progress}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-white/50">
                  {mainQuest.progress}%
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-white/[0.02] px-3 py-2 ring-1 ring-white/[0.04]">
          <Flame className="h-3.5 w-3.5 shrink-0 text-orange-400" />
          <p className="min-w-0 truncate text-xs text-white/70">
            {streak > 0
              ? `Défi du jour : maintiens ta série de ${streak} j`
              : "Défi du jour : relance ta série aujourd'hui"}
          </p>
        </div>

        <Link
          to="/quetes"
          className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-white/[0.04] py-2.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/[0.08]"
        >
          Voir toutes les quêtes
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
