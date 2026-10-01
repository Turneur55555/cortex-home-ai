import { useEffect, useRef, useState } from "react";
import { todayYMD } from "@/lib/fitness/weeklyPlan";

/** Vérifie le jour toutes les minutes : assez fin pour le passage de minuit, assez rare pour ne rien coûter. */
const CHECK_EVERY_MS = 60_000;

/**
 * La date locale d'aujourd'hui (yyyy-MM-dd), qui SE MET À JOUR quand le jour
 * change.
 *
 * Calculer la date une fois au rendu ne suffit pas : une application ouverte en
 * salle le soir et rouverte le lendemain matin — ou simplement laissée dans un
 * onglet — garderait « aujourd'hui » figé sur la veille, et la semaine mettrait
 * en avant le mauvais jour. On revérifie donc à intervalle régulier ET au
 * retour au premier plan (le minuteur d'un onglet en arrière-plan est ralenti
 * par le navigateur, `visibilitychange` rattrape ce cas).
 *
 * N'appelle `setState` QUE si le jour a réellement changé : aucun rendu
 * inutile, par construction. (`setToday((p) => (p === next ? p : next))` ne
 * suffit pas — React peut rappeler le composant une fois avant de s'abstenir,
 * et le minuteur le ferait toutes les minutes.) La date déjà affichée est donc
 * lue dans une ref, pas dans l'état.
 */
export function useLocalToday(): string {
  const [today, setToday] = useState(() => todayYMD());
  const shown = useRef(today);

  useEffect(() => {
    const sync = () => {
      const next = todayYMD();
      if (next === shown.current) return;
      shown.current = next;
      setToday(next);
    };
    sync(); // rattrape un changement de jour survenu entre le rendu et le montage
    const interval = window.setInterval(sync, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return today;
}
