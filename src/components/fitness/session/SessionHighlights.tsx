// ============================================================
// Bloc "Moments forts" — journal de progression (refonte 25/07/2026).
// Résume en un coup d'œil les exploits d'une séance, AVANT la liste
// détaillée des exercices. Purement présentation : chaque item est déjà
// dérivé de données réelles par l'appelant (WorkoutCard/GenericHistoryCard) ;
// ce composant ne recalcule rien, n'invente rien — liste vide -> rien
// n'est rendu (aucune case vide, aucun placeholder).
// ============================================================

export interface HighlightSpec {
  key: string;
  emoji: string;
  label: string;
}

export function SessionHighlights({ items }: { items: HighlightSpec[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((h) => (
        <span
          key={h.key}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary/90 ring-1 ring-primary/15"
        >
          <span aria-hidden>{h.emoji}</span>
          {h.label}
        </span>
      ))}
    </div>
  );
}
