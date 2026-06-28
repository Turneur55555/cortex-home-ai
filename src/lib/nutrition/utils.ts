
// ─── Types partagés ────────────────────────────────────────────────────────────

export type MealPrefill = {
  name: string;
  meal: string;
  calories: string;
  proteins: string;
  carbs: string;
  fats: string;
};

export interface NutritionEntry {
  id: string;
  name: string | null;
  percentage_consumed: number | null;
  serving_count: number | null;
  base_calories: number | null;
  base_proteins: number | null;
  base_carbs: number | null;
  base_fats: number | null;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  consumed_quantity: number | null;
  consumed_unit: string | null;
  consumed_grams_per_unit: number | null;
}

// ─── Fonctions pures ───────────────────────────────────────────────────────────

export function getPortionBadge(
  entry: { consumed_quantity?: number | null; consumed_unit?: string | null },
): string | null {
  const q = entry.consumed_quantity;
  const u = entry.consumed_unit;
  if (q == null || !u) return null;
  const n = Math.round(q * 10) / 10;
  if (u === "g" || u === "ml") return `${n} ${u}`;
  if (u === "portion") return n === 1 ? null : `×${n}`;
  // unité comptable (scoop, œuf, pot, tranche…)
  return `${n} ${u}${n > 1 ? "s" : ""}`;
}

// Lit l'orientation EXIF d'un JPEG pour corriger la rotation iOS.
// Retourne 1 (normal) si absent ou non-JPEG.
async function readExifOrientation(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = e.target?.result as ArrayBuffer;
        const view = new DataView(buf);
        if (view.getUint16(0, false) !== 0xffd8) { resolve(1); return; }
        let offset = 2;
        while (offset < view.byteLength - 4) {
          const marker = view.getUint16(offset, false);
          const segLen = view.getUint16(offset + 2, false);
          if (marker === 0xffe1) {
            if (view.getUint32(offset + 4, false) !== 0x45786966) { resolve(1); return; }
            const little = view.getUint16(offset + 10, false) === 0x4949;
            const ifdOffset = offset + 10 + view.getUint32(offset + 14, little);
            const tags = view.getUint16(ifdOffset, little);
            for (let i = 0; i < tags; i++) {
              const tag = view.getUint16(ifdOffset + 2 + i * 12, little);
              if (tag === 0x0112) {
                resolve(view.getUint16(ifdOffset + 2 + i * 12 + 8, little));
                return;
              }
            }
            resolve(1); return;
          }
          offset += 2 + segLen;
        }
        resolve(1);
      } catch { resolve(1); }
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file.slice(0, 65536));
  });
}

// Applique la rotation EXIF sur un canvas avant drawImage.
function drawWithOrientation(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  w: number,
  h: number,
  orientation: number,
) {
  if (orientation === 6) {
    // 90° clockwise (portrait iPhone haut)
    canvas.width = h; canvas.height = w;
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, -h, w, h);
  } else if (orientation === 8) {
    // 90° counter-clockwise
    canvas.width = h; canvas.height = w;
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, -w, 0, w, h);
  } else if (orientation === 3) {
    // 180°
    canvas.width = w; canvas.height = h;
    ctx.rotate(Math.PI);
    ctx.drawImage(img, -w, -h, w, h);
  } else {
    canvas.width = w; canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
  }
}

export async function fileToBase64Compressed(file: File): Promise<{ b64: string; mime: string }> {
  // Étape 1 : lecture du fichier en DataURL (toujours disponible, même HEIC)
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("Impossible de lire le fichier image"));
    r.readAsDataURL(file);
  });

  // Étape 2 : compression canvas (JPEG 1280px max, qualité 0.82) + correction EXIF iOS
  try {
    const [img, orientation] = await Promise.all([
      new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        // Timeout 15s pour iOS qui décode HEIC lentement
        const t = setTimeout(() => rej(new Error("Timeout chargement image")), 15_000);
        i.onload = () => { clearTimeout(t); res(i); };
        i.onerror = () => { clearTimeout(t); rej(new Error("Format image non supporté par le navigateur")); };
        i.src = dataUrl;
      }),
      readExifOrientation(file),
    ]);

    const max = 1280;
    // Pour orientations 6/8, les dimensions source sont inversées
    const srcW = (orientation === 6 || orientation === 8) ? img.height : img.width;
    const srcH = (orientation === 6 || orientation === 8) ? img.width : img.height;
    const ratio = Math.min(1, max / Math.max(srcW, srcH, 1));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponible");

    drawWithOrientation(ctx, canvas, img, w, h, orientation);

    const out = canvas.toDataURL("image/jpeg", 0.82);

    // Si le canvas produit une image vide (bug HEIC sur certains Safari), fallback
    if (out.length < 1000) throw new Error("Canvas a produit une image vide");

    return { b64: out.split(",")[1] ?? "", mime: "image/jpeg" };

  } catch {
    // Fallback : envoyer le fichier raw sans compression
    // Le modèle IA (Gemini / GPT-4o) supporte HEIC, WebP, PNG, JPEG nativement
    const parts = dataUrl.split(",");
    const mimeMatch = parts[0]?.match(/data:(image\/[^;]+)/);
    return {
      b64: parts[1] ?? "",
      mime: mimeMatch?.[1] ?? "image/jpeg",
    };
  }
}
