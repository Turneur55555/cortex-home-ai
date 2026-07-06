import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award, Search, Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { BadgeMedallion } from "@/components/profile/BadgeMedallion";
import { BadgeUnlockOverlay } from "@/components/profile/BadgeUnlockOverlay";
import { HighlightRow } from "@/components/profile/shared";
import { ACHIEVEMENT_ICON_MAP as ICON_MAP } from "@/components/profile/achievementIcons";
import { cn } from "@/lib/utils";
import {
  RARITY_BG,
  RARITY_BORDER,
  RARITY_COLORS,
  RARITY_LABELS,
  RARITY_PROGRESS,
  RARITY_TEXT,
  type BadgeCatalogEntry,
  type BadgeRarity,
} from "@/lib/fitness/badges";
import type { BadgeWithProgress } from "@/hooks/useBadgeSystem";
import {
  ACHIEVEMENT_CATEGORY_EMOJI,
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_CATEGORY_ORDER,
  type AchievementCategory,
} from "@/lib/profile/achievements/types";
import type { AchievementAggregate } from "@/lib/profile/achievements/evaluate";
import {
  buildAchievementCollection,
  type CollectionItem,
} from "@/lib/profile/achievements/collection";

type FilterKey = "all" | "unlocked" | "in_progress" | "locked" | BadgeRarity;

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

function CollectionCard({ item, index }: { item: CollectionItem; index: number }) {
  const { rarity, isUnlocked } = item;
  const Icon = ICON_MAP[item.icon] ?? Award;
  const isSecretHidden = item.isSecret && !isUnlocked;
  const label = isSecretHidden ? "Succès secret" : item.title;
  const description = isSecretHidden ? "Continue à progresser pour le révéler." : item.description;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: Math.min(index * 0.02, 0.4),
        type: "spring",
        stiffness: 260,
        damping: 28,
      }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-3.5 transition-shadow",
        isUnlocked
          ? cn(RARITY_BORDER[rarity], "shadow-md bg-gradient-to-br", RARITY_BG[rarity])
          : isSecretHidden || item.isComingSoon
            ? "border-white/[0.05] bg-white/[0.02]"
            : cn(RARITY_BORDER[rarity], "bg-white/[0.025]"),
        item.isComingSoon && "opacity-60",
      )}
      style={
        isUnlocked
          ? { boxShadow: `0 4px 24px -4px ${RARITY_COLORS[rarity]}33, 0 1px 2px rgba(0,0,0,0.3)` }
          : undefined
      }
    >
      {!isUnlocked && (
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
      )}
      {isUnlocked && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${RARITY_COLORS[rarity]}80, transparent)`,
          }}
        />
      )}
      <div className="relative flex flex-col gap-2.5">
        <div className="flex items-start justify-between">
          <BadgeMedallion
            rarity={rarity}
            icon={Icon}
            unlocked={isUnlocked}
            isSecret={isSecretHidden}
            isComingSoon={item.isComingSoon}
            size={48}
            animated={false}
          />
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
              isUnlocked
                ? cn("bg-gradient-to-br", RARITY_BG[rarity], RARITY_TEXT[rarity])
                : isSecretHidden || item.isComingSoon
                  ? "bg-white/[0.06] text-white/25"
                  : cn("bg-white/[0.04]", RARITY_TEXT[rarity], "opacity-60"),
            )}
          >
            {isSecretHidden ? "???" : RARITY_LABELS[rarity]}
          </span>
        </div>
        <div>
          <p
            className={cn(
              "text-[13px] font-bold leading-tight",
              isUnlocked ? "text-white/90" : "text-white/30",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[11px] leading-snug",
              isUnlocked ? "text-white/55" : "text-white/25",
            )}
          >
            {description}
          </p>
        </div>
        {item.isComingSoon ? (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Bientôt disponible
          </span>
        ) : isUnlocked ? (
          <div className="flex items-center justify-between">
            {item.xpReward > 0 && (
              <span className="text-[10px] font-bold text-amber-400/90">+{item.xpReward} XP</span>
            )}
            {item.unlockedAt && (
              <span className="text-[9px] text-white/40">
                {new Date(item.unlockedAt).toLocaleDateString("fr-FR", {
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
              {item.xpReward > 0 && (
                <span className="text-[10px] font-semibold text-amber-400/50">
                  +{item.xpReward} XP
                </span>
              )}
              <span className="text-[10px] font-bold tabular-nums text-white/30">
                {item.progress}%
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r opacity-70",
                  RARITY_PROGRESS[rarity],
                )}
                initial={{ width: "0%" }}
                animate={{ width: `${item.progress}%` }}
                transition={{ duration: 1, ease: "easeOut", delay: 0.15 }}
              />
            </div>
            {item.currentLabel && (
              <p className="mt-1 text-[9px] text-white/30">{item.currentLabel}</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Salle des trophées — le cœur visuel de la Progression RPG. Fusionne EN UNE
 * SEULE collection : les badges historiques (moteur existant, `useBadgeSystem`,
 * intact) et les ~165 nouveaux succès (couche additive, `useAchievements`,
 * calculée en direct depuis les données déjà chargées). Aucun des deux
 * moteurs n'est modifié ; cette vue ne fait que les afficher ensemble.
 */
export function TrophyRoom({
  achievements,
  legacyBadges,
  isLoading,
}: {
  achievements: AchievementAggregate;
  legacyBadges: BadgeWithProgress[];
  isLoading: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [unlockQueue, setUnlockQueue] = useState<BadgeCatalogEntry[]>([]);
  const seenKeysRef = useRef<Set<string> | null>(null);

  // Détection des badges historiques nouvellement débloqués (préserve la
  // cinématique de déblocage existante). Les nouveaux succès (couche
  // additive) n'ont pas cette célébration : ils sont recalculés en direct à
  // chaque chargement plutôt qu'attribués à un instant précis.
  useEffect(() => {
    const currentKeys = new Set(
      legacyBadges.filter((b) => b.isUnlocked).map((b) => b.catalog.badge_key),
    );
    if (seenKeysRef.current === null) {
      seenKeysRef.current = currentKeys;
      return;
    }
    const newlyUnlocked = legacyBadges.filter(
      (b) => b.isUnlocked && !seenKeysRef.current!.has(b.catalog.badge_key),
    );
    if (newlyUnlocked.length > 0) {
      setUnlockQueue((q) => [...q, ...newlyUnlocked.map((b) => b.catalog)]);
    }
    seenKeysRef.current = currentKeys;
  }, [legacyBadges]);

  const currentUnlock = unlockQueue[0] ?? null;

  const { items, unlockedCount, total, completionPct, rarityCounts, categoryOverview } = useMemo(
    () => buildAchievementCollection(achievements, legacyBadges),
    [achievements, legacyBadges],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const searchable = i.isSecret && !i.isUnlocked ? "" : i.title.toLowerCase();
      if (q && !searchable.includes(q)) return false;
      switch (filter) {
        case "unlocked":
          return i.isUnlocked;
        case "locked":
          return !i.isUnlocked;
        case "in_progress":
          return !i.isUnlocked && i.progress > 0 && i.progress < 100;
        case "common":
        case "rare":
        case "epic":
        case "legendary":
        case "mythic":
          return i.rarity === filter;
        default:
          return true;
      }
    });
  }, [items, filter, search]);

  const groups = useMemo(() => {
    const map = new Map<AchievementCategory, CollectionItem[]>();
    for (const i of filtered) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.isUnlocked !== b.isUnlocked) return a.isUnlocked ? -1 : 1;
        return b.progress - a.progress;
      });
    }
    return ACHIEVEMENT_CATEGORY_ORDER.filter((c) => map.has(c)).map(
      (c) => [c, map.get(c)!] as const,
    );
  }, [filtered]);

  const nextObjective = achievements.nextObjective;

  return (
    <section>
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-4 shadow-xl">
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
            <span className="text-2xl font-black tabular-nums text-amber-400">
              {completionPct}%
            </span>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/30">
              complété
            </p>
          </div>
        </div>

        <div className="relative mt-3 grid grid-cols-5 gap-1.5">
          {(["common", "rare", "epic", "legendary", "mythic"] as BadgeRarity[]).map((r) => {
            const c = rarityCounts[r];
            const owned = c.owned > 0;
            return (
              <div
                key={r}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl border py-2",
                  owned
                    ? cn("bg-gradient-to-b", RARITY_BG[r], RARITY_BORDER[r])
                    : "border-white/[0.05] bg-white/[0.02]",
                )}
              >
                <span
                  className={cn(
                    "text-sm font-black tabular-nums",
                    owned ? RARITY_TEXT[r] : "text-white/20",
                  )}
                >
                  {c.owned}
                </span>
                <span className="text-[7.5px] font-bold uppercase tracking-wider text-white/35">
                  {RARITY_LABELS[r]}
                </span>
              </div>
            );
          })}
        </div>

        <div className="relative mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
          {categoryOverview.map(([cat, c]) => (
            <button
              key={cat}
              type="button"
              onClick={() =>
                document
                  .getElementById(`collection-category-${cat}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 transition-colors hover:border-white/[0.15]"
            >
              <span className="text-sm leading-none">{ACHIEVEMENT_CATEGORY_EMOJI[cat]}</span>
              <span className="text-[10px] font-semibold text-white/70">
                {ACHIEVEMENT_CATEGORY_LABELS[cat]}
              </span>
              <span className="text-[9px] font-bold text-white/35">
                {c.owned}/{c.total}
              </span>
            </button>
          ))}
        </div>

        {nextObjective && (
          <div className="relative mt-3">
            <HighlightRow
              icon={<Target className="h-3.5 w-3.5" />}
              label={`Prochain succès (${nextObjective.progress}%)`}
              title={nextObjective.def.title}
              rarity={nextObjective.def.rarity}
            />
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un succès…"
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
          <p className="text-sm font-medium text-muted-foreground/60">Aucun succès</p>
          <p className="mt-1 text-xs text-muted-foreground/40">
            Essaie un autre filtre ou une autre recherche
          </p>
        </div>
      )}

      <AnimatePresence>
        {!isLoading && groups.length > 0 && (
          <div className="mt-4 space-y-5">
            {groups.map(([cat, list]) => {
              const catOwned = list.filter((i) => i.isUnlocked).length;
              const catPct = list.length > 0 ? Math.round((catOwned / list.length) * 100) : 0;
              return (
                <div key={cat} id={`collection-category-${cat}`} className="scroll-mt-4">
                  <div className="mb-2.5 flex items-center justify-between gap-2 border-l-2 border-primary/40 pl-2.5">
                    <h3 className="flex items-center gap-2 text-[13px] font-bold text-white/90">
                      <span className="text-lg leading-none">
                        {ACHIEVEMENT_CATEGORY_EMOJI[cat]}
                      </span>
                      {ACHIEVEMENT_CATEGORY_LABELS[cat]}
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
                    {list.map((item, i) => (
                      <CollectionCard key={item.key} item={item} index={i} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      <BadgeUnlockOverlay badge={currentUnlock} onClose={() => setUnlockQueue((q) => q.slice(1))} />
    </section>
  );
}
