// ============================================================
// Résolveur icône/couleur pour les modèles de séance — même principe que
// src/components/fitness/session/DisciplineIcon.tsx (table de noms → icône
// Lucide, résolue uniquement ici). Palette de couleurs curée (comme
// RARITY_COLORS dans lib/fitness/badges.ts) plutôt qu'un sélecteur de
// couleur libre, pour rester cohérent avec les modèles déjà utilisés dans
// l'app pour ce genre de personnalisation.
// ============================================================

import {
  Dumbbell,
  Flame,
  ArrowUp,
  ArrowDown,
  Shuffle,
  Target,
  Zap,
  Footprints,
  Swords,
  Anchor,
  Heart,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  Dumbbell,
  Flame,
  ArrowUp,
  ArrowDown,
  Shuffle,
  Target,
  Zap,
  Footprints,
  Swords,
  Anchor,
  Heart,
  Sparkles,
};

export const TEMPLATE_ICON_NAMES = Object.keys(TEMPLATE_ICONS);

export function TemplateIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = TEMPLATE_ICONS[icon] ?? Dumbbell;
  return <Icon className={className ?? "h-5 w-5"} />;
}

/** #6c63ff = couleur par défaut de la palette curée (première option, "primary"). */
export const TEMPLATE_COLORS: Record<string, string> = {
  primary: "#6c63ff",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  emerald: "#10b981",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  violet: "#8b5cf6",
};

export const TEMPLATE_COLOR_NAMES = Object.keys(TEMPLATE_COLORS);

export function templateColorHex(color: string): string {
  return TEMPLATE_COLORS[color] ?? TEMPLATE_COLORS.primary;
}
