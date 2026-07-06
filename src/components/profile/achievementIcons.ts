import {
  Activity,
  Apple,
  Award,
  CheckCircle,
  Crown,
  Dumbbell,
  Flame,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  Zap,
} from "lucide-react";

/**
 * Résolution icône lucide par nom (stocké en base / dans les définitions de
 * succès) — partagée entre la Salle des trophées complète et son aperçu
 * compact sur le Profil.
 */
export const ACHIEVEMENT_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Award,
  Star,
  Trophy,
  Zap,
  Flame,
  Crown,
  Dumbbell,
  Shield,
  Target,
  Apple,
  CheckCircle,
  Activity,
  Swords,
  Sparkles,
};
