import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Apple,
  Award,
  CheckCircle,
  Crown,
  Dumbbell,
  Flame,
  Shield,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { useUserStats } from "@/hooks/useUserStats";
import { useBadgeSystem } from "@/hooks/useBadgeSystem";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RARITY_BG,
  RARITY_BORDER,
  RARITY_COLORS,
  RARITY_LABELS,
  RARITY_PROGRESS,
  RARITY_TEXT,
  type BadgeRarity,
} from "@/lib/fitness/badges";
import { cn } from "@/lib/utils";

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Award,
  Star,
  Trophy,
  Zap,
  Flame,
  Crown,
  Dumbbell,
  Shield,
  Target,
  Apple,
  CheckCircle,
  Activity,
};

// ─── Badge card ───────────────────────────────────────────────────────────────

function BadgeCard({
  catalog,
  isUnlocked,
  unlockedAt,
  progress,
  index,
}: {
  catalog: {
    badge_key: string;
    label: string;
    description: string;
    icon: string;
    rarity: string;
    xp_reward: number;
    requirement_value: number;
  };
  isUnlocked: boolean;
  unlockedAt?: string;
  progress: number;
  index: number;
}) {
  const rarity = catalog.rarity as BadgeRarity;
  const Icon = ICON_MAP[catalog.icon] ?? Award;
  const rarityColor = RARITY_COLORS[rarity];
  const rarityBg = RARITY_BG[rarity];
  const rarityBorder = RARITY_BORDER[rarity];
  const rarityText = RARITY_TEXT[rarity];
  const rarityProgress = RARITY_PROGRESS[rarity];
  const rarityLabel = RARITY_LABELS[rarity];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 260, damping: 28 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-3.5 transition-shadow",
        isUnlocked
          ? cn(rarityBorder, "shadow-md")
          : "border-white/[0.05] bg-white/[0.02]",
        isUnlocked && "bg-gradient-to-br",
        isUnlocked && rarityBg,
      )}
      style={
        isUnlocked
          ? {
              boxShadow: `0 4px 24px -4px ${rarityColor}22, 0 1px 2px rgba(0,0,0,0.3)`,
            }
          : undefined
      }
    >
      {/* Locked overlay line */}
      {!isUnlocked && (
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
      )}

      {/* Top glow line for unlocked */}
      {isUnlocked && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${rarityColor}60, transparent)`,
          }}
        />
      )}

      <div className="relative flex flex-col gap-2.5">
        {/* Icon + rarity row */}
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              isUnlocked ? `bg-gradient-to-br ${rarityBg}` : "bg-white/[0.05]",
            )}
            style={
              isUnlocked
                ? { boxShadow: `0 0 12px ${rarityColor}30` }
                : undefined
            }
          >
            <Icon
              className={cn(
                "h-5 w-5 transition-opacity",
                isUnlocked ? rarityText : "text-white/20",
              )}
            />
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
              isUnlocked
                ? cn(`bg-gradient-to-br ${rarityBg}`, rarityText)
                : "bg-white/[0.06] text-white/20",
            )}
          >
            {rarityLabel}
          </span>
        </div>

        {/* Label & description */}
        <div>
          <p
            className={cn(
              "text-[13px] font-bold leading-tight",
              isUnlocked ? "text-white/90" : "text-white/25",
            )}
          >
            {catalog.label}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[11px] leading-snug",
              isUnlocked ? "text-white/50" : "text-white/18",
            )}
          >
            {catalog.description}
          </p>
        </div>

        {/* Progress bar (locked only) or unlocked info */}
        {isUnlocked ? (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-400/80">
              +{catalog.xp_reward} XP
            </span>
            {unlockedAt && (
              <span className="text-[9px] text-white/30">
                {new Date(unlockedAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                })}
              </span>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-amber-400/50">
                +{catalog.xp_reward} XP
              </span>
              <span className="text-[10px] font-bold tabular-nums text-white/25">
                {progress}%
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className={cn("h-full rounded-full bg-gradient-to-r opacity-40", rarityProgress)}
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut", delay: 0.2 + index * 0.04 }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BadgesStrip() {
  const { data: stats } = useUserStats();
  const { badgesWithProgress, isLoading } = useBadgeSystem();

  const xp = stats?.xp ?? 0;
  const level = stats?.level ?? 1;
  const nextLevelXp = level * level * 50;
  const pct = Math.min(100, Math.round((xp / nextLevelXp) * 100));

  // Sort: unlocked first (newest), then locked by progress desc
  const sorted = useMemo(() => {
    const unlocked = badgesWithProgress
      .filter((b) => b.isUnlocked)
      .sort(
        (a, b) =>
          new Date(b.unlockedAt ?? 0).getTime() -
          new Date(a.unlockedAt ?? 0).getTime(),
      );
    const locked = badgesWithProgress
      .filter((b) => !b.isUnlocked)
      .sort((a, b) => b.progress - a.progress);
    return [...unlocked, ...locked];
  }, [badgesWithProgress]);

  const unlockedCount = badgesWithProgress.filter((b) => b.isUnlocked).length;

  return (
    <section className="mb-6">
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between px-0.5">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Badges & Succès
          </h2>
          {!isLoading && badgesWithProgress.length > 0 && (
            <p className="text-[10px] text-muted-foreground/50">
              {unlockedCount} / {badgesWithProgress.length} débloqués
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-amber-400/70" />
          <span className="text-xs font-bold text-amber-400">Niv. {level}</span>
        </div>
      </div>

      {/* XP bar card */}
      <div className="mb-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-orange-500/10">
              <Trophy className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-bold">Niveau {level}</div>
              <div className="text-[10px] text-muted-foreground/60">
                {xp.toLocaleString()} / {nextLevelXp.toLocaleString()} XP
              </div>
            </div>
          </div>
          <span className="text-xs font-bold tabular-nums text-amber-400">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
            initial={{ width: "0%" }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Badge grid */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && sorted.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-8 text-center">
          <Award className="mx-auto mb-2 h-6 w-6 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground/60">
            Aucun badge disponible
          </p>
          <p className="mt-1 text-xs text-muted-foreground/40">
            Continuez vos entraînements pour débloquer des badges
          </p>
        </div>
      )}

      <AnimatePresence>
        {!isLoading && sorted.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {sorted.map((b, i) => (
              <BadgeCard
                key={b.catalog.badge_key}
                catalog={b.catalog}
                isUnlocked={b.isUnlocked}
                unlockedAt={b.unlockedAt}
                progress={b.progress}
                index={i}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
