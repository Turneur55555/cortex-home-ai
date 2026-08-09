import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCortexPower } from "@/hooks/useCortexPower";
import { useCortexAscensions } from "@/hooks/useCortexAscensions";
import { shouldTriggerAscension } from "@/lib/fitness/rpg/ascension";

/**
 * Synchronise le Titre courant (Puissance Cortex, calculée côté client)
 * vers l'historique serveur des Ascensions. Le serveur reste la source de
 * vérité : `record_cortex_ascension` (SECURITY DEFINER) ré-applique lui
 * -même la règle "changement de Titre + progression strictement
 * croissante" et ignore silencieusement tout appel qui ne la respecte pas
 * — cet effet ne fait qu'éviter des appels réseau inutiles.
 *
 * Monté une fois (voir `AppShell`/layout authentifié), pas par écran —
 * une Ascension doit être détectée où que le joueur se trouve dans l'app,
 * pas seulement sur la page Progression.
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

    (supabase as any)
      .rpc("record_cortex_ascension", { _tier_index: title.tierIndex })
      .then(({ error }: { error: unknown }) => {
        if (error) return;
        queryClient.invalidateQueries({ queryKey: ["cortex_ascensions", user.id] });
      });
  }, [user, isLoading, title, ascensions, queryClient]);
}
