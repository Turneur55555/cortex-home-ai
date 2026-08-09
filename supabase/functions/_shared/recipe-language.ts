// Règle de langue du pipeline d'import de recettes (Instagram et futures
// sources) : la fiche affichée dans Cortex est TOUJOURS en français.
//
// Ce module est volontairement pur (aucun appel réseau) : il détecte la langue
// des signaux textuels du post (légende + transcription) et construit la
// directive de langue injectée dans le prompt IA existant (recipe-parser.ts).
// Il n'y a donc qu'UN SEUL pipeline IA : la traduction est faite par le même
// appel qui reconstitue la recette, jamais par un second passage.
//
// Invariants produit :
// - contenu déjà en français -> aucune traduction, texte conservé tel quel ;
// - autre langue -> traduction naturelle en français avant affichage ;
// - la légende ORIGINALE (`originalCaption` / `source_description`) n'est
//   jamais traduite ni écrasée (voir nutrition-engine.ts, passthrough) ;
// - marques, @utilisateurs, noms propres et #hashtags restent en VO ;
// - les quantités ne changent JAMAIS de valeur ; seules les unités étrangères
//   (oz, lb, cup, °F...) sont converties vers les unités Cortex (g, ml, °C).

export type DetectedLanguage = "fr" | "en" | "es" | "unknown";

/** Mots très fréquents et discriminants par langue (accents retirés côté comparaison). */
const MARKERS: Record<Exclude<DetectedLanguage, "unknown">, readonly string[]> = {
  fr: [
    "recette", "ingredients", "cuillere", "melange", "melanger", "poulet", "oeufs", "oeuf",
    "avec", "dans", "pour", "puis", "ensuite", "jusqu", "sel", "poivre", "beurre", "creme",
    "pate", "cuisson", "preparation", "four", "faire", "chaud", "froid", "des", "une", "les",
  ],
  en: [
    "recipe", "ingredients", "tablespoon", "teaspoon", "cup", "cups", "chicken", "eggs", "egg",
    "with", "and", "then", "until", "salt", "pepper", "butter", "cream", "dough", "bake",
    "baking", "oven", "make", "add", "the", "this", "your", "high", "protein",
  ],
  es: [
    "receta", "ingredientes", "cucharada", "cucharadita", "taza", "pollo", "huevos", "huevo",
    "con", "para", "luego", "hasta", "sal", "pimienta", "mantequilla", "crema", "masa",
    "horno", "hacer", "anadir", "los", "las", "una", "muy", "sartén", "sarten",
  ],
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@#]+/g, " ")
    .trim();
}

/**
 * Détecte la langue dominante d'un contenu (légende, transcription...).
 * Heuristique volontairement simple : elle sert à donner un indice à l'IA,
 * jamais à décider seule (le prompt demande à l'IA de retraduire si besoin).
 */
export function detectLanguage(...texts: Array<string | null | undefined>): DetectedLanguage {
  const words = normalize(texts.filter(Boolean).join(" "))
    .split(" ")
    // les @mentions et #hashtags ne renseignent pas sur la langue du texte
    .filter((w) => w.length > 1 && !w.startsWith("@") && !w.startsWith("#"));
  if (words.length === 0) return "unknown";

  const set = new Set(words);
  const scores = (Object.keys(MARKERS) as Array<Exclude<DetectedLanguage, "unknown">>).map((lang) => {
    let score = 0;
    for (const marker of MARKERS[lang]) if (set.has(marker)) score += 1;
    return { lang, score };
  });

  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (!best || best.score === 0) return "unknown";
  if (second && best.score === second.score) return "unknown";
  return best.lang;
}

/** `true` si le contenu ne nécessite aucune traduction. */
export function isFrenchContent(...texts: Array<string | null | undefined>): boolean {
  return detectLanguage(...texts) === "fr";
}

/**
 * Directive de langue injectée dans le prompt IA existant.
 * Toujours présente (même en français) pour garantir une fiche 100 % française.
 */
export function buildLanguageDirective(detected: DetectedLanguage, reinforce = false): string {
  const base = [
    "RÈGLE DE LANGUE (obligatoire) : la fiche finale doit être INTÉGRALEMENT en français " +
      "(titre, ingrédients, unités, notes, résumé, tags de texte libre).",
    "Ne modifie JAMAIS les valeurs numériques (quantités, poids, macros, durées) en traduisant.",
    "Convertis les unités étrangères vers les unités utilisées par Cortex : oz/lb -> g, cup/fl oz/pint -> ml, °F -> °C. " +
      "La conversion doit rester fidèle à la quantité d'origine.",
    "Conserve en version originale : marques, @utilisateurs, noms propres et #hashtags.",
    "Ne réécris jamais la légende originale du post : elle est conservée séparément côté application.",
  ];

  if (detected === "fr") {
    base.unshift("Le contenu source est déjà en français : NE TRADUIS PAS, conserve la formulation d'origine.");
  } else if (detected === "unknown") {
    base.unshift(
      "Langue du contenu source non identifiée : détecte-la toi-même. Si elle est française, ne traduis pas ; " +
        "sinon, traduis naturellement en français.",
    );
  } else {
    const label = detected === "en" ? "anglais" : "espagnol";
    base.unshift(
      `Le contenu source est en ${label} : traduis-le naturellement en français (pas de traduction littérale).`,
    );
  }

  if (reinforce) {
    base.push(
      "RAPPEL CRITIQUE : la tentative précédente a laissé du texte NON FRANÇAIS dans la fiche " +
        '(ex. "Carrots", "Olive Oil Spray", "Smoked Paprika", "Method", "Estimated per serve"). ' +
        "Aucun mot anglais ou espagnol ne doit subsister dans title, ingredients[].name, ingredients[].unit, " +
        "notes et ai_summary. Traduis chaque nom d'ingrédient (carrots -> carottes, olive oil spray -> spray " +
        "d'huile d'olive, smoked paprika -> paprika fumé) et chaque intitulé (method -> méthode, per serve -> " +
        "par portion), en gardant EXACTEMENT les mêmes valeurs numériques.",
    );
  }

  return base.join("\n");
}

// ─── Contrôle de conformité de la fiche PRODUITE (post-extraction) ───────────
// La directive ne suffit pas : on vérifie réellement que les champs GÉNÉRÉS
// par l'IA sont en français. La légende originale (`originalCaption`) n'est
// JAMAIS contrôlée ni modifiée — elle doit rester dans sa langue d'origine.

/**
 * Vocabulaire anglais/espagnol non ambigu (aucun de ces mots n'est un mot
 * français courant), suffisant pour détecter une fiche restée en VO.
 */
const NON_FRENCH_WORDS: ReadonlySet<string> = new Set([
  // anglais — structure / intitulés
  "method", "ingredients", "instructions", "directions", "steps", "serves", "serving", "servings",
  "estimated", "per", "the", "with", "and", "then", "until", "your", "make", "add", "mix", "stir",
  "bake", "baked", "baking", "cook", "cooked", "cooking", "oven", "heat", "high", "low", "protein",
  "calories", "fat", "carbs", "fiber", "recipe", "spray", "smoked", "chopped", "sliced", "diced",
  "grated", "boneless", "skinless", "fresh", "dried", "ground", "roasted", "grilled", "seasoning",
  // anglais — aliments
  "carrots", "carrot", "chicken", "beef", "pork", "shrimp", "eggs", "egg", "cheese", "butter",
  "cream", "milk", "flour", "sugar", "salt", "pepper", "garlic", "onion", "onions", "rice",
  "beans", "chickpeas", "spinach", "potatoes", "potato", "tomatoes", "tomato", "oil", "honey",
  "breast", "thighs", "noodles", "broth", "stock", "yogurt", "greek",
  // anglais — unités
  "tablespoon", "tablespoons", "teaspoon", "teaspoons", "cup", "cups", "ounce", "ounces", "pound",
  "pounds", "tbsp", "tsp", "oz", "lb", "lbs", "cloves", "clove", "slice", "slices", "pinch",
  // espagnol
  "receta", "ingredientes", "preparacion", "metodo", "pollo", "arroz", "huevos", "huevo", "queso",
  "mantequilla", "crema", "harina", "azucar", "cebolla", "ajo", "zanahoria", "zanahorias",
  "cucharada", "cucharadita", "taza", "tazas", "porciones", "sartén", "sarten", "horno", "hasta",
  "con", "para", "luego", "anadir", "mezclar",
]);

function nonFrenchTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  return normalize(text)
    .split(" ")
    .filter((w) => w.length > 1 && !w.startsWith("@") && !w.startsWith("#") && NON_FRENCH_WORDS.has(w));
}

/** Champs générés par l'IA, contrôlés pour la conformité de langue. */
export interface TranslatableRecipeFields {
  title: string;
  notes?: string | null;
  aiSummary?: string | null;
  ingredients: Array<{ name: string; unit?: string | null }>;
}

/** Liste (dédupliquée) des mots non français trouvés dans les champs générés. */
export function findNonFrenchTerms(fields: TranslatableRecipeFields): string[] {
  const found = new Set<string>();
  const push = (t: string | null | undefined) => nonFrenchTokens(t).forEach((w) => found.add(w));
  push(fields.title);
  push(fields.notes);
  push(fields.aiSummary);
  for (const ing of fields.ingredients ?? []) {
    push(ing.name);
    push(ing.unit ?? null);
  }
  return [...found];
}

/** `true` si la fiche générée est réellement en français (hors légende originale). */
export function isFrenchExtraction(fields: TranslatableRecipeFields): boolean {
  return findNonFrenchTerms(fields).length === 0;
}

/**
 * Version de la RÈGLE DE LANGUE appliquée au pipeline. Toute entrée du cache
 * global écrite avec une version inférieure est considérée comme non conforme :
 * elle est ignorée à la lecture, réanalysée une fois par le pipeline courant,
 * puis remplacée par la version française (voir recipe-db.ts + migration
 * 20260829090000_recipe_import_cache_language_version.sql).
 *
 * v1 = directive de langue seule (pouvait laisser passer une fiche anglaise)
 * v2 = directive + contrôle réel de francisation avec ré-extraction renforcée
 */
export const LANGUAGE_RULE_VERSION = 2;

