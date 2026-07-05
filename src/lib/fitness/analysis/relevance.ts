// ============================================================
// Score de pertinence de l'exercice pour CET utilisateur (domaine pur).
// Combine : caractère polyarticulaire, alignement avec l'objectif, utilité
// pour combler un muscle négligé, et régularité de pratique. Retourne un
// score en étoiles (1..5) + un libellé + les raisons.
// ============================================================

import { normalize } from "../exerciseCatalog";
import { exerciseDifficulty } from "../exerciseRanks";
import type { MuscleId } from "../muscleMapping";
import type {
  RelevanceLabel,
  RelevanceScore,
  TrainingObjective,
} from "./types";
import type { RoleMap } from "./muscleRoles";

export interface RelevanceInput {
  exerciseName: string;
  roles: RoleMap;
  objective: TrainingObjective;
  isGenericModel: boolean;
  /** Muscles principaux actuellement négligés (retard de fréquence). */
  neglectedPrimary: ReadonlyArray<MuscleId>;
  sessionCount: number;
  progressing: boolean;
}

function labelFor(stars: number): RelevanceLabel {
  if (stars >= 5) return "essentiel";
  if (stars === 4) return "recommande";
  if (stars === 3) return "secondaire";
  return "peu_pertinent";
}

/** L'exercice est-il aligné avec l'objectif ? (bonus de score) */
function objectiveFit(
  name: string,
  objective: TrainingObjective,
  compound: boolean,
): { delta: number; reason?: string } {
  const n = normalize(name);
  switch (objective) {
    case "force":
      return compound
        ? { delta: 1, reason: "mouvement polyarticulaire lourd, idéal pour développer la force" }
        : { delta: -1, reason: "exercice d'isolation, accessoire pour un objectif de force" };
    case "hypertrophie":
      return { delta: 0.5, reason: "utile pour l'hypertrophie (volume ciblé)" };
    case "seche":
      return compound
        ? { delta: 0.5, reason: "gros mouvement dépensier, efficace pendant une sèche" }
        : { delta: 0, reason: "maintien du muscle pendant la sèche" };
    case "endurance":
      return /squat|fente|presse|rowing|traction|developpe/.test(n)
        ? { delta: 0.5, reason: "bon support pour l'endurance musculaire" }
        : { delta: 0 };
    case "posture":
      return /row|rowing|face.?pull|oiseau|rear|extension.?lombaire|good.?morning|traction|tirage|gainage|planche/.test(
        n,
      )
        ? { delta: 1, reason: "renforce la chaîne posturale, prioritaire pour ton objectif posture" }
        : { delta: -0.5, reason: "peu spécifique à un objectif postural" };
    case "general":
      return compound
        ? { delta: 0.5, reason: "mouvement complet, bon rapport bénéfice/effort" }
        : { delta: 0 };
  }
}

/**
 * Calcule le score de pertinence. Toujours renseigné (même en modèle
 * générique, où la pertinence reste modérée par défaut).
 */
export function computeRelevance(input: RelevanceInput): RelevanceScore {
  const reasons: string[] = [];
  const coef = exerciseDifficulty(input.exerciseName);
  const compound = coef >= 1.4;

  // Base : 3 étoiles, ajustée par le caractère polyarticulaire.
  let score = 3;
  if (compound) {
    score += 1;
    reasons.push("Mouvement polyarticulaire à fort retour sur investissement.");
  } else {
    reasons.push("Exercice d'isolation : ciblé mais à combiner avec des mouvements de base.");
  }

  // Alignement objectif.
  const fit = objectiveFit(input.exerciseName, input.objective, compound);
  score += fit.delta;
  if (fit.reason) reasons.push(`Objectif « ${input.objective} » : ${fit.reason}.`);

  // Comble un muscle négligé → plus pertinent ici et maintenant.
  if (input.neglectedPrimary.length > 0) {
    score += 0.5;
    reasons.push("Cible un groupe musculaire actuellement en retard dans ton programme.");
  }

  // Régularité + progression : un exercice pratiqué et qui progresse mérite d'être gardé.
  if (input.sessionCount >= 4 && input.progressing) {
    score += 0.5;
    reasons.push("Tu le pratiques régulièrement et il progresse : à conserver dans ta routine.");
  } else if (input.sessionCount <= 1) {
    reasons.push("Encore peu de données : la pertinence s'affinera au fil des séances.");
  }

  // Modèle générique : on reste prudent.
  if (input.isGenericModel) {
    score = Math.min(score, 3);
    reasons.push("Exercice non reconnu : analyse basée sur un modèle biomécanique générique.");
  }

  const stars = Math.max(1, Math.min(5, Math.round(score)));
  return { stars, label: labelFor(stars), reasons };
}
