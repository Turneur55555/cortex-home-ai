import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  seasonTierProgress,
  seasonDaysRemaining,
  seasonTimeProgress,
  type SeasonTierProgress,
} from "@/lib/fitness/rpg/season";

export interface ActiveSeason {
  id: string;
  index: number;
  slug: string;
  name: string;
  theme: string | null;
  starts_at: string;
  ends_at: string;
}

export interface ActiveSeasonState {
  isLoading: boolean;
  /** null tant qu'aucune saison n'est active (intersaison, ou tables pas encore déployées). */
  season: ActiveSeason | null;
  ps: number;
  tier: number;
  tierProgress: SeasonTierProgress;
  daysRemaining: number;
  /** Progression temporelle dans la fenêtre de saison, 0..1. */
  timeProgress: number;
}

/**
 * Saison active + progression de l'utilisateur (lecture seule). Le serveur
 * écrit ps/tier (trigger de clôture de séance muscu) ; ce hook ne fait que
 * lire et dériver l'affichage. Dégrade proprement : pas de saison active →
 * `season = null` (la carte de saison se masque).
 */
export function useActiveSeason(): ActiveSeasonState {
  const { user } = useAuth();

  const { data: season = null, isLoading: seasonLoading } = useQuery({
    queryKey: ["active_season"],
    staleTime: 300_000,
    queryFn: async (): Promise<ActiveSeason | null> => {
      const nowIso = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("seasons")
        .select("id, index, slug, name, theme, starts_at, ends_at")
        .eq("status", "active")
        .lte("starts_at", nowIso)
        .gt("ends_at", nowIso)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      return (data as ActiveSeason | null) ?? null;
    },
  });

  const { data: progress = null, isLoading: progressLoading } = useQuery({
    queryKey: ["user_season_progress", user?.id, season?.id],
    enabled: !!user && !!season,
    staleTime: 30_000,
    queryFn: async (): Promise<{ ps: number; tier: number } | null> => {
      const { data, error } = await (supabase as any)
        .from("user_season_progress")
        .select("ps, tier")
        .eq("user_id", user!.id)
        .eq("season_id", season!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as { ps: number; tier: number } | null) ?? null;

    },
  });

  return useMemo(() => {
    const ps = progress?.ps ?? 0;
    const tier = progress?.tier ?? 0;
    return {
      isLoading: seasonLoading || (!!season && progressLoading),
      season,
      ps,
      tier,
      tierProgress: seasonTierProgress(ps),
      daysRemaining: season ? seasonDaysRemaining(season.ends_at) : 0,
      timeProgress: season ? seasonTimeProgress(season.starts_at, season.ends_at) : 0,
    };
  }, [season, progress, seasonLoading, progressLoading]);
}
