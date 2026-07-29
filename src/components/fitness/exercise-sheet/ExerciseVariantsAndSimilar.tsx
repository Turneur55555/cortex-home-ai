import { GitBranch, Shuffle } from "lucide-react";
import { SectionCard } from "../ExerciseAnalysisPrimitives";
import type { ExerciseVariantRef } from "@/hooks/useExerciseCatalogEntry";

// ============================================================
// Variantes (même famille d'exercice, exercise_reference.family_id) et
// Exercices similaires (heuristique existante, muscle principal partagé —
// aucune donnée de "progression/régression" n'existe dans le dataset, donc
// la section reste honnêtement une seule liste de proximité, pas 4 listes
// distinctes inventées).
// ============================================================

export function ExerciseVariantsCard({
  variants,
  onSelect,
}: {
  variants: ExerciseVariantRef[];
  onSelect?: (name: string) => void;
}) {
  if (variants.length === 0) return null;

  return (
    <SectionCard icon={<GitBranch className="h-3.5 w-3.5" />} title="Variantes">
      <div className="flex flex-wrap gap-1.5">
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect?.(v.name)}
            disabled={!onSelect}
            className="rounded-full border border-primary/30 bg-primary/[0.06] px-3 py-1.5 text-[11px] font-medium text-foreground/90 transition-colors hover:border-primary/60 hover:text-primary disabled:pointer-events-none"
          >
            {v.name}
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

export function ExerciseSimilarCard({
  items,
  onSelect,
}: {
  items: Array<{ name: string; group: string }>;
  onSelect?: (name: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <SectionCard icon={<Shuffle className="h-3.5 w-3.5" />} title="Exercices similaires">
      <div className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => onSelect?.(s.name)}
            disabled={!onSelect}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none"
          >
            {s.name}
          </button>
        ))}
      </div>
    </SectionCard>
  );
}
