import { describe, expect, it } from "vitest";
import { detectWardrobeFixes, remainingDuplicateNames, type QualityItem } from "./dataQuality";
import { agreeColor, suggestWardrobeName } from "./naming";

function item(id: string, patch: Partial<QualityItem>): QualityItem {
  return {
    id,
    name: null,
    brand: null,
    category: "top",
    subcategory: "tshirt",
    primary_color: "noir",
    secondary_colors: [],
    material: "coton",
    pattern: "uni",
    seasons: ["printemps", "ete", "automne"],
    ...patch,
  };
}

/** Les pièces réelles du dressing de production (03/11/2026) concernées. */
const REAL: QualityItem[] = [
  item("chemise-blanc-coton", {
    name: "Chemise blanc",
    subcategory: "chemise",
    primary_color: "blanc",
    pattern: "texture",
  }),
  item("chemise-blanc-lin", {
    name: "Chemise blanc",
    subcategory: "chemise",
    primary_color: "blanc",
    material: "lin",
    pattern: "texture",
  }),
  item("chemise-vert-texture", {
    name: "Chemise vert",
    subcategory: "chemise",
    primary_color: "vert",
    pattern: "texture",
  }),
  item("chemise-vert-uni", { name: "Chemise vert", subcategory: "chemise", primary_color: "vert" }),
  item("chemise-noir", { name: "Chemise noir", subcategory: "chemise", primary_color: "noir" }),
  item("chemise-gris-fonce", {
    name: "Chemise gris foncé",
    subcategory: "chemise",
    primary_color: "gris foncé",
    brand: "The koople",
  }),
  item("polo-fp", {
    name: "Polo noir",
    brand: "Fred Perry",
    subcategory: "polo",
    primary_color: "blanc",
    secondary_colors: ["noir"],
    pattern: "logo",
  }),
  item("polo-noir-logo", { name: "Polo noir", subcategory: "polo", pattern: "logo" }),
  item("polo-noir-koople", { name: "Polo noir", subcategory: "polo", brand: "The koople" }),
  item("polo-marine-jaune", {
    name: "Polo bleu marine",
    subcategory: "polo",
    primary_color: "bleu marine",
    secondary_colors: ["jaune"],
  }),
  item("polo-marine-blanc", {
    name: "Polo bleu marine",
    subcategory: "polo",
    primary_color: "bleu marine",
    secondary_colors: ["blanc"],
  }),
  item("polo-vert", { name: "Polo", subcategory: "polo", primary_color: "vert" }),
  item("tshirt-blanc", {
    name: "T shirt blanc",
    brand: "Uniqlo",
    primary_color: "blanc",
    seasons: [],
  }),
  item("tshirt-noir", { name: "T shirt noir", seasons: [] }),
  item("jogging-vert", {
    name: "Jogging vert",
    category: "bottom",
    subcategory: "pantalon",
    primary_color: "vert",
  }),
  item("short-noir", {
    name: "Short noir",
    category: "bottom",
    subcategory: "short",
    material: "denim",
  }),
  item("shorts-zara", {
    name: "Shorts",
    brand: "Zara",
    category: "bottom",
    subcategory: "short",
    material: "lin",
  }),
  item("pantalon-beige", {
    name: "Pantalon beige",
    category: "bottom",
    subcategory: "pantalon",
    primary_color: "beige",
  }),
];

const byKey = (key: string) => detectWardrobeFixes(REAL).find((f) => f.key === key);

describe("naming — accord de la couleur", () => {
  it("accorde au féminin, au pluriel, et laisse les composées invariables", () => {
    expect(suggestWardrobeName("chemise", "blanc")).toBe("Chemise blanche");
    expect(suggestWardrobeName("chemise", "vert")).toBe("Chemise verte");
    expect(suggestWardrobeName("sneakers", "noir")).toBe("Sneakers noires");
    expect(suggestWardrobeName("mocassins", "marron")).toBe("Mocassins marron");
    expect(suggestWardrobeName("chemise", "bleu marine")).toBe("Chemise bleu marine");
    expect(suggestWardrobeName("polo", "noir")).toBe("Polo noir");
    expect(suggestWardrobeName("tshirt", "Blanche")).toBe("T-shirt blanc");
    expect(suggestWardrobeName("chemise", null)).toBe("Chemise");
    expect(suggestWardrobeName("inconnu", "noir")).toBeNull();
    expect(agreeColor("gris", { gender: "f", plural: false })).toBe("grise");
  });
});

describe("detectWardrobeFixes — dressing réel", () => {
  it("accorde les noms générés et départage les doublons", () => {
    expect(byKey("name:chemise-blanc-coton")?.patch).toEqual({ name: "Chemise blanche" });
    expect(byKey("name:chemise-blanc-lin")?.patch).toEqual({ name: "Chemise blanche en lin" });
    expect(byKey("name:chemise-vert-texture")?.patch).toEqual({ name: "Chemise verte texturée" });
    expect(byKey("name:chemise-vert-uni")?.patch).toEqual({ name: "Chemise verte" });
    expect(byKey("name:chemise-noir")?.patch).toEqual({ name: "Chemise noire" });
    expect(byKey("name:chemise-gris-fonce")).toBeUndefined();
  });

  it("corrige l'orthographe et les noms génériques", () => {
    expect(byKey("name:tshirt-blanc")?.patch).toEqual({ name: "T-shirt blanc" });
    expect(byKey("name:polo-vert")?.patch).toEqual({ name: "Polo vert" });
    expect(byKey("name:shorts-zara")?.patch).toEqual({ name: "Short noir Zara" });
    expect(byKey("name:short-noir")).toBeUndefined();
    expect(byKey("name:pantalon-beige")).toBeUndefined();
  });

  it("pose une question quand le nom contredit la couleur, sans rien renommer en masse", () => {
    const fix = byKey("color:polo-fp");
    expect(fix?.patch).toBeNull();
    expect(fix?.choices.map((c) => c.label)).toEqual(["Noir", "Blanc"]);
    expect(fix?.choices[0].patch).toEqual({ primary_color: "noir", secondary_colors: ["blanc"] });
    expect(fix?.choices[1].patch).toEqual({ name: "Polo blanc" });
    expect(byKey("name:polo-fp")).toBeUndefined();
  });

  it("départage les polos au même nom (marque, puis couleur secondaire)", () => {
    expect(byKey("name:polo-noir-koople")?.patch).toEqual({ name: "Polo noir The koople" });
    expect(byKey("name:polo-noir-logo")).toBeUndefined();
    expect(byKey("name:polo-marine-jaune")?.patch).toEqual({ name: "Polo bleu marine et jaune" });
    expect(byKey("name:polo-marine-blanc")?.patch).toEqual({ name: "Polo bleu marine et blanc" });
  });

  it("range le jogging en jogging et complète les saisons vides", () => {
    expect(byKey("subcategory:jogging-vert")?.patch).toEqual({ subcategory: "jogging" });
    expect(byKey("name:jogging-vert")).toBeUndefined();
    expect(byKey("seasons:tshirt-noir")?.patch).toEqual({
      seasons: ["printemps", "ete", "automne", "hiver"],
    });
  });

  it("ne propose plus rien une fois les corrections appliquées", () => {
    const fixed = REAL.map((i) => {
      const patches = detectWardrobeFixes(REAL)
        .filter((f) => f.itemId === i.id)
        .map((f) => f.patch ?? f.choices[0].patch);
      return Object.assign({}, i, ...patches) as QualityItem;
    });
    const left = detectWardrobeFixes(fixed);
    // Le polo Fred Perry, déclaré noir, rejoint les polos noirs : seul le nom reste à départager.
    expect(left.map((f) => f.key)).toEqual(["name:polo-fp"]);
    expect(left[0].patch).toEqual({ name: "Polo noir Fred Perry" });
    expect(remainingDuplicateNames(fixed)).toEqual([]);
  });

  it("respecte un nom personnalisé", () => {
    const fixes = detectWardrobeFixes([item("a", { name: "Mon t-shirt du dimanche" })]);
    expect(fixes).toEqual([]);
  });
});

describe("itemsWithoutCutout", () => {
  it("ne garde que les photos pas encore détourées", async () => {
    const { itemsWithoutCutout } = await import("./dataQuality");
    const rows = [
      { id: "a", storage_path: "u/a/original.jpg", processed_storage_path: null },
      { id: "b", storage_path: "u/b/original.jpg", processed_storage_path: "u/b/processed.webp" },
      { id: "c", storage_path: null, processed_storage_path: null },
    ];
    expect(itemsWithoutCutout(rows).map((r) => r.id)).toEqual(["a"]);
  });
});
