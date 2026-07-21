import { Swords } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp, nextGradeLabel } from "@/lib/fitness/rpg/titleProgress";

/**
 * Progression RPG — UNE seule information : "Plus que X XP avant [grade]".
 * Barre de progression + texte. Ni Titre, ni Grade, ni XP actuelle : tout cela
 * est déjà visible sur la carte principale. Aucune duplication.
 *
 * Source unique : `titleProgress` (moteur pilotée par l'XP globale
 * uniquement, `user_stats.xp`) — plus de mélange avec le Rang par exercice.
 */
export function RPGProgressionSection() {
  const { data: userStats, isLoading } = useUserStats();
  const progress = titleProgressForXp(userStats?.xp ?? 0);
  const nextGrade = nextGradeLabel(progress);

  const percent = progress.isMax
    ? 100
    : ((progress.xp - progress.xpCurrentThreshold) /
        Math.max(
          1,
          (progress.xpNextThreshold ?? progress.xpCurrentThreshold) - progress.xpCurrentThreshold,
        )) *
      100;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Swords className="h-3 w-3 text-muted-foreground" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Progression RPG
        </h2>
      </div>

      {isLoading && <Skeleton className="h-28 w-full rounded-2xl" />}

      {!isLoading && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="mb-3 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Grade actuel
            </div>
            <div className="text-sm font-black uppercase tracking-wider text-white/90">
              {progress.grade}
            </div>
          </div>

          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${percent}%`,
                background: progress.title.colors.gradient,
              }}
            />
          </div>

          <p className="mt-2.5 text-center text-[12px] font-semibold text-white/80">
            {progress.isMax || !nextGrade ? (
              "Grade suprême atteint"
            ) : (
              <>
                Plus que{" "}
                <span className="font-black" style={{ color: progress.title.colors.secondary }}>
                  {progress.xpToNext} XP
                </span>{" "}
                avant{" "}
                <span
                  className="font-black uppercase tracking-wider"
                  style={{ color: progress.title.colors.secondary }}
                >
                  {nextGrade}
                </span>
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
