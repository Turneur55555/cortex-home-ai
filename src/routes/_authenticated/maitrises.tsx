import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Swords } from "lucide-react";
import { useMemo } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { computeBroadActivity } from "@/lib/profile/achievements/muscleVolume";
import { ExerciseRankStrip } from "@/components/fitness/ExerciseRankStrip";

export const Route = createFileRoute("/_authenticated/maitrises")({
  head: () => ({
    meta: [
      { title: "Toutes les maîtrises — ICORTEX" },
      { name: "description", content: "Le rang de chacune de tes techniques pratiquées." },
    ],
  }),
  component: MaitrisesPage,
});

/**
 * Écran dédié "Toutes les maîtrises" — ouvert depuis la carte Progression
 * RPG de Séances ("Voir toutes les maîtrises"). Contrairement au carousel
 * ExerciseRankStrip en tête de page (limité à quelques exercices phares),
 * cet écran liste TOUTES les techniques pratiquées au moins deux fois, en
 * grille plutôt qu'en swipe — aucun moteur/calcul nouveau, juste
 * `computeBroadActivity` (déjà utilisé par Profil) appelé avec une limite
 * large plutôt que la limite de vitrine (8).
 */
function MaitrisesPage() {
  const { data: workouts } = useWorkouts();
  const { nameByKey, histByName, volByName, prByName } = useMemo(
    () => computePRs(workouts ?? []),
    [workouts],
  );
  const allExercises = useMemo(
    () => computeBroadActivity(workouts ?? [], 500).broadExercises,
    [workouts],
  );

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-5">
        <Link
          to="/seances"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Séances
        </Link>
        <div className="flex items-center gap-1.5">
          <Swords className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">Toutes les maîtrises</h1>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Le rang de chaque technique pratiquée au moins deux fois.
        </p>
      </header>

      {allExercises.length > 0 ? (
        <ExerciseRankStrip
          topExercises={allExercises}
          nameByKey={nameByKey}
          histByName={histByName}
          volByName={volByName}
          prByName={prByName}
          layout="grid"
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-6 text-center">
          <p className="text-sm font-medium text-muted-foreground/60">
            Aucune maîtrise pour l'instant
          </p>
          <p className="mt-1 text-xs text-muted-foreground/40">
            Pratique un même exercice au moins deux fois pour débloquer son rang.
          </p>
        </div>
      )}
    </main>
  );
}
