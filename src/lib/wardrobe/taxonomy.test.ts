import { describe, expect, it } from "vitest";
import {
  WARDROBE_DB_CATEGORY_BY_UI,
  WARDROBE_SLEEVE_LENGTH_OPTIONS,
  WARDROBE_SUBCATEGORIES,
  WARDROBE_UI_CATEGORY_BY_DB,
  WARDROBE_USAGE_OPTIONS,
  findSubcategory,
  getCharacteristicsConfig,
  getSizeConfig,
  getSubcategoriesForCategory,
  hasAnyCharacteristic,
} from "./taxonomy";

describe("WARDROBE_DB_CATEGORY_BY_UI / WARDROBE_UI_CATEGORY_BY_DB", () => {
  it("sont l'inverse l'un de l'autre pour les 5 catégories", () => {
    for (const [ui, db] of Object.entries(WARDROBE_DB_CATEGORY_BY_UI)) {
      expect(WARDROBE_UI_CATEGORY_BY_DB[db]).toBe(ui);
    }
  });
});

describe("findSubcategory", () => {
  it("retrouve une sous-catégorie par sa valeur canonique", () => {
    expect(findSubcategory("running")?.label).toBe("Running");
  });

  it("retourne null pour une valeur inconnue ou vide", () => {
    expect(findSubcategory("inexistant")).toBeNull();
    expect(findSubcategory(null)).toBeNull();
    expect(findSubcategory(undefined)).toBeNull();
  });
});

describe("getSubcategoriesForCategory", () => {
  it("ne retourne que des sous-catégories de la catégorie demandée", () => {
    for (const category of ["tops", "bottoms", "outerwear", "shoes", "accessories"] as const) {
      const subs = getSubcategoriesForCategory(category);
      expect(subs.length).toBeGreaterThan(0);
      expect(subs.every((s) => s.category === category)).toBe(true);
    }
  });
});

describe("getCharacteristicsConfig — aucun champ non pertinent", () => {
  it("aucune catégorie n'active un champ qu'elle ne devrait pas afficher", () => {
    // Exemple explicite de la mission : aucun champ "manches" sur un pantalon.
    expect(getCharacteristicsConfig("bottoms").sleeveLength).toBe(false);
  });

  it("toutes les catégories ont au moins un attribut pertinent en Caractéristiques", () => {
    for (const category of ["tops", "bottoms", "outerwear", "shoes", "accessories"] as const) {
      expect(hasAnyCharacteristic(getCharacteristicsConfig(category))).toBe(true);
    }
  });
});

describe("getSizeConfig", () => {
  it("chaque catégorie a un mode de taille et au moins une option", () => {
    for (const category of ["tops", "bottoms", "outerwear", "shoes", "accessories"] as const) {
      const config = getSizeConfig(category);
      expect(config.options.length).toBeGreaterThan(0);
      expect(config.allowCustom).toBe(true);
    }
  });

  it("la pointure va de 35 à 48", () => {
    const shoes = getSizeConfig("shoes");
    expect(shoes.options[0]).toBe("35");
    expect(shoes.options.at(-1)).toBe("48");
  });
});

describe("WARDROBE_USAGE_OPTIONS / WARDROBE_SLEEVE_LENGTH_OPTIONS", () => {
  it("expose exactement les 4 usages attendus (Sport n'est jamais une catégorie)", () => {
    expect(WARDROBE_USAGE_OPTIONS.map((o) => o.value)).toEqual([
      "quotidien",
      "sport",
      "habille",
      "baignade",
    ]);
  });

  it("expose exactement les 3 longueurs de manches attendues", () => {
    expect(WARDROBE_SLEEVE_LENGTH_OPTIONS.map((o) => o.value)).toEqual([
      "sans_manches",
      "courtes",
      "longues",
    ]);
  });
});

describe("WARDROBE_SUBCATEGORIES — pas de doublons", () => {
  it("chaque valeur de sous-catégorie est unique", () => {
    const values = WARDROBE_SUBCATEGORIES.map((s) => s.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
