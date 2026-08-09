import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useCortexPower } from "@/hooks/useCortexPower";
import { useAscensionSync } from "@/hooks/useAscensionSync";
import { applyRankTheme } from "@/components/rpg/rankTheme";

/**
 * Applique les effets globaux à toute l'app :
 * - thème visuel du rang courant (variables CSS --primary/--ring/--gradient-*,
 *   voir applyRankTheme) — le Titre global (`useCortexPower`, Puissance
 *   Cortex, comme ProfileHeroCard — jamais l'XP) est l'unique source de
 *   l'identité visuelle de Cortex
 * - synchronisation de l'historique des Ascensions (`useAscensionSync`) —
 *   montée ici, pas seulement sur l'écran Progression, pour qu'un
 *   changement de Titre soit consigné où que le joueur navigue
 * - animations (framer-motion reducedMotion + boucles CSS pures de RankTheme,
 *   comme .animate-rank-breathe, via la classe .motion-reduce sur <html>)
 *
 * Tant que le calcul n'a pas encore répondu (premier chargement) ou que le
 * joueur n'est pas encore classé, on n'appelle PAS applyRankTheme : le
 * thème garde sa valeur précédente (déjà posée sur `:root` par un rendu
 * antérieur dans la session) ou, à froid, le repli neutre défini dans
 * styles.css — jamais un flash "Mortel" le temps que le vrai rang soit connu.
 */
export function PreferencesEffects({ children }: { children: ReactNode }) {
  const { prefs } = useUserPreferences();
  const { isLoading, title } = useCortexPower();
  const rankKey = !isLoading && title.status === "ranked" ? title.title?.key : null;
  useAscensionSync();

  useEffect(() => {
    if (!rankKey) return;
    applyRankTheme(rankKey);
  }, [rankKey]);

  useEffect(() => {
    document.documentElement.classList.toggle("motion-reduce", !prefs.animations_enabled);
  }, [prefs.animations_enabled]);

  return (
    <MotionConfig reducedMotion={prefs.animations_enabled ? "never" : "always"}>
      {children}
    </MotionConfig>
  );
}
