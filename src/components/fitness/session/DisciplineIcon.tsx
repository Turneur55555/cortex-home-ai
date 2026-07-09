// ============================================================
// Résolveur icône ↔ discipline — SEUL point du code qui traduit le nom
// d'icône (string, posé par chaque moteur dans EngineDescriptor.icon,
// voir types.ts) en composant Lucide réel. /lib/fitness reste 100% pur
// (zéro import React) ; cette table vit volontairement dans la couche
// UI. Ajouter une discipline = ajouter son icône ici UNE fois — jamais
// un import Lucide direct dans CoachSheet/GenericHistoryCard/WorkoutCard.
// ============================================================

import {
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Sparkles,
  Wand2,
};

/** Badge compact icône + libellé, couleur d'accent pilotée par le moteur
 *  (`accentClassName`) — utilisé identiquement par WorkoutCard (musculation)
 *  et GenericHistoryCard (toute autre discipline) pour qu'une séance soit
 *  identifiable au premier coup d'œil, quelle que soit sa discipline. */
export function DisciplineBadge({
  icon,
  label,
  accentClassName,
}: {
  icon: string;
  label: string;
  accentClassName: string;
}) {
  const Icon = ICONS[icon] ?? Sparkles;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold tracking-normal " +
        accentClassName
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/** Icône seule (sans libellé) — utilisée là où le libellé est déjà affiché
 *  ailleurs (ex: le sélecteur de discipline du Sensei). */
export function DisciplineIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? Sparkles;
  return <Icon className={className ?? "h-5 w-5"} />;
}
