// ============================================================
// Moteur de recommandations par exercice (domaine pur).
// Spécifique au profil, uniquement à partir de données réellement
// disponibles : état de progression, plage de reps, nombre de séries,
// récupération des muscles moteurs, objectif utilisateur.
// ============================================================

import type { RecoveryStatus } from "../recovery";
import type {
  ComparisonReport,
  Recommendation,
  RecommendationType,
  TrainingObjective,
} from "./types";

export interface RecommendationInput {
  comparison: ComparisonReport;
  objective: TrainingObjective;
  /** Moyenne des répétitions du top set. */
  avgReps: number | null;
  /** Nombre de séries de la dernière séance. */
  lastSetCount: number;
  /** Nombre de séances enregistrées pour cet exercice. */
  sessionCount: number;
  /** Statut de récupération des muscles principaux. */
  primaryRecovery: RecoveryStatus[];
}

/** Plage de répétitions cible selon l'objectif. */
function targetRepRange(objective: TrainingObjective): [number, number] {
  switch (objective) {
    case "force":
      return [3, 6];
    case "hypertrophie":
      return [8, 12];
    case "seche":
      return [10, 15];
    case "endurance":
      return [15, 25];
    case "posture":
      return [10, 15];
    case "general":
      return [8, 12];
  }
}

function mk(
  type: RecommendationType,
  priority: 1 | 2 | 3,
  text: string,
  rationale: string,
): Recommendation {
  return { type, priority, text, rationale };
}

/**
 * Produit une liste triée de recommandations (priorité haute → basse).
 * Ne recommande que sur des signaux réels ; renvoie toujours au moins un
 * conseil constructif.
 */
export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const { comparison, objective, avgReps, lastSetCount, sessionCount, primaryRecovery } =
    input;
  const recs: Recommendation[] = [];
  const [minReps, maxReps] = targetRepRange(objective);

  const fatigued = primaryRecovery.filter((s) => s === "fatigued").length;
  const anyFatigued = fatigued > 0;

  // 1. Récupération incomplète des muscles moteurs → prioritaire.
  if (anyFatigued) {
    recs.push(
      mk(
        "recuperer",
        1,
        "Laisse plus de récupération avant de recharger cet exercice.",
        "Un ou plusieurs muscles moteurs sont encore fatigués (<48 h). Reprogrammer trop tôt limite la surcharge et augmente le risque de régression.",
      ),
    );
  }

  // 2. Régression → prudence, technique/tempo plutôt que charge.
  if (comparison.state === "regression") {
    recs.push(
      mk(
        "ameliorer_technique",
        1,
        "Reviens à une charge maîtrisée et soigne l'exécution avant de repousser.",
        "La dernière séance est en recul : consolider la technique et le tempo sécurise la reprise de progression plutôt que de forcer la charge.",
      ),
    );
  }

  // 3. Stagnation → variable de surcharge selon la plage de reps.
  if (comparison.state === "stagnation") {
    if (avgReps != null && avgReps >= maxReps) {
      recs.push(
        mk(
          "augmenter_charge",
          1,
          `Augmente la charge (+2,5 kg) et vise à nouveau ${minReps}-${maxReps} reps.`,
          `Tu tournes autour de ${Math.round(avgReps)} reps, au-dessus de ta plage cible (${minReps}-${maxReps}) : la charge est devenue le facteur limitant.`,
        ),
      );
    } else if (avgReps != null && avgReps < minReps) {
      recs.push(
        mk(
          "augmenter_reps",
          1,
          `Ajoute 1-2 répétitions pour revenir dans la plage ${minReps}-${maxReps}.`,
          `Tu es sous ta plage cible (${Math.round(avgReps)} < ${minReps} reps) pour un objectif « ${objective} » : gagner des reps avant d'ajouter de la charge.`,
        ),
      );
    } else {
      recs.push(
        mk(
          "ralentir_excentrique",
          2,
          "Ralentis la phase excentrique (3-4 s) pour créer une nouvelle contrainte.",
          "Charge et volume stables : augmenter le temps sous tension relance le stimulus sans changer la charge.",
        ),
      );
      recs.push(
        mk(
          "modifier_amplitude",
          2,
          "Travaille en amplitude complète (ou ajoute une pause en bas).",
          "Une amplitude plus grande ou une pause augmente la difficulté à charge égale et rompt la stagnation.",
        ),
      );
    }
  }

  // 4. Volume : trop peu de séries.
  if (lastSetCount > 0 && lastSetCount < 3 && !anyFatigued) {
    recs.push(
      mk(
        "ajouter_serie",
        2,
        "Ajoute une série de travail (viser 3-4 séries).",
        `Seulement ${lastSetCount} série(s) sur la dernière séance : monter le volume est le levier le plus simple pour progresser.`,
      ),
    );
  }

  // 5. Progression franche → continuer la surcharge progressive.
  if (comparison.state === "progression") {
    if (avgReps != null && avgReps >= maxReps) {
      recs.push(
        mk(
          "augmenter_charge",
          2,
          "Continue la surcharge : +2,5 kg à la prochaine séance.",
          "Tu progresses en haut de ta plage de reps : passer à la charge supérieure entretient l'adaptation.",
        ),
      );
    } else {
      recs.push(
        mk(
          "augmenter_reps",
          2,
          "Ajoute une répétition par série tant que la barre monte.",
          "La progression est en cours : capitaliser en ajoutant des répétitions avant de monter la charge.",
        ),
      );
    }
  }

  // 6. Fréquence : peu de séances et bonne récupération → densifier.
  if (sessionCount >= 2 && sessionCount < 6 && !anyFatigued && comparison.state !== "regression") {
    recs.push(
      mk(
        "augmenter_frequence",
        3,
        "Tu peux travailler cet exercice un peu plus souvent.",
        "Historique encore court et muscles moteurs récupérés : une fréquence légèrement plus élevée accélère l'apprentissage moteur et la progression.",
      ),
    );
  }

  // Filet de sécurité : jamais vide.
  if (recs.length === 0) {
    recs.push(
      mk(
        "augmenter_charge",
        2,
        "Applique la surcharge progressive : vise une répétition ou 2,5 kg de plus la prochaine fois.",
        "Le principe de surcharge progressive reste le moteur de toute progression durable.",
      ),
    );
  }

  return recs.sort((a, b) => a.priority - b.priority);
}
