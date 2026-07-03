/**
 * Couleurs d'accent : chaque choix recolore RÉELLEMENT l'app en surchargeant
 * les variables CSS --primary / --primary-glow (format oklch, cf. styles.css).
 */
export interface AccentOption {
  hex: string;
  label: string;
  primary: string;
  glow: string;
}

export const DEFAULT_ACCENT = "#6c63ff";

export const ACCENT_OPTIONS: AccentOption[] = [
  { hex: "#6c63ff", label: "Violet", primary: "oklch(0.62 0.22 285)", glow: "oklch(0.72 0.2 285)" },
  { hex: "#22c55e", label: "Vert", primary: "oklch(0.72 0.19 150)", glow: "oklch(0.8 0.19 150)" },
  { hex: "#f97316", label: "Orange", primary: "oklch(0.7 0.19 45)", glow: "oklch(0.78 0.19 45)" },
  { hex: "#ec4899", label: "Rose", primary: "oklch(0.66 0.21 356)", glow: "oklch(0.74 0.21 356)" },
  { hex: "#06b6d4", label: "Cyan", primary: "oklch(0.71 0.13 215)", glow: "oklch(0.79 0.13 215)" },
  { hex: "#eab308", label: "Jaune", primary: "oklch(0.8 0.16 90)", glow: "oklch(0.86 0.16 90)" },
];

/** Applique la couleur d'accent au document (ou restaure le défaut). */
export function applyAccent(hex: string | null | undefined): void {
  const root = document.documentElement;
  const option = ACCENT_OPTIONS.find((a) => a.hex === hex);
  if (!option || option.hex === DEFAULT_ACCENT) {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-glow");
    return;
  }
  root.style.setProperty("--primary", option.primary);
  root.style.setProperty("--primary-glow", option.glow);
}
