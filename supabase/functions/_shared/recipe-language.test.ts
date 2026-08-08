import { describe, expect, it } from "vitest";
import { buildLanguageDirective, detectLanguage, isFrenchContent } from "./recipe-language.ts";
import { computeRecipeExtraction } from "./nutrition-engine.ts";

const FR_CAPTION =
  "Recette de poulet crémeux au parmesan 🍗 Ingrédients : 200 g de poulet, 2 cuillères de crème, du sel et du poivre. Faire cuire dans une poêle puis servir chaud. #recette @chef.paul";
const EN_CAPTION =
  "High protein chicken recipe 🍗 Ingredients: 2 cups of rice, 1 tablespoon of butter, salt and pepper. Bake in the oven then add the cream. #recipe @chef.paul";
const ES_CAPTION =
  "Receta de pollo con crema 🍗 Ingredientes: 2 tazas de arroz, 1 cucharada de mantequilla, sal y pimienta. Hacer en el horno y luego anadir la crema. #receta @chef.paul";

describe("detectLanguage", () => {
  it("détecte le français", () => {
    expect(detectLanguage(FR_CAPTION)).toBe("fr");
    expect(isFrenchContent(FR_CAPTION)).toBe(true);
  });

  it("détecte l'anglais", () => {
    expect(detectLanguage(EN_CAPTION)).toBe("en");
    expect(isFrenchContent(EN_CAPTION)).toBe(false);
  });

  it("détecte l'espagnol", () => {
    expect(detectLanguage(ES_CAPTION)).toBe("es");
    expect(isFrenchContent(ES_CAPTION)).toBe(false);
  });

  it("retourne 'unknown' sans signal textuel exploitable", () => {
    expect(detectLanguage(null, undefined)).toBe("unknown");
    expect(detectLanguage("@chef.paul #foodporn 🍗")).toBe("unknown");
  });
});

describe("buildLanguageDirective", () => {
  it("français : demande explicitement de NE PAS traduire", () => {
    const d = buildLanguageDirective("fr");
    expect(d).toContain("déjà en français");
    expect(d).toContain("NE TRADUIS PAS");
  });

  it("anglais et espagnol : demandent une traduction naturelle en français", () => {
    expect(buildLanguageDirective("en")).toContain("anglais");
    expect(buildLanguageDirective("en")).toContain("traduis-le naturellement en français");
    expect(buildLanguageDirective("es")).toContain("espagnol");
    expect(buildLanguageDirective("es")).toContain("traduis-le naturellement en français");
  });

  it("rappelle toujours les invariants : quantités, unités, VO, légende d'origine", () => {
    for (const lang of ["fr", "en", "es", "unknown"] as const) {
      const d = buildLanguageDirective(lang);
      expect(d).toContain("INTÉGRALEMENT en français");
      expect(d).toMatch(/Ne modifie JAMAIS les valeurs numériques/);
      expect(d).toContain("oz/lb -> g");
      expect(d).toContain("#hashtags");
      expect(d).toContain("Ne réécris jamais la légende originale");
    }
  });
});

describe("fiche finale — original conservé et quantités intactes", () => {
  const signals = { hasTranscript: true, hasCaption: true, hasImage: true };

  it("conserve la légende originale (source_description) sans la traduire", () => {
    const out = computeRecipeExtraction(
      { title: "Poulet à la crème", servings: 2, ingredients: [], per_serving: {} },
      null,
      signals,
      { originalCaption: EN_CAPTION, authorHandle: "@chef.paul" },
    );
    expect(out.originalCaption).toBe(EN_CAPTION);
    expect(out.authorHandle).toBe("@chef.paul");
  });

  it("ne modifie pas les quantités des ingrédients traduits", () => {
    const out = computeRecipeExtraction(
      {
        title: "Riz au beurre",
        servings: 2,
        ingredients: [
          { name: "Riz", quantity: 2, unit: "tasses", grams: 370, category: "Épicerie" },
          { name: "Beurre", quantity: 1, unit: "c. à soupe", grams: 14, category: "Produits laitiers" },
        ],
        per_serving: { calories: 420, proteins: 8, carbs: 70, fats: 12, fiber: 2 },
      },
      null,
      signals,
      { originalCaption: ES_CAPTION, authorHandle: null },
    );
    expect(out.ingredients[0]).toMatchObject({ quantity: 2, grams: 370 });
    expect(out.ingredients[1]).toMatchObject({ quantity: 1, grams: 14 });
    expect(out.perServing).toEqual({ calories: 420, proteins: 8, carbs: 70, fats: 12, fiber: 2 });
    expect(out.originalCaption).toBe(ES_CAPTION);
  });
});
