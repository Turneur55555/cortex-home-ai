/**
 * Détourage et normalisation visuelle (Phase 5) — logique pure côté client.
 *
 * Ce fichier sépare volontairement deux choses :
 * - la géométrie de recadrage (pure, testable sans DOM/canvas) ;
 * - l'exécution réelle (canvas, `@imgly/background-removal`), qui a besoin
 *   du navigateur et vit dans src/hooks/useWardrobe.ts / ajouter.tsx.
 *
 * Aucun import React, aucune dépendance DOM ici.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calcule le rectangle de destination pour placer une image
 * (`srcWidth` x `srcHeight`) centrée dans un canvas carré de `canvasSize`,
 * avec une marge relative `marginRatio` (0..1) de chaque côté, SANS jamais
 * étirer ni recadrer le vêtement — le ratio d'aspect original est toujours
 * préservé (cf. §3 de la mission).
 */
export function computeCenteredFit(
  srcWidth: number,
  srcHeight: number,
  canvasSize: number,
  marginRatio = 0.08,
): Rect {
  if (srcWidth <= 0 || srcHeight <= 0 || canvasSize <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const margin = Math.max(0, Math.min(0.45, marginRatio));
  const usable = canvasSize * (1 - margin * 2);
  const scale = Math.min(usable / srcWidth, usable / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return {
    x: (canvasSize - width) / 2,
    y: (canvasSize - height) / 2,
    width,
    height,
  };
}

/** Taille du canvas carré de sortie pour l'image normalisée. */
export const WARDROBE_NORMALIZED_CANVAS_SIZE = 1024;

/** Marge relative autour du vêtement dans le canvas normalisé. */
export const WARDROBE_NORMALIZED_MARGIN_RATIO = 0.08;

/** Dimension max envoyée au détourage — évite d'envoyer l'original "gigantesque" (cf. §6). */
export const WARDROBE_PROCESSING_MAX_DIMENSION = 1280;

/**
 * Calcule les dimensions réduites (sans dépasser `maxDimension` sur le plus
 * grand côté) à utiliser avant détourage — préserve toujours le ratio.
 * Retourne les dimensions source inchangées si elles sont déjà assez petites
 * (jamais d'agrandissement).
 */
export function computeDownscaleDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number = WARDROBE_PROCESSING_MAX_DIMENSION,
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) return { width: 0, height: 0 };
  const largest = Math.max(srcWidth, srcHeight);
  if (largest <= maxDimension) return { width: srcWidth, height: srcHeight };
  const scale = maxDimension / largest;
  return {
    width: Math.round(srcWidth * scale),
    height: Math.round(srcHeight * scale),
  };
}

/**
 * Détermine le chemin Storage à afficher pour un item : la version
 * détourée/normalisée si elle existe (§7 — priorité au traitement), sinon
 * l'original (fallback automatique).
 */
export function pickDisplayStoragePath(item: {
  storage_path: string | null;
  processed_storage_path?: string | null;
}): string | null {
  return item.processed_storage_path ?? item.storage_path ?? null;
}
