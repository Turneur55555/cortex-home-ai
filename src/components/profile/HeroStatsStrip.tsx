import { Flame, Layers, Medal } from "lucide-react";

// ============================================================
// Bandeau de statistiques — DÉPLACÉ hors du Hero.
//
// Le Hero raconte une histoire (le RANG, le Disque, l'ascension) ; il ne doit
// plus afficher de tableau de bord. Série / Séances / Succès vivent désormais
// ici, sous le Hero. Composant purement présentiel.
// ============================================================

function StatTile({
  icon,
  value,
  label,
  accentClass,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accentClass?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-2xl bg-black/25 px-2 py-3 text-center ring-1 ring-white/10 backdrop-blur-sm">
      <span className={accentClass ?? "text-white/70"}>{icon}</span>
      <div className="w-full truncate text-[15px] font-black leading-tight text-white">{value}</div>
      <div className="w-full truncate text-[9px] font-semibold uppercase tracking-wider text-white/45">
        {label}
      </div>
    </div>
  );
}

export function HeroStatsStrip({
  streak,
  totalWorkouts,
  achievementsUnlocked,
  achievementsTotal,
}: {
  streak: number;
  totalWorkouts: number;
  achievementsUnlocked: number;
  achievementsTotal: number;
}) {
  return (
    <div className="mb-6 grid grid-cols-3 gap-2">
      <StatTile
        icon={<Flame className="h-4 w-4 text-orange-400" />}
        value={`${streak}j`}
        label="Série"
        accentClass="text-orange-400"
      />
      <StatTile
        icon={<Layers className="h-4 w-4 text-white/70" />}
        value={`${totalWorkouts}`}
        label="Séances"
      />
      <StatTile
        icon={<Medal className="h-4 w-4 text-amber-400" />}
        value={`${achievementsUnlocked}/${achievementsTotal}`}
        label="Succès"
        accentClass="text-amber-400"
      />
    </div>
  );
}
