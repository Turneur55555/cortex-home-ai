
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
}

// ─── Fonctions pures ───────────────────────────────────────────────────────────

export function getPortionBadge(pct: number | null, count: number | null): string | null {
  const p = pct ?? 100;
  const c = count ?? 1;
  if (p === 100 && c === 1) return null;
  if (p === 50 && c === 1) return "½";
  if (p === 25 && c === 1) return "¼";
  if (p === 75 && c === 1) return "¾";
  if (p === 150 && c === 1) return "1½";
  if (p === 200 && c === 1) return "×2";
  if (p === 100 && c !== 1) return `×${c}`;
  return `${p}%`;
}

export async function fileToBase64Compressed(file: File): Promise<{ b64: string; mime: string }> {
  // Étape 1 : lecture du fichier en DataURL (toujours disponible, même HEIC)
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("Impossible de lire le fichier image"));
    r.readAsDataURL(file);
  });

  // Étape 2 : compression canvas (JPEG 1280px max, qualité 0.82)
  // Peut échouer sur certains navigateurs pour HEIC → fallback raw
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      // Timeout 15s pour iOS qui décode HEIC lentement
      const t = setTimeout(() => rej(new Error("Timeout chargement image")), 15_000);
      i.onload = () => { clearTimeout(t); res(i); };
      i.onerror = () => { clearTimeout(t); rej(new Error("Format image non supporté par le navigateur")); };
      i.src = dataUrl;
    });

    const max = 1280;
    const ratio = Math.min(1, max / Math.max(img.width, img.height, 1));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponible");
    ctx.drawImage(img, 0, 0, w, h);
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
