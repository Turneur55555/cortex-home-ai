import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLocalToday } from "@/hooks/useLocalToday";
import { SERVER_CONFIRMED_QUERY_OPTIONS } from "@/lib/offline/serverConfirmedQuery";
import {
  previousWeekStart,
  summarizeWeeklyXp,
  type WeeklyXpSummary,
  type XpEventLike,
} from "@/lib/fitness/rpg/weeklyXp";

/** Bien au-delà de deux semaines d'XP d'un joueur (~20 versements mesurés en octobre 2026). */
const MAX_EVENTS = 1000;

/**
 * L'XP versée par le serveur cette semaine et la semaine dernière (`lib/fitness/rpg/weeklyXp.ts`).
 *
 * Lecture SERVEUR (l'XP n'est produite que par les triggers) : hors connexion, `data` reste
 * `undefined` et la fiche n'affiche simplement pas la ligne — jamais un « +0 XP » faux. La
 * lecture est bornée (INVARIANTS §4.1) ET sa complétude prouvée par `count: "exact"` : si le
 * serveur annonce plus de lignes qu'il n'en a renvoyées, on n'affiche rien plutôt qu'un total
 * tronqué.
 */
export function useWeeklyXp(): { summary: WeeklyXpSummary | null } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const today = useLocalToday();

  const query = useQuery({
    ...SERVER_CONFIRMED_QUERY_OPTIONS,
    queryKey: ["weekly_xp", userId, today],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyXpSummary | null> => {
      const since = new Date(`${previousWeekStart(today)}T00:00:00`).toISOString();
      const { data, error, count } = await supabase
        .from("xp_events")
        .select("amount, created_at", { count: "exact" })
        .eq("user_id", userId!)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(MAX_EVENTS);
      if (error) throw error;
      const rows = (data ?? []) as XpEventLike[];
      if (count != null && count > rows.length) return null;
      return summarizeWeeklyXp(rows, today);
    },
  });

  return { summary: query.data ?? null };
}
