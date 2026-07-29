import { ExerciseMediaSection } from "./ExerciseMedia";
import { ExerciseRankCard } from "../ExerciseRankCard";
import { StarRating } from "../ExerciseAnalysisPrimitives";
import { RELEVANCE_LABELS, type ExerciseAnalysis } from "@/lib/fitness/analysis";
import type { ExerciseMediaItem } from "@/hooks/useExerciseCatalogEntry";

// ============================================================
// Hero de la fiche exercice — 2e itération (2026-07-29) : le rang RPG est
// la récompense principale du joueur (règle produit validée par Nathan),
// il doit donc être visible IMMÉDIATEMENT à l'ouverture, avant tout scroll
// et avant toute autre section. Le Hero regroupe : média pleine largeur
// (photo/GIF/vidéo du dataset), badges dérivés, alias, puis la carte de
// rang complète (illustration, maîtrise, records) — rien d'autre n'est
// affiché au-dessus.
// ============================================================

export function ExerciseHero({
  exerciseName,
  media,
  fallbackImageUrl,
  badges,
  aliases,
  analysis,
}: {
  exerciseName: string;
  media: ExerciseMediaItem[];
  fallbackImageUrl?: string | null;
  badges: string[];
  aliases: string[];
  analysis: ExerciseAnalysis | null;
}) {
  return (
    <div className="space-y-3">
      <ExerciseMediaSection
        exerciseName={exerciseName}
        media={media}
        fallbackImageUrl={fallbackImageUrl}
        badges={badges.map((label) => (
          <span
            key={label}
            className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm"
          >
            {label}
          </span>
        ))}
      />

      {aliases.length > 0 && (
        <p className="text-center text-[10.5px] text-muted-foreground">
          Aussi appelé : {aliases.join(", ")}
        </p>
      )}

      {analysis && (
        <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-2.5">
          <StarRating stars={analysis.relevance.stars} />
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            {RELEVANCE_LABELS[analysis.relevance.label]}
          </span>
        </div>
      )}

      <ExerciseRankCard exerciseName={exerciseName} />
    </div>
  );
}
