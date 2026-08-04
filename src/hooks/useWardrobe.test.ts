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
  toUiCategory,
  validateWardrobePhotoFile,
  type WardrobeAnalysisResult,
} from "./useWardrobe";

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
    subcategory: "t-shirt",
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
