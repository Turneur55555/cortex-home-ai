import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface UserStats {
  xp: number;
  level: number;
  total_actions: number;
}

const CACHE_PREFIX = "cortex.userStats.v1:";

interface CachedUserStats {
  stats: UserStats;
  updatedAt: number;
}

/**
 * Dernier `user_stats` confirmé par le serveur, persisté par utilisateur.
 * Sert de `initialData` à la query ci-dessous pour qu'un rang déjà connu
 * s'affiche immédiatement au lancement — jamais un rang inventé (xp par
 * défaut) le temps que le réseau réponde.
 */
function readCache(userId: string): CachedUserStats | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedUserStats>;
    if (
      typeof parsed.updatedAt !== "number" ||
      typeof parsed.stats?.xp !== "number" ||
      typeof parsed.stats?.level !== "number" ||
      typeof parsed.stats?.total_actions !== "number"
    ) {
      return null;
    }
    return { stats: parsed.stats, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

function writeCache(userId: string, stats: UserStats) {
  try {
    const entry: CachedUserStats = { stats, updatedAt: Date.now() };
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(entry));
  } catch {
    // Stockage indisponible (navigation privée, quota) — le rang reste
    // correct pour cette session, simplement pas persisté au prochain lancement.
  }
}

export function useUserStats() {
  const { user } = useAuth();
  const userId = user?.id;
  const cached = useMemo(() => (userId ? readCache(userId) : null), [userId]);

  return useQuery({
    queryKey: ["user_stats", userId],
    enabled: !!user,
    staleTime: 30_000,
    // Affiche le dernier rang confirmé dès le premier rendu ; `initialDataUpdatedAt`
    // reporte son ancienneté réelle pour que React Query le considère périmé et
    // relance un fetch en arrière-plan dès le montage (comportement par défaut de
    // `refetchOnMount` face à des données déjà stale).
    initialData: cached?.stats,
    initialDataUpdatedAt: cached?.updatedAt,
    queryFn: async (): Promise<UserStats> => {
      const { data, error } = await supabase
        .from("user_stats")
        .select("xp, level, total_actions")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      const stats = data ?? { xp: 0, level: 1, total_actions: 0 };
      writeCache(user!.id, stats);
      return stats;
    },
  });
}
