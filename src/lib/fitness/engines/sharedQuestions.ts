// ============================================================
// Fragments de question Sensei réutilisables entre moteurs.
//
// Chaque discipline reste propriétaire de SA liste `questions`
// complète — il n'y a pas d'injection depuis l'orchestrateur, qui
// resterait alors couplé au contenu des moteurs. Mais rien n'empêche
// plusieurs moteurs de partager la MÊME définition quand le concept
// est identique (lieu, durée) : ce fichier existe pour éviter de
// retaper deux fois la même question. Ajouter un fragment ici n'a
// aucun effet tant qu'aucun moteur ne l'inclut explicitement dans sa
// propre liste `questions`.
// ============================================================

import { GYMS } from "@/lib/fitness/config";
import type { SenseiQuestionSpec } from "./types";

export const gymLocationQuestion: SenseiQuestionSpec = {
  id: "gym_location",
  prompt: "Où vas-tu t'entraîner ?",
  type: "location",
  options: GYMS.map((g) => ({ value: g, label: g })),
  defaultValue: "Keep Cool",
};

export function durationQuestion(defaultMinutes: number): SenseiQuestionSpec {
  return {
    id: "duration_minutes",
    prompt: "Combien de temps as-tu devant toi ?",
    type: "number",
    defaultValue: defaultMinutes,
  };
}

export const levelQuestion: SenseiQuestionSpec = {
  id: "level",
  prompt: "Quel est ton niveau ?",
  type: "single-choice",
  options: [
    { value: "débutant", label: "Débutant" },
    { value: "intermédiaire", label: "Intermédiaire" },
    { value: "avancé", label: "Avancé" },
  ],
  defaultValue: "intermédiaire",
};
