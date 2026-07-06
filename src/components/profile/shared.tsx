import { cn } from "@/lib/utils";
import {
  RARITY_BG,
  RARITY_BORDER,
  RARITY_TEXT,
  RARITY_LABELS,
  type BadgeRarity,
} from "@/lib/fitness/badges";

/**
 * Petits blocs d'affichage partagés entre le Hero, la Progression RPG et la
 * Salle des trophées. Extraits de l'ancien `BadgesStrip` (itération
 * précédente) pour éviter toute duplication visuelle entre les nouvelles
 * sections du Profil.
 */
export function StatChip({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/[0.04]">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-0.5 text-sm font-black text-white/90 truncate">{value}</div>
      {hint && <div className="text-[9px] text-white/40 truncate">{hint}</div>}
    </div>
  );
}

export function HighlightRow({
  icon,
  label,
  title,
  rarity,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  rarity: BadgeRarity;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-1.5 ring-1 ring-white/[0.04]">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("shrink-0", RARITY_TEXT[rarity])}>{icon}</span>
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
            {label}
          </div>
          <div className="text-[11px] font-bold text-white/85 truncate">{title}</div>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-gradient-to-br",
          RARITY_BG[rarity],
          RARITY_TEXT[rarity],
          RARITY_BORDER[rarity],
          "border",
        )}
      >
        {RARITY_LABELS[rarity]}
      </span>
    </div>
  );
}
