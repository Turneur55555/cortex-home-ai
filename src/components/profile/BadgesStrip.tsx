import { Award, Sparkles, Star, Trophy, Zap } from "lucide-react";
import { useUserBadges } from "@/hooks/useUserBadges";
import { useUserStats } from "@/hooks/useUserStats";
import { Skeleton } from "@/components/ui/skeleton";

const ICONS: Record<string, typeof Award> = { Award, Star, Trophy, Zap, Sparkles };

export function BadgesStrip() {
  const { data: badges, isLoading } = useUserBadges(5);
  const { data: stats } = useUserStats();

  const xp = stats?.xp ?? 0;
  const level = stats?.level ?? 1;
  const nextLevelXp = level * level * 50;
  const pct = Math.min(100, Math.round((xp / nextLevelXp) * 100));

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Badges & succès</h2>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/30 to-orange-500/20">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
            </span>
            <div>
              <div className="font-semibold">Niveau {level}</div>
              <div className="text-[10px] text-muted-foreground">{xp} / {nextLevelXp} XP</div>
            </div>
          </div>
          <span className="text-[10px] font-semibold tabular-nums">{pct}%</span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-14 shrink-0 rounded-xl" />)}
          {!isLoading && badges?.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">Continuez vos actions pour débloquer vos premiers badges</p>
          )}
          {badges?.map((b) => {
            const Icon = ICONS[b.icon] ?? Award;
            return (
              <div key={b.id} className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10" title={b.label}>
                <Icon className="h-4 w-4 text-violet-300" />
                <span className="max-w-[3.2rem] truncate text-[8px] text-muted-foreground">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
