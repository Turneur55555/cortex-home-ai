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
import { useBadgeHighlights } from "@/hooks/useBadgeHighlights";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { BadgeUnlockOverlay } from "@/components/profile/BadgeUnlockOverlay";
import { BadgeMedallion } from "@/components/profile/BadgeMedallion";
import {
  CATEGORY_EMOJI,
  CATEGORY_LABELS,
  RARITY_BG,
  RARITY_BORDER,
  RARITY_COLORS,
  RARITY_LABELS,
  RARITY_PROGRESS,
  RARITY_TEXT,
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
          : isSecret || isComingSoon
            ? "border-white/[0.05] bg-white/[0.02]"
            // Verrouillé mais visible : on garde un liseré teinté par la rareté
            // pour que le badge donne envie d'être débloqué (demande explicite).
            : cn(rarityBorder, "bg-white/[0.025]"),
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
          <BadgeMedallion
            rarity={rarity}
            icon={Icon}
            unlocked={isUnlocked}
            isSecret={isSecret}
            isComingSoon={isComingSoon}
            size={48}
            animated={false}
          />
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
              isUnlocked
                ? cn("bg-gradient-to-br", rarityBg, rarityText)
                : isSecret || isComingSoon
                  ? "bg-white/[0.06] text-white/25"
                  : cn("bg-white/[0.04]", rarityText, "opacity-60"),
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

  const {
    unlocked,
    unlockedCount,
    total,
    completionPct,
    nextObjective,
  } = useBadgeHighlights();

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

  // Nombre de badges possédés par rareté — fait "sauter aux yeux" la rareté
  // dès l'entrée dans la section (demande explicite : sensation de collection).
  const rarityCounts = useMemo(() => {
    const counts: Record<BadgeRarity, { owned: number; total: number }> = {
      common: { owned: 0, total: 0 },
      rare: { owned: 0, total: 0 },
      epic: { owned: 0, total: 0 },
      legendary: { owned: 0, total: 0 },
      mythic: { owned: 0, total: 0 },
    };
    for (const b of badgesWithProgress) {
      const r = b.catalog.rarity as BadgeRarity;
      counts[r].total += 1;
      if (b.isUnlocked) counts[r].owned += 1;
    }
    return counts;
  }, [badgesWithProgress]);

  // Progression par catégorie — mise en valeur des catégories (demande explicite).
  const categoryOverview = useMemo(() => {
    const map = new Map<BadgeCategory, { owned: number; total: number }>();
    for (const b of badgesWithProgress) {
      const cat = (b.catalog.category as BadgeCategory) ?? "training";
      if (!map.has(cat)) map.set(cat, { owned: 0, total: 0 });
      const entry = map.get(cat)!;
      entry.total += 1;
      if (b.isUnlocked) entry.owned += 1;
    }
    const order: BadgeCategory[] = [
      "first_steps", "training", "consistency", "strength", "progression",
      "duration", "cardio", "nutrition", "transformation", "health",
      "challenges", "journal", "community", "secret",
    ];
    return order.filter((c) => map.has(c)).map((c) => [c, map.get(c)!] as const);
  }, [badgesWithProgress]);

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
      {/* ─── Hero banner : vitrine de la collection ─── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-4 shadow-xl">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />

        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/40">
              Salle des trophées
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-serif text-4xl font-black leading-none text-white">
                {unlockedCount}
              </span>
              <span className="text-sm font-semibold text-white/40">/ {total} succès</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-2xl font-black tabular-nums text-amber-400">{completionPct}%</span>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/30">complété</p>
          </div>
        </div>

        {/* Répartition par rareté — la rareté saute aux yeux immédiatement */}
        <div className="relative mt-3 grid grid-cols-5 gap-1.5">
          {(["common", "rare", "epic", "legendary", "mythic"] as BadgeRarity[]).map((r) => {
            const c = rarityCounts[r];
            const owned = c.owned > 0;
            return (
              <div
                key={r}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl border py-2",
                  owned ? cn("bg-gradient-to-b", RARITY_BG[r], RARITY_BORDER[r]) : "border-white/[0.05] bg-white/[0.02]",
                )}
              >
                <span className={cn("text-sm font-black tabular-nums", owned ? RARITY_TEXT[r] : "text-white/20")}>
                  {c.owned}
                </span>
                <span className="text-[7.5px] font-bold uppercase tracking-wider text-white/35">
                  {RARITY_LABELS[r]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Catégories — navigation rapide vers la collection */}
        <div className="relative mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
          {categoryOverview.map(([cat, c]) => (
            <button
              key={cat}
              type="button"
              onClick={() =>
                document
                  .getElementById(`badge-category-${cat}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 transition-colors hover:border-white/[0.15]"
            >
              <span className="text-sm leading-none">{CATEGORY_EMOJI[cat]}</span>
              <span className="text-[10px] font-semibold text-white/70">{CATEGORY_LABELS[cat]}</span>
              <span className="text-[9px] font-bold text-white/35">
                {c.owned}/{c.total}
              </span>
            </button>
          ))}
        </div>

        {/* Prochain succès accessible — donne envie de continuer */}
        {nextObjective && (
          <div className="relative mt-3">
            <HighlightRow
              icon={<Target className="h-3.5 w-3.5" />}
              label={`Prochain succès (${nextObjective.progress}%)`}
              title={nextObjective.catalog.label}
              rarity={nextObjective.catalog.rarity as BadgeRarity}
            />
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
            {groups.map(([cat, list]) => {
              const catOwned = list.filter((b) => b.isUnlocked).length;
              const catPct = list.length > 0 ? Math.round((catOwned / list.length) * 100) : 0;
              return (
              <div key={cat} id={`badge-category-${cat}`} className="scroll-mt-4">
                <div className="mb-2.5 flex items-center justify-between gap-2 border-l-2 border-primary/40 pl-2.5">
                  <h3 className="flex items-center gap-2 text-[13px] font-bold text-white/90">
                    <span className="text-lg leading-none">{CATEGORY_EMOJI[cat]}</span>
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="h-1 w-10 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${catPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold tabular-nums text-white/40">
                      {catOwned}/{list.length}
                    </span>
                  </div>
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
              );
            })}
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

export function StatChip({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/[0.04]">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-0.5 text-sm font-black text-white/90 truncate">{value}</div>
      {hint && <div className="text-[9px] text-white/40 truncate">{hint}</div>}
    </div>
  );
}

export function HighlightRow({
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
