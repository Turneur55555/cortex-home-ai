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
 */
export function PreferencesEffects({ children }: { children: ReactNode }) {
  const { prefs } = useUserPreferences();
  const { data: userStats } = useUserStats();
  const rankKey = titleProgressForXp(userStats?.xp ?? 0).title.key;

  useEffect(() => {
    applyRankTheme(rankKey);
  }, [rankKey]);

  return (
    <MotionConfig reducedMotion={prefs.animations_enabled ? "never" : "always"}>
      {children}
    </MotionConfig>
  );
}
