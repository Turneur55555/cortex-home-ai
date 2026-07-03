import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { applyAccent } from "@/lib/accent";

/**
 * Applique les préférences utilisateur à toute l'app :
 * - couleur d'accent (variables CSS --primary / --primary-glow)
 * - animations (framer-motion reducedMotion)
 */
export function PreferencesEffects({ children }: { children: ReactNode }) {
  const { prefs } = useUserPreferences();

  useEffect(() => {
    applyAccent(prefs.accent_color);
  }, [prefs.accent_color]);

  return (
    <MotionConfig reducedMotion={prefs.animations_enabled ? "never" : "always"}>
      {children}
    </MotionConfig>
  );
}
