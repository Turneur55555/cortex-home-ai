/**
 * Exécution réelle du détourage (Phase 5) — nécessite le navigateur
 * (canvas, Image, Web Worker/WASM via `@imgly/background-removal`).
 * La géométrie pure (recadrage, dimensions) vit dans imageProcessing.ts et
 * est testée indépendamment ; ce fichier orchestre les appels DOM/WASM et
 * n'est volontairement pas couvert par des tests unitaires (comme
 * `fileToBase64Compressed` dans src/lib/nutrition/utils.ts, même
 * convention déjà en place dans ce repo).
 *
 * `@imgly/background-removal` : bibliothèque open-source (MIT), inférence
 * ONNX/WASM 100% dans le navigateur — aucune clé API, aucun coût par appel,
 * aucune photo envoyée à un serveur tiers. Les poids du modèle sont
 * récupérés depuis le CDN public du projet (staticimgly.com) au premier
 * usage puis mis en cache par le navigateur — ce n'est pas un fournisseur
 * IA au sens de la mission (pas de facturation, pas de compte, pas de clé).
 */
import {
  WARDROBE_NORMALIZED_CANVAS_SIZE,
  WARDROBE_NORMALIZED_MARGIN_RATIO,
  WARDROBE_PROCESSING_MAX_DIMENSION,
  computeCenteredFit,
  computeDownscaleDimensions,
} from "./imageProcessing";

function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible."));
    };
    img.src = url;
  });
}

/** Réduit l'image avant détourage — évite d'envoyer l'original en pleine résolution (§6). */
async function downscaleForProcessing(file: File): Promise<Blob> {
  const img = await loadImage(file);
  try {
    const { width, height } = computeDownscaleDimensions(
      img.naturalWidth,
      img.naturalHeight,
      WARDROBE_PROCESSING_MAX_DIMENSION,
    );
    if (width === img.naturalWidth && height === img.naturalHeight) return file;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    return blob ?? file;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/**
 * Recadre/centre une image détourée (fond transparent) dans un canvas carré
 * avec marge régulière, sans jamais étirer ni recadrer le vêtement (§3).
 */
async function normalizeCutout(cutout: Blob): Promise<Blob> {
  const img = await loadImage(cutout);
  try {
    const size = WARDROBE_NORMALIZED_CANVAS_SIZE;
    const rect = computeCenteredFit(
      img.naturalWidth,
      img.naturalHeight,
      size,
      WARDROBE_NORMALIZED_MARGIN_RATIO,
    );

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible.");
    // Pas de fill : le canvas reste transparent (fond transparent dans le fichier traité).
    ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.92),
    );
    if (!blob) throw new Error("Export canvas impossible.");
    return blob;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/**
 * Pipeline complet : réduction → détourage (`@imgly/background-removal`) →
 * normalisation (canvas carré, vêtement centré, fond transparent).
 * Ne bloque JAMAIS l'ajout : lève une erreur explicite en cas d'échec, à
 * charge de l'appelant de conserver l'original (cf. src/routes/.../ajouter.tsx).
 */
export async function processWardrobePhoto(file: File): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  const resized = await downscaleForProcessing(file);
  const cutout = await removeBackground(resized, {
    model: "isnet_quint8",
    output: { format: "image/webp", quality: 0.92 },
  });
  return normalizeCutout(cutout);
}
