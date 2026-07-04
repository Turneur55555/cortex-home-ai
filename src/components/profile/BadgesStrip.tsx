import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Apple,
  Award,
  CheckCircle,
  Crown,
  Dumbbell,
  Flame,
  HelpCircle,
  Lock,
  Search,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { useUserStats } from "@/hooks/useUserStats";
import { useBadgeSystem } from "@/hooks/useBadgeSystem";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { BadgeUnlockOverlay } from "@/components/profile/BadgeUnlockOverlay";
import {
  CATEGORY_EMOJI,
  CATEGORY_LABELS,
  RARITY_BG,
  RARITY_BORDER,
  RARITY_COLORS,
  RARITY_LABELS,
  RARITY_PROGRESS,
  RARITY_RANK,
  RARITY_TEXT,
  xpForLevel,
  type BadgeCatalogEntry,
  type BadgeCategory,
  type BadgeRarity,
} from "@/lib/fitness/badges";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Award, Star, Trophy, Zap, Flame, Crown, Dumbbell, Shield, Target, Apple, CheckCircle, Activity,
};

type FilterKey =
  | "all"
  | "unlocked"
  | "locked"
  | "in_progress"
  | "common"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "unlocked", label: "Débloqués" },
  { key: "in_progress", label: "En cours" },
  { key: "locked", label: "Non débloqués" },
  { key: "common", label: "Commun" },
  { key: "rare", label: "Rare" },
  { key: "epic", label: "Épique" },
  { key: "legendary", label: "Légendaire" },
  { key: "mythic", label: "Mythique" },
];

// ─── Badge card ───────────────────────────────────────────────────────────────

function BadgeCard({
  catalog,
  isUnlocked,
  unlockedAt,
  progress,
  index,
}: {
  catalog: BadgeCatalogEntry;
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

  const isSecret = !!catalog.is_secret && !isUnlocked;
  const isComingSoon = !!catalog.is_coming_soon;

  const label = isSecret ? "Badge secret" : catalog.label;
  const description = isSecret
    ? catalog.secret_hint || "Continuez à progresser pour le débloquer."
    : catalog.description;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: Math.min(index * 0.03, 0.4), type: "spring", stiffness: 260, damping: 28 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-3.5 transition-shadow",
        isUnlocked
          ? cn(rarityBorder, "shadow-md bg-gradient-to-br", rarityBg)
          : "border-white/[0.05] bg-white/[0.02]",
        isComingSoon && "opacity-60",
      )}
      style={
        isUnlocked
          ? { boxShadow: `0 4px 24px -4px ${rarityColor}33, 0 1px 2px rgba(0,0,0,0.3)` }
          : undefined
      }
    >
      {/* Locked overlay */}
      {!isUnlocked && (
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
      )}

      {/* Rarity glow line */}
      {isUnlocked && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${rarityColor}80, transparent)` }}
        />
      )}

      {/* Mythic animated flame */}
      {isUnlocked && rarity === "mythic" && (
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background: `radial-gradient(circle at 50% 100%, ${rarityColor}60, transparent 70%)`,
          }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* "Unlocked" ribbon */}
      {isUnlocked && (
        <div
          className="absolute -right-8 top-2 rotate-45 px-8 py-0.5 text-[8px] font-black uppercase tracking-widest text-white shadow-md"
          style={{ background: `linear-gradient(135deg, ${rarityColor}, ${rarityColor}cc)` }}
        >
          Débloqué
        </div>
      )}

      <div className="relative flex flex-col gap-2.5">
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              isUnlocked ? cn("bg-gradient-to-br", rarityBg) : "bg-white/[0.05]",
            )}
            style={isUnlocked ? { boxShadow: `0 0 12px ${rarityColor}40` } : undefined}
          >
            {isSecret ? (
              <HelpCircle className="h-5 w-5 text-white/30" />
            ) : isComingSoon ? (
              <Lock className="h-5 w-5 text-white/30" />
            ) : (
              <Icon className={cn("h-5 w-5", isUnlocked ? rarityText : "text-white/25")} />
            )}
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
              isUnlocked ? cn("bg-gradient-to-br", rarityBg, rarityText) : "bg-white/[0.06] text-white/25",
            )}
          >
            {isSecret ? "???" : rarityLabel}
          </span>
        </div>

        <div>
          <p className={cn("text-[13px] font-bold leading-tight", isUnlocked ? "text-white/90" : "text-white/30")}>
            {label}
          </p>
          <p className={cn("mt-0.5 text-[11px] leading-snug", isUnlocked ? "text-white/55" : "text-white/25")}>
            {description}
          </p>
        </div>

        {isComingSoon ? (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Bientôt disponible
          </span>
        ) : isUnlocked ? (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-400/90">+{catalog.xp_reward} XP</span>
            {unlockedAt && (
              <span className="text-[9px] text-white/40">
                {new Date(unlockedAt).toLocaleDateString("fr-FR", {
                  day: "2-digit", month: "short", year: "2-digit",
                })}
              </span>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-amber-400/50">+{catalog.xp_reward} XP</span>
              <span className="text-[10px] font-bold tabular-nums text-white/30">{progress}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className={cn("h-full rounded-full bg-gradient-to-r opacity-70", rarityProgress)}
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
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

  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [unlockQueue, setUnlockQueue] = useState<BadgeCatalogEntry[]>([]);
  const seenKeysRef = useRef<Set<string> | null>(null);

  const xp = stats?.xp ?? 0;
  const level = stats?.level ?? 1;
  const nextLevelXp = xpForLevel(level + 1);
  const currentLevelXp = xpForLevel(level);
  const xpIntoLevel = Math.max(0, xp - currentLevelXp);
  const xpForNext = Math.max(1, nextLevelXp - currentLevelXp);
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100));

  const unlocked = useMemo(
    () => badgesWithProgress.filter((b) => b.isUnlocked),
    [badgesWithProgress],
  );
  const unlockedCount = unlocked.length;
  const total = badgesWithProgress.length;
  const completionPct = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

  // Detect newly unlocked badges → push to overlay queue
  useEffect(() => {
    const currentKeys = new Set(unlocked.map((b) => b.catalog.badge_key));
    if (seenKeysRef.current === null) {
      // First render: mark all as already seen (avoid replaying past unlocks)
      seenKeysRef.current = currentKeys;
      return;
    }
    const newlyUnlocked = unlocked.filter((b) => !seenKeysRef.current!.has(b.catalog.badge_key));
    if (newlyUnlocked.length > 0) {
      setUnlockQueue((q) => [...q, ...newlyUnlocked.map((b) => b.catalog)]);
    }
    seenKeysRef.current = currentKeys;
  }, [unlocked]);

  // Rarest unlocked + latest unlocked
  const rarestUnlocked = useMemo(() => {
    if (unlocked.length === 0) return null;
    return [...unlocked].sort(
      (a, b) => RARITY_RANK[b.catalog.rarity] - RARITY_RANK[a.catalog.rarity],
    )[0];
  }, [unlocked]);

  const latestUnlocked = useMemo(() => {
    if (unlocked.length === 0) return null;
    return [...unlocked].sort(
      (a, b) => new Date(b.unlockedAt ?? 0).getTime() - new Date(a.unlockedAt ?? 0).getTime(),
    )[0];
  }, [unlocked]);

  // Next objective: locked badge with highest progress (excluding secret & coming_soon)
  const nextObjective = useMemo(() => {
    const candidates = badgesWithProgress.filter(
      (b) => !b.isUnlocked && !b.catalog.is_secret && !b.catalog.is_coming_soon,
    );
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => b.progress - a.progress)[0];
  }, [badgesWithProgress]);

  // Top category
  const topCategory = useMemo(() => {
    const counts = new Map<BadgeCategory, number>();
    unlocked.forEach((b) => {
      const c = (b.catalog.category as BadgeCategory) ?? "training";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    });
    let top: [BadgeCategory, number] | null = null;
    for (const [k, v] of counts) {
      if (!top || v > top[1]) top = [k, v];
    }
    return top;
  }, [unlocked]);

  // Filter + search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return badgesWithProgress.filter((b) => {
      // Secret badges appear as "???" only when locked; user cannot search their name
      const searchable = b.catalog.is_secret && !b.isUnlocked ? "" : b.catalog.label.toLowerCase();
      if (q && !searchable.includes(q)) return false;
      switch (filter) {
        case "unlocked": return b.isUnlocked;
        case "locked": return !b.isUnlocked;
        case "in_progress": return !b.isUnlocked && b.progress > 0 && b.progress < 100;
        case "common":
        case "rare":
        case "epic":
        case "legendary":
        case "mythic":
          return b.catalog.rarity === filter;
        default:
          return true;
      }
    });
  }, [badgesWithProgress, filter, search]);

  // Group by category
  const groups = useMemo(() => {
    const map = new Map<BadgeCategory, typeof filtered>();
    for (const b of filtered) {
      const cat = (b.catalog.category as BadgeCategory) ?? "training";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(b);
    }
    // Sort inside groups: unlocked first, then by progress desc
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.isUnlocked !== b.isUnlocked) return a.isUnlocked ? -1 : 1;
        if (a.isUnlocked && b.isUnlocked) {
          return (
            new Date(b.unlockedAt ?? 0).getTime() - new Date(a.unlockedAt ?? 0).getTime()
          );
        }
        return b.progress - a.progress;
      });
    }
    // Category order
    const order: BadgeCategory[] = [
      "first_steps", "training", "consistency", "strength", "progression",
      "duration", "cardio", "nutrition", "transformation", "health",
      "challenges", "journal", "community", "secret",
    ];
    return order.filter((c) => map.has(c)).map((c) => [c, map.get(c)!] as const);
  }, [filtered]);

  const currentUnlock = unlockQueue[0] ?? null;

  return (
    <section className="mb-6">
      {/* ─── Hero banner ─── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-4 shadow-xl">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/30 to-orange-500/20"
            style={{ boxShadow: "0 0 24px rgba(251,191,36,0.35)" }}
          >
            <Crown className="h-7 w-7 text-amber-400" />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-black px-1.5 py-0.5 text-[9px] font-black text-amber-400 ring-1 ring-amber-400/60">
              {level}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/80">
                  Niveau {level}
                </div>
                <div className="text-xs text-white/50 tabular-nums">
                  {xpIntoLevel.toLocaleString()} / {xpForNext.toLocaleString()} XP
                </div>
              </div>
              <span className="text-lg font-black tabular-nums text-amber-400">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-300"
                initial={{ width: "0%" }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                style={{ boxShadow: "0 0 12px rgba(251,191,36,0.6)" }}
              />
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="relative mt-3 grid grid-cols-3 gap-2">
          <StatChip
            label="Complétion"
            value={`${completionPct}%`}
            hint={`${unlockedCount}/${total}`}
          />
          <StatChip
            label="XP total"
            value={xp.toLocaleString()}
            hint="points"
          />
          <StatChip
            label="Top catégorie"
            value={topCategory ? CATEGORY_EMOJI[topCategory[0]] : "—"}
            hint={topCategory ? CATEGORY_LABELS[topCategory[0]] : "aucune"}
          />
        </div>

        {/* Rarest + latest + next */}
        {(rarestUnlocked || latestUnlocked || nextObjective) && (
          <div className="relative mt-3 space-y-1.5">
            {rarestUnlocked && (
              <HighlightRow
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Plus rare obtenu"
                title={rarestUnlocked.catalog.label}
                rarity={rarestUnlocked.catalog.rarity as BadgeRarity}
              />
            )}
            {latestUnlocked && latestUnlocked.catalog.badge_key !== rarestUnlocked?.catalog.badge_key && (
              <HighlightRow
                icon={<Trophy className="h-3.5 w-3.5" />}
                label="Dernier débloqué"
                title={latestUnlocked.catalog.label}
                rarity={latestUnlocked.catalog.rarity as BadgeRarity}
              />
            )}
            {nextObjective && (
              <HighlightRow
                icon={<Target className="h-3.5 w-3.5" />}
                label={`Prochain (${nextObjective.progress}%)`}
                title={nextObjective.catalog.label}
                rarity={nextObjective.catalog.rarity as BadgeRarity}
              />
            )}
          </div>
        )}
      </div>

      {/* ─── Search + filters ─── */}
      <div className="mt-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un badge…"
            className="pl-9 rounded-full bg-white/[0.03] border-white/[0.06]"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all",
                filter === f.key
                  ? "bg-white text-black shadow-md"
                  : "bg-white/[0.05] text-white/60 hover:bg-white/[0.08]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Badge grid grouped by category ─── */}
      {isLoading && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-white/[0.08] p-8 text-center">
          <Award className="mx-auto mb-2 h-6 w-6 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground/60">Aucun badge</p>
          <p className="mt-1 text-xs text-muted-foreground/40">
            Essayez un autre filtre ou une autre recherche
          </p>
        </div>
      )}

      <AnimatePresence>
        {!isLoading && groups.length > 0 && (
          <div className="mt-4 space-y-5">
            {groups.map(([cat, list]) => (
              <div key={cat}>
                <div className="mb-2 flex items-center justify-between px-0.5">
                  <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
                    <span className="text-sm">{CATEGORY_EMOJI[cat]}</span>
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <span className="text-[10px] text-white/30">
                    {list.filter((b) => b.isUnlocked).length}/{list.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {list.map((b, i) => (
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
              </div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* ─── Unlock overlay ─── */}
      <BadgeUnlockOverlay
        badge={currentUnlock}
        onClose={() => setUnlockQueue((q) => q.slice(1))}
      />
    </section>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/[0.04]">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-0.5 text-sm font-black text-white/90 truncate">{value}</div>
      {hint && <div className="text-[9px] text-white/40 truncate">{hint}</div>}
    </div>
  );
}

function HighlightRow({
  icon,
  label,
  title,
  rarity,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  rarity: BadgeRarity;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-1.5 ring-1 ring-white/[0.04]">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("shrink-0", RARITY_TEXT[rarity])}>{icon}</span>
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
            {label}
          </div>
          <div className="text-[11px] font-bold text-white/85 truncate">{title}</div>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-gradient-to-br",
          RARITY_BG[rarity],
          RARITY_TEXT[rarity],
          RARITY_BORDER[rarity],
          "border",
        )}
      >
        {RARITY_LABELS[rarity]}
      </span>
    </div>
  );
}
