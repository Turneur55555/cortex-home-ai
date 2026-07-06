import { ExerciseExplorerSheet } from "./ExerciseExplorerSheet";

interface Props {
  onClose: () => void;
  /** Historique/records déjà calculés par SeancesTab (computePRs) — réutilisés
   *  tels quels par la fiche d'analyse ouverte depuis le Catalogue. */
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
}

/**
 * Point d'entrée "Catalogue" du module Exercices — bibliothèque de
 * référence. Coquille fine autour d'ExerciseExplorerSheet (mode="catalog") :
 * tap sur une ligne → ouvre la fiche d'analyse intelligente. Le reste de
 * l'écran (recherche, liste, menu "...") est strictement identique à
 * ExercisePickerSheet — un seul écran, deux façons de l'ouvrir.
 */
export function ExerciseCatalogSheet({ onClose, histByName, volByName, prByName }: Props) {
  return (
    <ExerciseExplorerSheet
      mode="catalog"
      onClose={onClose}
      histByName={histByName}
      volByName={volByName}
      prByName={prByName}
    />
  );
}
