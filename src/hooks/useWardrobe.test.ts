import { describe, expect, it } from "vitest";
import {
  WARDROBE_ADD_CATEGORIES,
  WARDROBE_DB_CATEGORY,
  WARDROBE_MAX_FILE_SIZE_BYTES,
  extensionForMimeType,
  toUiCategory,
  validateWardrobePhotoFile,
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
