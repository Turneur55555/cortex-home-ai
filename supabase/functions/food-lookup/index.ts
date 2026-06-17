// Food lookup edge function — replaces Open Food Facts.
// Pipeline: Supabase cache (foods/food_barcodes) → USDA FoodData Central → cache write-back.
// Always returns HTTP 200 with { ok, data?, error? }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const isAllowed =
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin);
  const allow = isAllowed ? origin : "https://cortex-home-ai.lovable.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

// ─── Types exposés (compatibles OFF pour transition douce) ────────────────────

interface FoodResult {
  id: string;                 // food.id (uuid) ou usda fdc id préfixé
  source: "icortex" | "usda" | "custom";
  source_id?: string;
  name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  // /100g
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  fiber?: number | null;
  // pour compat OFF côté BarcodeScannerSheet
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
  };
  barcode?: string;
  quality_score?: number;
  confidence_score?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const round = (v: unknown, d = 1): number | null => {
  const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** d) / 10 ** d;
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function toResult(row: Record<string, unknown>, barcode?: string): FoodResult {
  const calories = row.calories as number | null;
  const proteins = row.proteins as number | null;
  const carbs = row.carbs as number | null;
  const fats = row.fats as number | null;
  return {
    id: String(row.id),
    source: (row.source as FoodResult["source"]) ?? "icortex",
    source_id: row.source_id as string | undefined,
    name: row.name as string,
    brand: (row.brand as string) ?? undefined,
    category: (row.category as string) ?? undefined,
    image_url: (row.image_url as string) ?? undefined,
    calories,
    proteins,
    carbs,
    fats,
    fiber: (row.fiber as number | null) ?? null,
    barcode,
    nutriments: {
      "energy-kcal_100g": calories ?? undefined,
      proteins_100g: proteins ?? undefined,
      carbohydrates_100g: carbs ?? undefined,
      fat_100g: fats ?? undefined,
      fiber_100g: (row.fiber as number | undefined) ?? undefined,
    },
  };
}

function computeQuality(calories: number | null, p: number | null, c: number | null, f: number | null) {
  if (calories == null || p == null || c == null || f == null) {
    return { quality_score: 50, confidence_score: 40, kcal_theoretical: null, kcal_declared: calories, kcal_delta_pct: null, flags: ["incomplete"] };
  }
  const theoretical = p * 4 + c * 4 + f * 9;
  const delta = calories === 0 ? 100 : Math.abs((theoretical - calories) / Math.max(calories, 1)) * 100;
  const flags: string[] = [];
  let quality = 100;
  if (delta > 10) { quality -= 20; flags.push("kcal_mismatch"); }
  if (delta > 25) { quality -= 30; }
  if (p > 100 || c > 100 || f > 100) { quality -= 30; flags.push("macro_overflow"); }
  return {
    quality_score: Math.max(0, Math.min(100, Math.round(quality))),
    confidence_score: Math.max(0, Math.min(100, Math.round(100 - delta))),
    kcal_theoretical: round(theoretical),
    kcal_declared: calories,
    kcal_delta_pct: round(delta),
    flags,
  };
}

// ─── USDA client ──────────────────────────────────────────────────────────────

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

interface UsdaNutrient {
  nutrientNumber?: string;
  nutrientName?: string;
  value?: number;
}
interface UsdaFood {
  fdcId: number;
  description: string;
  brandName?: string;
  brandOwner?: string;
  gtinUpc?: string;
  foodCategory?: string;
  dataType?: string;
  foodNutrients?: UsdaNutrient[];
}

function pickNutrient(food: UsdaFood, numbers: string[]): number | null {
  for (const n of food.foodNutrients ?? []) {
    if (n.nutrientNumber && numbers.includes(n.nutrientNumber) && n.value != null) {
      return n.value;
    }
  }
  return null;
}

function usdaToFood(food: UsdaFood) {
  const calories = pickNutrient(food, ["208"]);
  const proteins = pickNutrient(food, ["203"]);
  const carbs = pickNutrient(food, ["205"]);
  const fats = pickNutrient(food, ["204"]);
  const fiber = pickNutrient(food, ["291"]);
  const sugar = pickNutrient(food, ["269"]);
  const sat = pickNutrient(food, ["606"]);
  const sodium = pickNutrient(food, ["307"]);
  return {
    source: "usda" as const,
    source_id: String(food.fdcId),
    name: food.description,
    name_normalized: normalize(food.description),
    brand: food.brandName ?? food.brandOwner ?? null,
    category: food.foodCategory ?? null,
    calories: round(calories, 0),
    proteins: round(proteins),
    carbs: round(carbs),
    fats: round(fats),
    fiber: round(fiber),
    sugar: round(sugar),
    saturated_fat: round(sat),
    sodium: round(sodium),
    gtinUpc: food.gtinUpc ?? null,
  };
}

async function usdaSearch(apiKey: string, query: string, pageSize = 10): Promise<UsdaFood[]> {
  const url = `${USDA_BASE}/foods/search?api_key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      pageSize,
      dataType: ["Foundation", "SR Legacy", "Branded"],
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.foods ?? []) as UsdaFood[];
}

async function usdaByBarcode(apiKey: string, code: string): Promise<UsdaFood | null> {
  const url = `${USDA_BASE}/foods/search?api_key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: code, dataType: ["Branded"], pageSize: 5 }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const list = (data.foods ?? []) as UsdaFood[];
  return list.find((f) => f.gtinUpc?.replace(/^0+/, "") === code.replace(/^0+/, "")) ?? list[0] ?? null;
}

// ─── Persistance Supabase ─────────────────────────────────────────────────────

async function upsertFood(admin: ReturnType<typeof createClient>, payload: ReturnType<typeof usdaToFood>) {
  const { gtinUpc, ...row } = payload;
  const { data, error } = await admin
    .from("foods")
    .upsert(row, { onConflict: "source,source_id" })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("upsert food failed");

  // Score qualité
  const q = computeQuality(
    data.calories as number | null,
    data.proteins as number | null,
    data.carbs as number | null,
    data.fats as number | null,
  );
  await admin.from("food_quality_scores").upsert({ food_id: data.id, ...q });

  // Barcode
  if (gtinUpc) {
    await admin.from("food_barcodes").upsert({ barcode: gtinUpc, food_id: data.id });
  }
  return data;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const USDA_KEY = Deno.env.get("USDA_API_KEY");

    if (!USDA_KEY) {
      return Response.json(
        { ok: false, error: "USDA_API_KEY missing" },
        { status: 200, headers: cors },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const type = body.type as "search" | "barcode" | undefined;

    // ─── BARCODE ──────────────────────────────────────────────────────────
    if (type === "barcode") {
      const code = String(body.code ?? "").trim();
      if (!code) return Response.json({ ok: false, error: "empty code" }, { headers: cors });

      // 1. Cache
      const cached = await admin
        .from("food_barcodes")
        .select("barcode, foods(*)")
        .eq("barcode", code)
        .maybeSingle();
      if (cached.data?.foods) {
        const row = cached.data.foods as Record<string, unknown>;
        return Response.json({ ok: true, data: toResult(row, code) }, { headers: cors });
      }

      // 2. USDA
      const usda = await usdaByBarcode(USDA_KEY, code);
      if (!usda) {
        return Response.json({ ok: false, error: "not_found", code }, { headers: cors });
      }
      const payload = usdaToFood(usda);
      payload.gtinUpc = payload.gtinUpc ?? code;
      const saved = await upsertFood(admin, payload);
      return Response.json({ ok: true, data: toResult(saved as Record<string, unknown>, code) }, { headers: cors });
    }

    // ─── SEARCH ──────────────────────────────────────────────────────────
    if (type === "search") {
      const query = String(body.query ?? "").trim();
      if (query.length < 2) return Response.json({ ok: true, data: [] }, { headers: cors });
      const norm = normalize(query);

      // 1. DB trigram
      const local = await admin
        .from("foods")
        .select("*")
        .ilike("name_normalized", `%${norm}%`)
        .limit(20);
      let results: FoodResult[] = (local.data ?? []).map((r) => toResult(r as Record<string, unknown>));

      // 2. USDA fallback si pauvre
      if (results.length < 5) {
        const usdaList = await usdaSearch(USDA_KEY, query, 10);
        for (const f of usdaList) {
          try {
            const payload = usdaToFood(f);
            const saved = await upsertFood(admin, payload);
            results.push(toResult(saved as Record<string, unknown>));
          } catch (_) { /* skip */ }
        }
        // dédoublonner par id
        const seen = new Set<string>();
        results = results.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
      }

      return Response.json({ ok: true, data: results.slice(0, 15) }, { headers: cors });
    }

    return Response.json({ ok: false, error: "unknown type" }, { headers: cors });
  } catch (e) {
    console.error("food-lookup error", e);
    return Response.json(
      { ok: false, error: (e as Error)?.message ?? "internal" },
      { status: 200, headers: cors },
    );
  }
});
