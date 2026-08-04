import { describe, expect, it } from "vitest";
import {
  WARDROBE_ADD_CATEGORIES,
  WARDROBE_CONFIDENCE_HIGH,
  WARDROBE_CONFIDENCE_MEDIUM,
  WARDROBE_DB_CATEGORY,
  WARDROBE_MAX_FILE_SIZE_BYTES,
  buildWardrobePrefill,
  extensionForMimeType,
  parseWardrobeAnalysisResponse,
  reconcileWardrobeColor,
  toUiCategory,
  validateWardrobePhotoFile,
  type WardrobeAnalysisResult,
} from "./useWardrobe";
import {
  WARDROBE_SUBCATEGORIES,
  findSubcategory,
  getCharacteristicsConfig,
  getSizeConfig,
  getSubcategoriesForCategory,
} from "@/lib/wardrobe/taxonomy";

function makeFile(type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], "photo", { type });
}

describe("WARDROBE_DB_CATEGORY / WARDROBE_ADD_CATEGORIES", () => {
  it("mappe chaque catégorie UI vers la valeur réelle de la contrainte DB (singulier)", () => {
    expect(WARDROBE_DB_CATEGORY).toEqual({
      tops: "top",
      bottoms: "bottom",
      outerwear: "outerwear",
      shoes: "shoes",
      accessories: "accessory",
    });
  });

  it("expose une option de formulaire par catégorie, alignée sur le mapping DB", () => {
    for (const option of WARDROBE_ADD_CATEGORIES) {
      expect(option.dbCategory).toBe(WARDROBE_DB_CATEGORY[option.key]);
    }
    expect(WARDROBE_ADD_CATEGORIES).toHaveLength(5);
  });

  it("les valeurs DB générées sont ré-interprétées correctement par toUiCategory", () => {
    for (const option of WARDROBE_ADD_CATEGORIES) {
      expect(toUiCategory(option.dbCategory)).toBe(option.key);
    }
  });
});

describe("validateWardrobePhotoFile", () => {
  it("accepte un JPEG de taille raisonnable", () => {
    const file = makeFile("image/jpeg", 1024);
    expect(validateWardrobePhotoFile(file)).toEqual({ ok: true });
  });

  it.each(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])(
    "accepte le format %s",
    (mime) => {
      expect(validateWardrobePhotoFile(makeFile(mime, 1024)).ok).toBe(true);
    },
  );

  it("rejette un format non supporté", () => {
    const file = makeFile("application/pdf", 1024);
    const result = validateWardrobePhotoFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Format non supporté/);
  });

  it("rejette un fichier trop volumineux (> 10 Mo)", () => {
    const file = makeFile("image/jpeg", WARDROBE_MAX_FILE_SIZE_BYTES + 1);
    const result = validateWardrobePhotoFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/volumineuse/);
  });

  it("accepte un fichier pile à la limite de taille", () => {
    const file = makeFile("image/jpeg", WARDROBE_MAX_FILE_SIZE_BYTES);
    expect(validateWardrobePhotoFile(file).ok).toBe(true);
  });
});

describe("extensionForMimeType", () => {
  it("retourne l'extension correspondant au MIME", () => {
    expect(extensionForMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForMimeType("image/png")).toBe("png");
    expect(extensionForMimeType("image/webp")).toBe("webp");
    expect(extensionForMimeType("image/heic")).toBe("heic");
    expect(extensionForMimeType("image/heif")).toBe("heif");
  });

  it("retombe sur jpg pour un MIME inconnu", () => {
    expect(extensionForMimeType("application/octet-stream")).toBe("jpg");
  });
});

function makeAnalysis(overrides: Partial<WardrobeAnalysisResult> = {}): WardrobeAnalysisResult {
  return {
    category: "top",
    category_confidence: 0.9,
    subcategory: "tshirt",
    subcategory_confidence: 0.9,
    primary_color: "Noir",
    primary_color_confidence: 0.9,
    secondary_colors: [],
    pattern: "uni",
    pattern_confidence: 0.8,
    material: "coton",
    material_confidence: 0.5,
    fit: "regular",
    fit_confidence: 0.6,
    formality: "casual",
    formality_confidence: 0.8,
    seasons: ["ete"],
    sleeve_length: "courtes",
    sleeve_length_confidence: 0.8,
    usage: ["quotidien"],
    usage_confidence: 0.8,
    description: "T-shirt noir uni.",
    ...overrides,
  };
}

describe("buildWardrobePrefill — seuils de confiance (Phase 4)", () => {
  it("préremplit normalement les champs à confiance haute, sans les marquer 'suggested'", () => {
    const prefill = buildWardrobePrefill(makeAnalysis());
    expect(prefill.category).toEqual({ value: "tops", suggested: false });
    expect(prefill.primaryColor).toEqual({ value: "noir", suggested: false });
    expect(prefill.name.value).toBe("T-shirt noir");
  });

  it("mappe chaque catégorie DB vers la bonne clé UI", () => {
    const cases: Array<[WardrobeAnalysisResult["category"], string]> = [
      ["top", "tops"],
      ["bottom", "bottoms"],
      ["outerwear", "outerwear"],
      ["shoes", "shoes"],
      ["accessory", "accessories"],
    ];
    for (const [dbCategory, uiKey] of cases) {
      const prefill = buildWardrobePrefill(makeAnalysis({ category: dbCategory }));
      expect(prefill.category.value).toBe(uiKey);
    }
  });

  it("préremplit mais marque 'suggested' un champ à confiance moyenne", () => {
    const mediumConfidence = (WARDROBE_CONFIDENCE_HIGH + WARDROBE_CONFIDENCE_MEDIUM) / 2;
    const prefill = buildWardrobePrefill(
      makeAnalysis({ primary_color_confidence: mediumConfidence }),
    );
    expect(prefill.primaryColor.value).toBe("noir");
    expect(prefill.primaryColor.suggested).toBe(true);
  });

  it("laisse vide un champ à confiance faible plutôt que de le préremplir agressivement", () => {
    const prefill = buildWardrobePrefill(
      makeAnalysis({ primary_color_confidence: WARDROBE_CONFIDENCE_MEDIUM - 0.01 }),
    );
    expect(prefill.primaryColor).toEqual({ value: null, suggested: false });
  });

  it("category à confiance faible reste vide (l'utilisateur choisit manuellement)", () => {
    const prefill = buildWardrobePrefill(makeAnalysis({ category_confidence: 0.1 }));
    expect(prefill.category.value).toBeNull();
  });

  it("expose toujours la description comme simple proposition, jamais comme vérité imposée", () => {
    const prefill = buildWardrobePrefill(makeAnalysis());
    expect(prefill.description).toBe("T-shirt noir uni.");
  });
});

describe("parseWardrobeAnalysisResponse — fallback manuel sur réponse invalide", () => {
  it("retourne l'analyse quand la réponse est valide", () => {
    const analysis = makeAnalysis();
    expect(parseWardrobeAnalysisResponse({ analysis })).toEqual(analysis);
  });

  it("lève une erreur si l'invoke Supabase a échoué (timeout/réseau)", () => {
    expect(() => parseWardrobeAnalysisResponse(null, { message: "Network error" })).toThrow(
      "Network error",
    );
  });

  it("lève l'erreur métier renvoyée par l'Edge Function (ex: limite atteinte)", () => {
    expect(() => parseWardrobeAnalysisResponse({ error: "Limite atteinte." })).toThrow(
      "Limite atteinte.",
    );
  });

  it("lève une erreur générique si la charge utile est vide", () => {
    expect(() => parseWardrobeAnalysisResponse({})).toThrow("Analyse impossible.");
  });

  it("lève une erreur si l'analyse est structurellement incomplète (anti-hallucination)", () => {
    expect(() => parseWardrobeAnalysisResponse({ analysis: { subcategory: "jean" } })).toThrow(
      "Analyse impossible.",
    );
  });

  it("lève une erreur si la réponse n'est pas un objet JSON exploitable", () => {
    expect(() => parseWardrobeAnalysisResponse(undefined)).toThrow("Analyse impossible.");
  });
});

describe("buildWardrobePrefill — Phase 4.1 (type précis, manches, usage)", () => {
  it("préremplit le type précis (subcategory) à partir du slug canonique retourné par l'IA", () => {
    const prefill = buildWardrobePrefill(makeAnalysis({ subcategory: "jean", category: "bottom" }));
    expect(prefill.subcategory).toEqual({ value: "jean", suggested: false });
  });

  it("ignore un type précis hors taxonomie plutôt que d'inventer une valeur (anti-hallucination)", () => {
    const prefill = buildWardrobePrefill(makeAnalysis({ subcategory: "vetement-improbable" }));
    expect(prefill.subcategory).toEqual({ value: null, suggested: false });
  });

  it("préremplit les manches à confiance haute", () => {
    const prefill = buildWardrobePrefill(makeAnalysis());
    expect(prefill.sleeveLength).toEqual({ value: "courtes", suggested: false });
  });

  it("préremplit l'usage (multi-valué) à confiance haute", () => {
    const prefill = buildWardrobePrefill(
      makeAnalysis({ usage: ["sport", "quotidien"], usage_confidence: 0.9 }),
    );
    expect(prefill.usage).toEqual({ value: ["sport", "quotidien"], suggested: false });
  });

  it("filtre les valeurs d'usage hors liste fermée", () => {
    const prefill = buildWardrobePrefill(
      makeAnalysis({ usage: ["sport", "n-importe-quoi"], usage_confidence: 0.9 }),
    );
    expect(prefill.usage.value).toEqual(["sport"]);
  });

  it("laisse l'usage vide si la confiance est faible", () => {
    const prefill = buildWardrobePrefill(makeAnalysis({ usage_confidence: 0.1 }));
    expect(prefill.usage).toEqual({ value: null, suggested: false });
  });
});

describe("reconcileWardrobeColor — non-régression : incohérence description vs primary_color", () => {
  it("corrige 'Noir' en 'gris foncé' quand la description mentionne explicitement une autre couleur (cas réel observé)", () => {
    const analysis = makeAnalysis({
      primary_color: "noir",
      primary_color_confidence: 0.9,
      description: "Short gris foncé uni.",
    });
    const reconciled = reconcileWardrobeColor(analysis);
    expect(reconciled.primary_color).toBe("gris foncé");
    expect(reconciled.primary_color_confidence).toBeLessThanOrEqual(0.6);
  });

  it("le préremplissage du formulaire reflète la couleur corrigée, pas la couleur structurée initiale", () => {
    const analysis = makeAnalysis({
      primary_color: "noir",
      primary_color_confidence: 0.9,
      description: "Short gris foncé uni.",
    });
    const prefill = buildWardrobePrefill(analysis);
    expect(prefill.primaryColor.value).toBe("gris foncé");
  });

  it("ne change rien quand description et primary_color sont déjà cohérents", () => {
    const analysis = makeAnalysis({ primary_color: "noir", description: "T-shirt noir uni." });
    expect(reconcileWardrobeColor(analysis)).toEqual(analysis);
  });

  it("ne change rien quand la description ne mentionne aucune couleur canonique", () => {
    const analysis = makeAnalysis({
      primary_color: "noir",
      description: "Pièce sans détail de couleur exploitable.",
    });
    expect(reconcileWardrobeColor(analysis)).toEqual(analysis);
  });

  it("distingue 'bleu marine' de 'bleu' (entrées multi-mots prioritaires)", () => {
    const analysis = makeAnalysis({
      primary_color: "bleu",
      description: "Pull bleu marine en laine.",
    });
    expect(reconcileWardrobeColor(analysis).primary_color).toBe("bleu marine");
  });
});

describe("taxonomie Dressing (Phase 4.1) — formulaire adaptatif", () => {
  it("chaque sous-catégorie référence une catégorie UI valide", () => {
    const validCategories = WARDROBE_ADD_CATEGORIES.map((c) => c.key);
    for (const sub of WARDROBE_SUBCATEGORIES) {
      expect(validCategories).toContain(sub.category);
    }
  });

  it("retrouve les sous-catégories d'une catégorie donnée", () => {
    const bottoms = getSubcategoriesForCategory("bottoms");
    expect(bottoms.map((s) => s.value)).toContain("jean");
    expect(bottoms.map((s) => s.value)).not.toContain("tshirt");
  });

  it("n'affiche jamais le champ 'manches' hors des hauts", () => {
    expect(getCharacteristicsConfig("bottoms").sleeveLength).toBe(false);
    expect(getCharacteristicsConfig("outerwear").sleeveLength).toBe(false);
    expect(getCharacteristicsConfig("shoes").sleeveLength).toBe(false);
    expect(getCharacteristicsConfig("accessories").sleeveLength).toBe(false);
    expect(getCharacteristicsConfig("tops").sleeveLength).toBe(true);
  });

  it("les chaussures et accessoires n'affichent ni coupe ni motif", () => {
    expect(getCharacteristicsConfig("shoes")).toMatchObject({ fit: false, pattern: false });
    expect(getCharacteristicsConfig("accessories")).toMatchObject({ fit: false, pattern: false });
  });

  it("taille adaptative : hauts/vestes en lettres, bas en EU/W, chaussures en pointure, accessoires en taille unique", () => {
    expect(getSizeConfig("tops").mode).toBe("letter");
    expect(getSizeConfig("outerwear").mode).toBe("letter");
    expect(getSizeConfig("bottoms").mode).toBe("bottoms");
    expect(getSizeConfig("shoes").mode).toBe("shoes");
    expect(getSizeConfig("accessories").mode).toBe("unique");
    expect(getSizeConfig("tops").options).toContain("M");
    expect(getSizeConfig("bottoms").options).toContain("W32");
    expect(getSizeConfig("shoes").options).toContain("42");
  });

  it("propose Baignade par défaut pour les types de maillots de bain", () => {
    for (const value of [
      "short_bain",
      "boxer_bain",
      "slip_bain",
      "maillot_une_piece",
      "haut_bikini",
      "bas_bikini",
    ]) {
      const sub = findSubcategory(value);
      expect(sub?.defaultUsage).toContain("baignade");
    }
  });

  it("ne propose pas Baignade pour un t-shirt classique", () => {
    expect(findSubcategory("tshirt")?.defaultUsage).toBeUndefined();
  });

  it("Sport n'est jamais une catégorie DB — uniquement une valeur d'usage", () => {
    const dbCategories = WARDROBE_ADD_CATEGORIES.map((c) => c.dbCategory);
    expect(dbCategories).not.toContain("sport");
  });
});
