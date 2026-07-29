import { BookOpen } from "lucide-react";
import { SectionCard } from "../ExerciseAnalysisPrimitives";

// ============================================================
// Présentation — description/instructions issues du dataset (français),
// jamais fabriquée. Le "pourquoi" vient du moteur d'analyse existant
// (smartSummary), pas d'un champ séparé qui n'existe pas côté données —
// voir docs/architecture/exercises-dataset-integration.md §18 pour le
// détail des champs disponibles.
// ============================================================

export function ExercisePresentationCard({
  description,
  smartSummary,
}: {
  description: string | null;
  smartSummary?: string | null;
}) {
  if (!description && !smartSummary) return null;

  return (
    <SectionCard icon={<BookOpen className="h-3.5 w-3.5" />} title="Présentation">
      <div className="space-y-3">
        {smartSummary && (
          <p className="text-[12.5px] leading-relaxed text-foreground/90">{smartSummary}</p>
        )}
        {description && (
          <p className="whitespace-pre-line text-[12px] leading-relaxed text-foreground/75">
            {description}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
