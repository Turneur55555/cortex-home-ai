import { Swords } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp, nextGradeLabel } from "@/lib/fitness/rpg/titleProgress";
import { formatXp } from "@/lib/fitness/rpg/grade";

/**
 * Progression RPG — la référence pour tout ce qui concerne les grades.
 * Hiérarchie : Grade actuel (petit libellé gris) → nom du grade (blanc,
 * proéminent) → barre de progression → "Plus que X XP avant [grade]".
 * Seuls l'XP restante et le prochain grade utilisent la couleur dorée.
 *
 * Source unique : `titleProgress` (moteur piloté par l'XP globale
 * uniquement, `user_stats.xp`) — jamais le Rang par exercice.
 */
export function RPGProgressionSection() {
  const { data: userStats, isLoading } = useUserStats();
  const progress = titleProgressForXp(userStats?.xp ?? 0);
  const currentGrade = progress.grade;
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
          {/* Grade actuel — libellé discret + nom proéminent */}
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Grade actuel
            </p>
            <p className="mt-1 text-[15px] font-black uppercase tracking-[0.1em] text-white">
              {currentGrade}
            </p>
          </div>

          {/* Barre de progression */}
          <div
            className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
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

          {/* XP restante avant le prochain grade */}
          <p className="mt-2.5 text-center text-[12px] font-semibold text-white/80">
            {progress.isMax || !nextGrade ? (
              "Grade suprême atteint"
            ) : (
              <>
                Plus que{" "}
                <span className="font-black" style={{ color: progress.title.colors.secondary }}>
                  {formatXp(progress.xpToNext)} XP
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
