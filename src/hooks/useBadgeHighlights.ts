import { useMemo } from "react";
import { useBadgeSystem } from "@/hooks/useBadgeSystem";
import { RARITY_RANK, type BadgeCatalogEntry, type BadgeRarity } from "@/lib/fitness/badges";

export interface BadgeWithProgress {
  catalog: BadgeCatalogEntry;
  isUnlocked: boolean;
  unlockedAt?: string;
  progress: number;
}

export interface BadgeHighlights {
  isLoading: boolean;
  unlocked: BadgeWithProgress[];
  unlockedCount: number;
  total: number;
  completionPct: number;
  /** Badge débloqué le plus rare (mis en avant sur Profil + bannière Trophées). */
  rarestUnlocked: BadgeWithProgress | null;
  /** Dernier badge débloqué chronologiquement. */
  latestUnlocked: BadgeWithProgress | null;
  /** Badge non débloqué le plus proche d'être obtenu (hors secrets/coming soon). */
  nextObjective: BadgeWithProgress | null;
}

/**
 * Dérive les temps forts du système de badges (rareté, dernier débloqué,
 * prochaine récompense) à partir de `useBadgeSystem`. Extrait de `BadgesStrip`
 * pour être réutilisé tel quel par le panneau Accomplissements du Profil —
 * une seule source de vérité pour ce calcul.
 */
export function useBadgeHighlights(): BadgeHighlights {
  const { badgesWithProgress, isLoading } = useBadgeSystem();

  const unlocked = useMemo(
    () => badgesWithProgress.filter((b) => b.isUnlocked),
    [badgesWithProgress],
  );
  const unlockedCount = unlocked.length;
  const total = badgesWithProgress.length;
  const completionPct = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

  const rarestUnlocked = useMemo(() => {
    if (unlocked.length === 0) return null;
    return [...unlocked].sort(
      (a, b) => RARITY_RANK[b.catalog.rarity as BadgeRarity] - RARITY_RANK[a.catalog.rarity as BadgeRarity],
    )[0];
  }, [unlocked]);

  const latestUnlocked = useMemo(() => {
    if (unlocked.length === 0) return null;
    return [...unlocked].sort(
      (a, b) => new Date(b.unlockedAt ?? 0).getTime() - new Date(a.unlockedAt ?? 0).getTime(),
    )[0];
  }, [unlocked]);

  const nextObjective = useMemo(() => {
    const candidates = badgesWithProgress.filter(
      (b) => !b.isUnlocked && !b.catalog.is_secret && !b.catalog.is_coming_soon,
    );
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => b.progress - a.progress)[0];
  }, [badgesWithProgress]);

  return {
    isLoading,
    unlocked,
    unlockedCount,
    total,
    completionPct,
    rarestUnlocked,
    latestUnlocked,
    nextObjective,
  };
}
