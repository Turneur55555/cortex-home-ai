/**
 * Noms des pièces du Dressing — logique pure, zéro import React.
 *
 * Le nom proposé à l'ajout était `${type} ${couleur}` sans accord
 * (« Chemise blanc », « Chemise vert » : 5 pièces en production au
 * 03/11/2026). Ce module accorde la couleur au type : genre et nombre du
 * type précis (subcategory), couleurs composées et couleurs-noms
 * invariables (« bleu marine », « marron », « orange »).
 */
import { canonicalWardrobeColor, findSubcategory } from "./taxonomy";

type Gender = "m" | "f";

interface Grammar {
  gender: Gender;
  plural: boolean;
}

/** Types précis féminins et/ou pluriels ; tout le reste est masculin singulier. */
const GRAMMAR: Record<string, Grammar> = {
  chemise: { gender: "f", plural: false },
  veste: { gender: "f", plural: false },
  doudoune: { gender: "f", plural: false },
  parka: { gender: "f", plural: false },
  jupe: { gender: "f", plural: false },
  casquette: { gender: "f", plural: false },
  ceinture: { gender: "f", plural: false },
  montre: { gender: "f", plural: false },
  echarpe: { gender: "f", plural: false },
  sneakers: { gender: "f", plural: true },
  bottines: { gender: "f", plural: true },
  sandales: { gender: "f", plural: true },
  ville: { gender: "f", plural: true },
  mocassins: { gender: "m", plural: true },
};

export function grammarOf(subcategory: string | null | undefined): Grammar {
  return (subcategory && GRAMMAR[subcategory]) || { gender: "m", plural: false };
}

/** Formes accordées des couleurs simples : [f. sing., m. plur., f. plur.]. */
const COLOR_FORMS: Record<string, [string, string, string]> = {
  blanc: ["blanche", "blancs", "blanches"],
  noir: ["noire", "noirs", "noires"],
  vert: ["verte", "verts", "vertes"],
  gris: ["grise", "gris", "grises"],
  bleu: ["bleue", "bleus", "bleues"],
  violet: ["violette", "violets", "violettes"],
  beige: ["beige", "beiges", "beiges"],
  rouge: ["rouge", "rouges", "rouges"],
  jaune: ["jaune", "jaunes", "jaunes"],
  rose: ["rose", "roses", "roses"],
};

/**
 * Accorde une couleur canonique. Couleurs composées (« bleu marine »,
 * « gris foncé ») et couleurs-noms (« marron », « orange », « bordeaux »)
 * restent invariables.
 */
export function agreeColor(color: string, grammar: Grammar): string {
  const canonical = canonicalWardrobeColor(color) ?? color;
  const forms = COLOR_FORMS[canonical];
  if (!forms) return canonical;
  if (grammar.gender === "f") return grammar.plural ? forms[2] : forms[0];
  return grammar.plural ? forms[1] : canonical;
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Nom proposé pour une pièce : « Chemise blanche », « Sneakers noires », « Polo bleu marine ». */
export function suggestWardrobeName(
  subcategory: string | null | undefined,
  color: string | null | undefined,
): string | null {
  const def = findSubcategory(subcategory);
  if (!def) return null;
  if (!color) return capitalize(def.label);
  return capitalize(`${def.label} ${agreeColor(color, grammarOf(def.value))}`);
}
