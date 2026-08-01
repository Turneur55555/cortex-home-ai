import type { ReactNode } from "react";

/**
 * Tuile jumelle de StatTile/ComingSoonTile (même gabarit) pour un
 * indicateur DÉJÀ implémenté mais dont les données actuellement
 * disponibles ne permettent pas un calcul honnête (ex. NEAT sans calories
 * actives ni pas connus) — distincte de ComingSoonTile ("À venir" =
 * fonctionnalité pas encore développée) : ici la fonctionnalité existe,
 * seule la donnée manque. Ne jamais afficher "0" dans ce cas : 0 laisserait
 * croire à une mesure réelle plutôt qu'à une absence de donnée.
 */
export function InsufficientDataTile({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-2 py-3">
      <span className="text-muted-foreground/40">{icon}</span>
      <span className="line-clamp-2 break-words text-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">
        {label}
      </span>
      <span className="mt-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        Données insuffisantes
      </span>
    </div>
  );
}
