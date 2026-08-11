import { describe, expect, it } from "vitest";
import { colorPairScore, generateOutfits, type OutfitScoringItem } from "./outfitEngine";

function makeItem(overrides: Partial<OutfitScoringItem> & { id: string }): OutfitScoringItem {
  return {
    category: "top",
    subcategory: null,
    primary_color: null,
    secondary_colors: [],
    pattern: null,
    material: null,
    fit: null,
    formality: null,
    seasons: [],
    usage: [],
    ...overrides,
  };
}

const TSHIRT_NOIR = makeItem({
  id: "top-1",
  category: "top",
  subcategory: "tshirt",
  primary_color: "noir",
  pattern: "uni",
  formality: "casual",
  usage: ["quotidien"],
});
const JEAN_BLEU = makeItem({
  id: "bottom-1",
  category: "bottom",
  subcategory: "jean",
  primary_color: "bleu",
  pattern: "uni",
  formality: "casual",
  usage: ["quotidien"],
});
const SNEAKERS_BLANCHES = makeItem({
  id: "shoes-1",
  category: "shoes",
  subcategory: "sneakers",
  primary_color: "blanc",
  pattern: "uni",
  formality: "casual",
  usage: ["quotidien"],
});
const CHEMISE_HABILLEE = makeItem({
  id: "top-2",
  category: "top",
  subcategory: "chemise",
  primary_color: "blanc",
  pattern: "uni",
  formality: "smart_casual",
  usage: ["habille"],
});
const PANTALON_HABILLE = makeItem({
  id: "bottom-2",
  category: "bottom",
  subcategory: "pantalon",
  primary_color: "noir",
  pattern: "uni",
  formality: "formal",
  usage: ["habille"],
});
const CHAUSSURES_VILLE = makeItem({
  id: "shoes-2",
  category: "shoes",
  subcategory: "ville",
  primary_color: "noir",
  pattern: "uni",
  formality: "formal",
  usage: ["habille"],
});
const RUNNING = makeItem({
  id: "shoes-3",
  category: "shoes",
  subcategory: "running",
  primary_color: "gris",
  formality: "sport",
  usage: ["sport"],
});
const JOGGING = makeItem({
  id: "bottom-3",
  category: "bottom",
  subcategory: "jogging",
  primary_color: "gris",
  formality: "sport",
  usage: ["sport"],
});
const TSHIRT_SPORT = makeItem({
  id: "top-3",
  category: "top",
  subcategory: "tshirt",
  primary_color: "noir",
  formality: "sport",
  usage: ["sport"],
});
const SHORT_BAIN = makeItem({
  id: "bottom-4",
  category: "bottom",
  subcategory: "short_bain",
  primary_color: "bleu",
  usage: ["baignade"],
});
const HAUT_BIKINI = makeItem({
  id: "top-4",
  category: "top",
  subcategory: "haut_bikini",
  primary_color: "bleu",
  usage: ["baignade"],
});
const MAILLOT_UNE_PIECE = makeItem({
  id: "top-5",
  category: "top",
  subcategory: "maillot_une_piece",
  primary_color: "noir",
  usage: ["baignade"],
});
const VESTE = makeItem({
  id: "outer-1",
  category: "outerwear",
  subcategory: "veste",
  primary_color: "noir",
  formality: "smart_casual",
  usage: ["quotidien", "habille"],
});

const FULL_WARDROBE: OutfitScoringItem[] = [
  TSHIRT_NOIR,
  JEAN_BLEU,
  SNEAKERS_BLANCHES,
  CHEMISE_HABILLEE,
  PANTALON_HABILLE,
  CHAUSSURES_VILLE,
  RUNNING,
  JOGGING,
  TSHIRT_SPORT,
  SHORT_BAIN,
  HAUT_BIKINI,
  MAILLOT_UNE_PIECE,
  VESTE,
];

describe("colorPairScore", () => {
  it("les neutres sont toujours compatibles", () => {
    expect(colorPairScore("noir", "blanc")).toBeGreaterThanOrEqual(0.9);
  });

  it("même couleur => score maximal", () => {
    expect(colorPairScore("bleu", "bleu")).toBe(1);
  });

  it("même famille (bleu / bleu marine) => score élevé", () => {
    expect(colorPairScore("bleu", "bleu marine")).toBeGreaterThanOrEqual(0.7);
  });

  it("couleurs éloignées => score plus faible (clash)", () => {
    expect(colorPairScore("rouge", "vert")).toBeLessThan(0.6);
  });

  it("couleur manquante => score neutre par défaut, jamais 0", () => {
    expect(colorPairScore(null, "rouge")).toBeGreaterThan(0);
  });
});

describe("generateOutfits — déterminisme", () => {
  it("mêmes pièces + même contexte => même score, dans le même ordre, à chaque appel", () => {
    const first = generateOutfits(FULL_WARDROBE, "quotidien");
    const second = generateOutfits(FULL_WARDROBE, "quotidien");
    expect(first).toEqual(second);
  });

  it("l'ordre des pièces en entrée ne change pas le résultat", () => {
    const shuffled = [...FULL_WARDROBE].reverse();
    const a = generateOutfits(FULL_WARDROBE, "quotidien");
    const b = generateOutfits(shuffled, "quotidien");
    expect(a).toEqual(b);
  });
});

describe("generateOutfits — plusieurs tenues, uniquement des pièces réelles", () => {
  it("génère plusieurs tenues (pas une seule) quand le dressing le permet", () => {
    const result = generateOutfits(FULL_WARDROBE, "quotidien");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outfits.length).toBeGreaterThan(1);
    }
  });

  it("chaque pièce utilisée existe bien dans le dressing fourni (jamais d'ID halluciné)", () => {
    const result = generateOutfits(FULL_WARDROBE, "quotidien");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const knownIds = new Set(FULL_WARDROBE.map((i) => i.id));
    for (const outfit of result.outfits) {
      for (const item of outfit.items) {
        expect(knownIds.has(item.id)).toBe(true);
      }
    }
  });

  it("chaque score est un entier entre 0 et 100", () => {
    const result = generateOutfits(FULL_WARDROBE, "quotidien");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const outfit of result.outfits) {
      expect(Number.isInteger(outfit.score)).toBe(true);
      expect(outfit.score).toBeGreaterThanOrEqual(0);
      expect(outfit.score).toBeLessThanOrEqual(100);
    }
  });

  it("chaque tenue a une explication courte non vide construite à partir des critères", () => {
    const result = generateOutfits(FULL_WARDROBE, "quotidien");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const outfit of result.outfits) {
      expect(outfit.explanation.length).toBeGreaterThan(0);
      expect(outfit.explanation.length).toBeLessThan(200);
    }
  });

  it("respecte maxResults", () => {
    const result = generateOutfits(FULL_WARDROBE, "quotidien", { maxResults: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.outfits).toHaveLength(1);
  });
});

describe("generateOutfits — compatibilité de catégorie", () => {
  it("une tenue complète contient toujours un haut, un bas et des chaussures (contexte standard)", () => {
    const result = generateOutfits(FULL_WARDROBE, "quotidien");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const outfit of result.outfits) {
      const categories = outfit.items.map((i) => i.category);
      expect(categories).toContain("top");
      expect(categories).toContain("bottom");
      expect(categories).toContain("shoes");
    }
  });

  it("aucun haut disponible => message clair, jamais de tenue fabriquée", () => {
    const noTops = FULL_WARDROBE.filter((i) => i.category !== "top");
    const result = generateOutfits(noTops, "quotidien");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/haut/);
  });

  it("aucune chaussure disponible => message clair", () => {
    const noShoes = FULL_WARDROBE.filter((i) => i.category !== "shoes");
    const result = generateOutfits(noShoes, "quotidien");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/chaussures/);
  });

  it("dressing complètement vide => message clair, jamais de crash", () => {
    const result = generateOutfits([], "quotidien");
    expect(result.ok).toBe(false);
  });
});

describe("generateOutfits — compatibilité d'usage", () => {
  it("ne propose jamais de maillot de bain pour Travail", () => {
    const result = generateOutfits(FULL_WARDROBE, "travail");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const outfit of result.outfits) {
      expect(outfit.items.some((i) => i.usage.includes("baignade"))).toBe(false);
    }
  });

  it("ne propose jamais de chaussures de running pour Soirée", () => {
    const result = generateOutfits(FULL_WARDROBE, "soiree");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const outfit of result.outfits) {
      expect(outfit.items.some((i) => i.subcategory === "running")).toBe(false);
    }
  });

  it("préfère les pièces taguées Sport pour le contexte Sport", () => {
    const result = generateOutfits(FULL_WARDROBE, "sport");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const best = result.outfits[0];
    expect(best.items.some((i) => i.usage.includes("sport"))).toBe(true);
  });

  it("préfère les pièces taguées Baignade pour le contexte Baignade", () => {
    const result = generateOutfits(FULL_WARDROBE, "baignade");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const outfit of result.outfits) {
      expect(outfit.items.some((i) => i.category === "top" && i.usage.includes("baignade"))).toBe(
        true,
      );
    }
  });
});

describe("generateOutfits — contexte Baignade (cas particulier maillot une pièce)", () => {
  it("un maillot une pièce seul forme une tenue valide sans bas obligatoire", () => {
    const onePieceOnly: OutfitScoringItem[] = [MAILLOT_UNE_PIECE];
    const result = generateOutfits(onePieceOnly, "baignade");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outfits[0].items.map((i) => i.id)).toContain(MAILLOT_UNE_PIECE.id);
  });

  it("un haut de bikini sans bas de bain compatible => pas de tenue hallucinée", () => {
    const bikiniTopOnly: OutfitScoringItem[] = [HAUT_BIKINI, TSHIRT_NOIR, JEAN_BLEU];
    const result = generateOutfits(bikiniTopOnly, "baignade");
    expect(result.ok).toBe(false);
  });

  it("bikini haut + bas => tenue générée avec les deux pièces réelles", () => {
    const bikini: OutfitScoringItem[] = [HAUT_BIKINI, SHORT_BAIN];
    const result = generateOutfits(bikini, "baignade");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.outfits[0].items.map((i) => i.id);
    expect(ids).toContain(HAUT_BIKINI.id);
    expect(ids).toContain(SHORT_BAIN.id);
  });
});

describe("generateOutfits — compatibilité de formalité", () => {
  it("privilégie une formalité cohérente pour Soirée (score de formalité élevé sur la meilleure tenue)", () => {
    const result = generateOutfits(FULL_WARDROBE, "soiree");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outfits[0].breakdown.formality).toBeGreaterThan(0.6);
  });

  it("n'exclut jamais une pièce formelle du contexte Travail", () => {
    const result = generateOutfits(FULL_WARDROBE, "travail");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const allItems = result.outfits.flatMap((o) => o.items);
    expect(allItems.some((i) => i.formality === "formal")).toBe(true);
  });
});

describe("generateOutfits — cohérence des couleurs (déterministe)", () => {
  it("une tenue noir/blanc (neutres) obtient un score couleur élevé", () => {
    const result = generateOutfits([TSHIRT_NOIR, JEAN_BLEU, SNEAKERS_BLANCHES], "quotidien");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outfits[0].breakdown.color).toBeGreaterThanOrEqual(0.75);
  });
});

describe("generateOutfits — build outfit around this item (anchorItemId)", () => {
  it("toutes les tenues générées contiennent la pièce ancrée", () => {
    const result = generateOutfits(FULL_WARDROBE, "quotidien", { anchorItemId: TSHIRT_NOIR.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const outfit of result.outfits) {
      expect(outfit.items.map((i) => i.id)).toContain(TSHIRT_NOIR.id);
    }
  });

  it("une pièce ancrée incompatible avec le contexte (filtrée par les règles) => message clair", () => {
    // Le running est hard-exclu du contexte Soirée : pas de résultat halluciné.
    const result = generateOutfits(FULL_WARDROBE, "soiree", { anchorItemId: RUNNING.id });
    expect(result.ok).toBe(false);
  });
});
