// ============================================================
// Génération de texte en langage naturel (domaine pur, déterministe).
// Produit l'« analyse IA rédigée » et le « résumé intelligent » à partir de
// la fiche déjà calculée. Aucune dépendance réseau : instantané et hors-ligne.
// C'est le repli par défaut ; une IA optionnelle peut l'enrichir à la demande.
// ============================================================

import { OBJECTIVE_LABELS } from "./types";
import type {
  ComparisonReport,
  Imbalance,
  MuscleContribution,
  Recommendation,
  RelevanceScore,
  TraitImpact,
  TrainingObjective,
} from "./types";

export interface NarrativeInput {
  exerciseName: string;
  objective: TrainingObjective;
  isGenericModel: boolean;
  muscles: MuscleContribution[];
  physicalImpact: TraitImpact[];
  comparison: ComparisonReport;
  recommendations: Recommendation[];
  imbalances: Imbalance[];
  relevance: RelevanceScore;
}

function list(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return labels.slice(0, -1).join(", ") + " et " + labels[labels.length - 1];
}

/** Analyse rédigée (2-4 phrases). */
export function writeNarrative(a: NarrativeInput): string {
  const parts: string[] = [];

  const primaries = a.muscles.filter((m) => m.role === "primary").map((m) => m.label);
  const secondaries = a.muscles.filter((m) => m.role === "secondary").map((m) => m.label);

  if (a.isGenericModel || primaries.length === 0) {
    parts.push(
      `Cet exercice n'est pas dans notre référentiel : l'analyse s'appuie sur un modèle biomécanique générique et sur tes données réelles.`,
    );
  } else {
    const muscleSentence = `${a.exerciseName} sollicite principalement ${list(
      primaries,
    )}${secondaries.length ? `, avec ${list(secondaries)} en soutien` : ""}.`;
    parts.push(muscleSentence);
  }

  const topTraits = a.physicalImpact.slice(0, 3).map((t) => t.label.toLowerCase());
  if (topTraits.length > 0) {
    parts.push(
      `Pour ton objectif ${OBJECTIVE_LABELS[a.objective].toLowerCase()}, il développe surtout ${list(
        topTraits,
      )}.`,
    );
  }

  switch (a.comparison.state) {
    case "progression":
      parts.push(a.comparison.explanation);
      break;
    case "regression":
      parts.push(a.comparison.explanation);
      break;
    case "stagnation":
      parts.push(a.comparison.explanation);
      break;
    case "nouveau":
      parts.push(
        "C'est une nouvelle référence : les prochaines séances mesureront ta progression réelle.",
      );
      break;
  }

  const topRec = a.recommendations[0];
  if (topRec) {
    parts.push(`Prochaine étape conseillée : ${lowerFirst(topRec.text)}`);
  }

  return parts.join(" ");
}

/** Résumé intelligent : ce que la séance apporte réellement (quelques lignes). */
export function writeSmartSummary(a: NarrativeInput): string {
  const bits: string[] = [];

  const stars = "★".repeat(a.relevance.stars) + "☆".repeat(5 - a.relevance.stars);
  const relevanceWord =
    a.relevance.label === "essentiel"
      ? "un pilier"
      : a.relevance.label === "recommande"
        ? "un bon choix"
        : a.relevance.label === "secondaire"
          ? "un complément"
          : "un exercice accessoire";

  bits.push(`${stars} — ${relevanceWord} pour ta progression actuelle.`);

  if (a.comparison.prsBroken.length > 0) {
    bits.push(`Record(s) battu(s) : ${a.comparison.prsBroken.join(" · ")}. Beau travail.`);
  } else if (a.comparison.state === "progression") {
    bits.push("Séance en progression : tu avances dans la bonne direction.");
  } else if (a.comparison.state === "stagnation") {
    bits.push("Séance de maintien : le stimulus se tasse, il est temps de varier une contrainte.");
  } else if (a.comparison.state === "regression") {
    bits.push("Séance en dessous de tes standards : priorité à la récupération et à la technique.");
  }

  const warnings = a.imbalances.filter((i) => i.severity !== "info");
  if (warnings.length > 0) {
    bits.push(warnings[0].text + " " + warnings[0].recommendation);
  } else {
    bits.push("Aucun déséquilibre majeur détecté sur cet exercice.");
  }

  return bits.join(" ");
}

function lowerFirst(s: string): string {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}
