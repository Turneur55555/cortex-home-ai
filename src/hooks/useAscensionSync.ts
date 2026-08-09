import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCortexPower } from "@/hooks/useCortexPower";
import { useCortexAscensions } from "@/hooks/useCortexAscensions";
import { shouldTriggerAscension } from "@/lib/fitness/rpg/ascension";

/**
 * Déclenche la synchronisation SERVEUR de l'historique des Ascensions.
 *
 * Audit RPG V2 Phase H (30/08/2026) — durci : ce hook n'envoie plus jamais
 * de `tier_index` calculé côté client au serveur. Il appelle l'Edge
 * Function `sync-cortex-ascension`, qui recalcule ENTIÈREMENT depuis les
 * données brutes (performances → Rang exercice → Rang musculaire →
 * Puissance Cortex) et n'enregistre une Ascension que si CE calcul serveur
 * constate un changement de Titre — voir
 * `supabase/functions/sync-cortex-ascension/index.ts` et la migration
 * 20260830120000_cortex_ascension_server_only.sql (le RPC
 * `record_cortex_ascension` n'est plus appelable que par le service role,
 * jamais directement par le client). Le Titre client (`useCortexPower`)
 * ne sert ici qu'à décider QUAND appeler le serveur (évite des appels
 * réseau inutiles) — jamais à décider CE QUI est enregistré.
 *
 * Monté une fois (voir `PreferencesEffects`/layout authentifié), pas par
 * écran — une Ascension doit être synchronisée où que le joueur se trouve
 * dans l'app, pas seulement sur la page Progression.
 */
export function useAscensionSync(): void {
  const { user } = useAuth();
  const { isLoading, title } = useCortexPower();
  const { data: ascensions } = useCortexAscensions();
  const queryClient = useQueryClient();
  const lastSynced = useRef<number | null>(null);

  useEffect(() => {
    if (!user || isLoading || title.status !== "ranked" || ascensions == null) return;

    const currentMaxRecorded = ascensions.reduce(
      (max, row) => (max == null || row.tier_index > max ? row.tier_index : max),
      null as number | null,
    );

    if (!shouldTriggerAscension(currentMaxRecorded, title.tierIndex)) return;
    if (lastSynced.current === title.tierIndex) return; // déjà tenté cette session
    lastSynced.current = title.tierIndex;

    void supabase.functions
      .invoke("sync-cortex-ascension")
      .then(({ error }) => {
        if (error) return;
        queryClient.invalidateQueries({ queryKey: ["cortex_ascensions", user.id] });
      })
      .catch((e) => {
        console.error("[useAscensionSync] échec sync-cortex-ascension", e);
      });
  }, [user, isLoading, title, ascensions, queryClient]);
}
