import { useMemo } from "react";
import { Star, Swords, Sunrise } from "lucide-react";
import { useGoalsWithProgress } from "@/hooks/useGoalsWithProgress";
import { useActivityStreak } from "@/hooks/useActivityStreak";
import { GoalsManager } from "@/components/profile/GoalsManager";
import { StatChip } from "@/components/profile/shared";

/**
 * Quêtes — intégrées à la Progression RPG (demande explicite : plus de carte
 * indépendante). Réutilise `useGoalsWithProgress` et `<GoalsManager>` tels
 * quels (aucune logique de gestion des objectifs dupliquée) ; ajoute une
 * simple lecture "quête principale / secondaires / défi du jour" au-dessus,
 * dérivée des mêmes objectifs (aucun nouveau concept persisté côté serveur).
 */
export function QuestsPanel() {
  const { goals } = useGoalsWithProgress();
  const { current: streak } = useActivityStreak();

  const active = useMemo(() => goals.filter((g) => !g.is_completed), [goals]);

  const mainQuest = useMemo(() => {
    if (active.length === 0) return null;
    return [...active].sort((a, b) => b.progress - a.progress)[0];
  }, [active]);

  const secondaryQuests = useMemo(
    () => active.filter((g) => g.id !== mainQuest?.id),
    [active, mainQuest],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {mainQuest ? (
          <StatChip
            label="Quête principale"
            value={mainQuest.title}
            hint={`${mainQuest.progress}% complété`}
          />
        ) : (
          <StatChip label="Quête principale" value="Aucune" hint="Ajoute un objectif ci-dessous" />
        )}
        <StatChip
          label="Défi du jour"
          value={streak > 0 ? `Série de ${streak} j` : "Reprends ta série"}
          hint={streak > 0 ? "Continue aujourd'hui" : "Une activité aujourd'hui la relance"}
        />
      </div>

      {secondaryQuests.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.02] px-3 py-2 ring-1 ring-white/[0.04]">
          <Star className="h-3.5 w-3.5 shrink-0 text-white/40" />
          <p className="min-w-0 truncate text-[11px] text-white/60">
            {secondaryQuests.length} quête{secondaryQuests.length > 1 ? "s" : ""} secondaire
            {secondaryQuests.length > 1 ? "s" : ""} en cours
          </p>
        </div>
      )}

      <div className="mb-1.5 flex items-center gap-1.5 px-1 pt-1">
        <Swords className="h-3 w-3 text-muted-foreground" />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Toutes les quêtes
        </h3>
        <Sunrise className="ml-auto h-3 w-3 text-muted-foreground/50" />
      </div>
      <GoalsManager />
    </div>
  );
}
