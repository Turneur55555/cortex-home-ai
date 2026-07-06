import { ExerciseExplorerSheet, type PickedExercise, type RecentExercise } from "./ExerciseExplorerSheet";

export type { PickedExercise, RecentExercise };

interface Props {
  onSelect: (ex: PickedExercise) => void;
  onClose: () => void;
  recentExercises: RecentExercise[];
  initialQuery?: string;
}

/**
 * Point d'entrée "Picker" du module Exercices — sélection rapide pendant la
 * construction d'une séance. Coquille fine autour d'ExerciseExplorerSheet
 * (mode="picker") : tap sur une ligne → sélection immédiate (onSelect). Le
 * reste de l'écran (recherche, liste, menu "...") est strictement identique
 * à ExerciseCatalogSheet — plus de Picker "bridé" : mêmes actions de gestion
 * (voir la fiche, modifier, promouvoir, supprimer, démarrer/ajouter à une
 * séance) disponibles ici aussi, activées/désactivées selon le contexte.
 */
export function ExercisePickerSheet({ onSelect, onClose, recentExercises, initialQuery }: Props) {
  return (
    <ExerciseExplorerSheet
      mode="picker"
      onClose={onClose}
      onPick={onSelect}
      recentExercises={recentExercises}
      initialQuery={initialQuery}
      enableScan
    />
  );
}
