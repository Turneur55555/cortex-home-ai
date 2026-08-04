import type { ReactNode } from "react";

/**
 * Tuile jumelle de StatTile/ComingSoonTile (même gabarit) pour un
 * indicateur DÉJÀ implémenté mais dont les données actuellement
 * disponibles ne permettent pas un calcul honnête (ex. NEAT sans calories
 * actives ni pas connus) — distincte de ComingSoonTile ("À venir" =
 * fonctionnalité pas encore développée) : ici la fonctionnalité existe,
 * seule la donnée manque. Ne jamais afficher "0" dans ce cas : 0 laisserait
 * croire à une mesure réelle plutôt qu'à une absence de donnée.
 *
 * `reason`/`ctaLabel`+`onAction` (Phase 10 §10) : quand une action
 * utilisateur précise peut résoudre le manque (compléter le profil
 * métabolique, ajouter une mesure), la tuile devient un vrai bouton
 * actionnable au lieu d'un simple constat — jamais un second composant
 * dédié, juste une extension optionnelle et rétrocompatible de celui-ci.
 */
export function InsufficientDataTile({
  icon,
  label,
  reason = "Données insuffisantes",
  ctaLabel,
  onAction,
}: {
  icon: ReactNode;
  label: string;
  reason?: string;
  ctaLabel?: string;
  onAction?: () => void;
}) {
  const content = (
    <>
      <span className="text-muted-foreground/40">{icon}</span>
      <span className="line-clamp-2 break-words text-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">
        {label}
      </span>
      <span className="mt-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        {ctaLabel && onAction ? ctaLabel : reason}
      </span>
    </>
  );

  if (ctaLabel && onAction) {
    return (
      <button
        type="button"
        onClick={onAction}
        className="flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-2 py-3 transition-colors hover:border-primary/30"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-2 py-3">
      {content}
    </div>
  );
}
