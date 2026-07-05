// ============================================================
// Classification d'un exercice en famille (domaine pur).
// Même approche que exerciseDifficulty() historique, mais mappée
// vers une famille plutôt qu'un coefficient brut.
// ============================================================

import { normalize } from "../exerciseCatalog";
import type { ExerciseFamily } from "./types";

interface FamilyRule {
  pattern: RegExp;
  family: ExerciseFamily;
}

const FAMILY_RULES: FamilyRule[] = [
  {
    pattern: /\bsquat\b|hack squat|front squat|goblet|presse.?(a|à).?cuisses|leg press|fentes?|lunge/,
    family: "squat_presse_jambes",
  },
  { pattern: /soulev(e|é) de terre|deadlift/, family: "deadlift_tirage_hanche" },
  {
    pattern: /d(e|é)velopp(e|é) couch(e|é)|bench press|pompes?|push.?up|chest press/,
    family: "developpe_couche",
  },
  {
    pattern: /d(e|é)velopp(e|é) militaire|overhead press|d(e|é)velopp(e|é) nuque|d(e|é)velopp(e|é) (e|é)paules?/,
    family: "developpe_militaire",
  },
  { pattern: /traction|pull ?up|chin ?up|\bdips?\b/, family: "poids_de_corps" },
  { pattern: /tirage|rowing|\brow\b/, family: "tirage_traction_dos" },
  {
    pattern:
      /curl|extension|(e|é)cart(e|é)|(e|é)l(e|é)vation|kickback|pull ?over|shrug|crunch|leg raise|mollets?|\bcalf\b/,
    family: "isolation",
  },
];

export function classifyExerciseFamily(name: string): ExerciseFamily {
  const n = normalize(name);
  for (const rule of FAMILY_RULES) {
    if (rule.pattern.test(n)) return rule.family;
  }
  return "isolation"; // repli prudent : le barème le plus conservateur
}
