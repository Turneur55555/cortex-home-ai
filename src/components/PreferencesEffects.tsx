import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp } from "@/lib/fitness/rpg/titleProgress";
import { applyRankTheme } from "@/components/rpg/rankTheme";

/**
 * Applique les effets globaux à toute l'app :
 * - thème visuel du rang courant (variables CSS --primary/--ring/--gradient-*,
 *   voir applyRankTheme) — le Titre global (piloté par l'XP, comme
 *   ProfileHeroCard) est l'unique source de l'identité visuelle de Cortex
 * - animations (framer-motion reducedMotion)
 *
 * Tant que `userStats` n'a pas encore répondu (premier chargement), on
 * n'appelle PAS applyRankTheme : le thème garde sa valeur précédente (déjà
 * posée sur `:root` par un rendu antérieur dans la session) ou, à froid, le
 * repli neutre défini dans styles.css — jamais un flash "Mortel" le temps
 * que le vrai rang soit connu.
 */
export function PreferencesEffects({ children }: { children: ReactNode }) {
  const { prefs } = useUserPreferences();
  const { data: userStats } = useUserStats();
  const rankKey = userStats ? titleProgressForXp(userStats.xp).title.key : null;

  useEffect(() => {
    if (!rankKey) return;
    applyRankTheme(rankKey);
  }, [rankKey]);

  return (
    <MotionConfig reducedMotion={prefs.animations_enabled ? "never" : "always"}>
      {children}
    </MotionConfig>
  );
}
