import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface UserStats {
  xp: number;
  level: number;
  total_actions: number;
}

export function useUserStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_stats", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<UserStats> => {
      // TEMP DIAGNOSTIC — à retirer après investigation du flash de rang au démarrage.
      const t0 = performance.now();
      const { data, error, status, statusText } = await supabase
        .from("user_stats")
        .select("xp, level, total_actions")
        .eq("user_id", user!.id)
        .maybeSingle();
      const durationMs = performance.now() - t0;
      // eslint-disable-next-line no-console
      console.log("[RANG-DEBUG] useUserStats queryFn resolved", {
        tStart: t0.toFixed(1),
        tEnd: performance.now().toFixed(1),
        durationMs: durationMs.toFixed(1),
        xp: data?.xp,
        status,
        statusText,
        error: error?.message,
        // Indice de provenance réseau vs cache Service Worker : Workbox
        // NetworkFirst ne pose pas d'en-tête standard lisible ici, mais une
        // résolution quasi instantanée (<5ms) après un cold start est un
        // signe fort de réponse servie par le SW plutôt que par le réseau ;
        // un plateau proche de 5000ms indique le timeout NetworkFirst
        // (networkTimeoutSeconds: 5, vite.config.ts) avant fallback cache.
      });
      if (error) throw error;
      return data ?? { xp: 0, level: 1, total_actions: 0 };
    },
  });
}
