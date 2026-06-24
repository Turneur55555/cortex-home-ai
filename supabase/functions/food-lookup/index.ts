// Food lookup edge function — catalogue propriétaire (foods : ciqual/usda/icortex/custom).
// Pipeline : synonymes FR/EN → cache DB (normalized_name) → Gemini (fautes + FR→EN) → USDA → write-back.
// Sortie inchangée pour le front (proteins/carbs/fats). Colonnes DB = schéma propriétaire (protein_g, normalized_name…).
// IA : GEMINI_API_KEY (API Google directe, gemini-2.5-flash). Toujours HTTP 200 { ok, data?, error? }.

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

interface ServingInfo { label: string; unit: string; quantity: number; grams: number }
interface FoodResult {
  id: string;
  source: "icortex" | "usda" | "custom" | "ciqual";
  source_id?: string;
  name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  fiber?: number | null;
  nutriments?: Record<string, number | undefined>;
  barcode?: string;
  quality_score?: number;
  confidence_score?: number;
  default_serving?: ServingInfo | null;
}

const round = (v: unknown, d = 1): number | null => {
  const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** d) / 10 ** d;
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function toResult(row: Record<string, unknown>, barcode?: string): FoodResult {
  const calories = row.calories as number | null;
  const proteins = row.protein_g as number | null;
  const carbs = row.carbs_g as number | null;
  const fats = row.fat_g as number | null;
  const fiber = (row.fiber_g as number | null) ?? null;
  return {
    id: String(row.id),
    source: (row.source as FoodResult["source"]) ?? "icortex",
    source_id: row.source_id as string | undefined,
    name: row.name as string,
    brand: (row.brand as string) ?? undefined,
    category: (row.category as string) ?? undefined,
    image_url: (row.image_url as string) ?? undefined,
    calories, proteins, carbs, fats, fiber,
    barcode,
    nutriments: {
      "energy-kcal_100g": calories ?? undefined,
      proteins_100g: proteins ?? undefined,
      carbohydrates_100g: carbs ?? undefined,
      fat_100g: fats ?? undefined,
      fiber_100g: fiber ?? undefined,
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
    kcal_theoretical: round(theoretical), kcal_declared: calories, kcal_delta_pct: round(delta), flags,
  };
}

type Admin = ReturnType<typeof createClient>;
async function enrich(admin: Admin, results: FoodResult[]): Promise<FoodResult[]> {
  const ids = results.map((r) => r.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return results;
  const [q, sv] = await Promise.all([
    admin.from("food_quality_scores").select("food_id, quality_score, confidence_score").in("food_id", ids),
    admin.from("food_servings").select("food_id, label, unit, quantity, grams, is_default").in("food_id", ids),
  ]);
  const qMap = new Map<string, { quality_score: number; confidence_score: number }>();
  for (const row of q.data ?? []) qMap.set(String((row as Record<string, unknown>).food_id), row as never);
  const svMap = new Map<string, ServingInfo>();
  for (const row of sv.data ?? []) {
    const r = row as Record<string, unknown>;
    if (r.is_default && !svMap.has(String(r.food_id))) {
      svMap.set(String(r.food_id), { label: String(r.label), unit: String(r.unit), quantity: Number(r.quantity), grams: Number(r.grams) });
    }
  }
  return results.map((r) => ({
    ...r,
    quality_score: qMap.get(r.id)?.quality_score,
    confidence_score: qMap.get(r.id)?.confidence_score,
    default_serving: svMap.get(r.id) ?? null,
  }));
}

async function expandSynonyms(admin: Admin, norm: string): Promise<string[]> {
  const { data } = await admin
    .from("food_synonyms")
    .select("canonical_term, alias_normalized")
    .ilike("alias_normalized", `%${norm}%`)
    .limit(5);
  const terms = new Set<string>();
  for (const row of data ?? []) {
    const ct = (row as Record<string, unknown>).canonical_term as string | null;
    if (ct) terms.add(normalize(ct));
  }
  return [...terms];
}

async function geminiNormalize(apiKey: string, query: string): Promise<string | null> {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu corriges et traduis des noms d'aliments pour une recherche dans la base USDA (anglais). Réponds UNIQUEMENT par le nom de l'aliment en anglais, en minuscules, sans ponctuation ni phrase. Exemple: 'steack haché' -> 'ground beef'." },
          { role: "user", content: query },
        ],
        temperature: 0,
        max_tokens: 20,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content?.trim();
    return txt ? String(txt).split("\n")[0].slice(0, 60) : null;
  } catch (_) {
    return null;
  }
}

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
interface UsdaNutrient { nutrientNumber?: string; value?: number }
interface UsdaFood { fdcId: number; description: string; brandName?: string; brandOwner?: string; gtinUpc?: string; foodCategory?: string; foodNutrients?: UsdaNutrient[] }
function pickNutrient(food: UsdaFood, numbers: string[]): number | null {
  for (const n of food.foodNutrients ?? []) {
    if (n.nutrientNumber && numbers.includes(n.nutrientNumber) && n.value != null) return n.value;
  }
  return null;
}
function usdaToFood(food: UsdaFood) {
  return {
    source: "usda" as const,
    source_id: String(food.fdcId),
    name: food.description,
    normalized_name: normalize(food.description),
    brand: food.brandName ?? food.brandOwner ?? null,
    category: food.foodCategory ?? null,
    serving_type: "100g",
    calories: round(pickNutrient(food, ["208"]), 0),
    protein_g: round(pickNutrient(food, ["203"])),
    carbs_g: round(pickNutrient(food, ["205"])),
    fat_g: round(pickNutrient(food, ["204"])),
    fiber_g: round(pickNutrient(food, ["291"])),
    sugars_g: round(pickNutrient(food, ["269"])),
    saturated_fat_g: round(pickNutrient(food, ["606"])),
    sodium_mg: round(pickNutrient(food, ["307"])),
    gtinUpc: food.gtinUpc ?? null,
  };
}
async function usdaSearch(apiKey: string, query: string, pageSize = 10): Promise<UsdaFood[]> {
  const res = await fetch(`${USDA_BASE}/foods/search?api_key=${apiKey}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, pageSize, dataType: ["Foundation", "SR Legacy", "Branded"] }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.foods ?? []) as UsdaFood[];
}
async function usdaByBarcode(apiKey: string, code: string): Promise<UsdaFood | null> {
  const res = await fetch(`${USDA_BASE}/foods/search?api_key=${apiKey}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: code, dataType: ["Branded"], pageSize: 5 }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const list = (data.foods ?? []) as UsdaFood[];
  return list.find((f) => f.gtinUpc?.replace(/^0+/, "") === code.replace(/^0+/, "")) ?? list[0] ?? null;
}
async function upsertFood(admin: Admin, payload: ReturnType<typeof usdaToFood>) {
  const { gtinUpc, ...row } = payload;
  const { data, error } = await admin.from("foods").upsert(row, { onConflict: "source,source_id" }).select().single();
  if (error || !data) throw error ?? new Error("upsert food failed");
  const q = computeQuality(data.calories as number | null, data.protein_g as number | null, data.carbs_g as number | null, data.fat_g as number | null);
  await admin.from("food_quality_scores").upsert({ food_id: data.id, ...q });
  if (gtinUpc) await admin.from("food_barcodes").upsert({ barcode: gtinUpc, food_id: data.id });
  return data;
}

async function dbSearch(admin: Admin, terms: string[]): Promise<FoodResult[]> {
  const uniq = [...new Set(terms.filter((t) => t && t.length >= 2))];
  if (uniq.length === 0) return [];
  const or = uniq.map((t) => `normalized_name.ilike.%${t}%`).join(",");
  const { data } = await admin.from("foods").select("*").or(or).limit(20);
  return (data ?? []).map((r) => toResult(r as Record<string, unknown>));
}

function dedupe(results: FoodResult[]): FoodResult[] {
  const seen = new Set<string>();
  return results.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const USDA_KEY = Deno.env.get("USDA_API_KEY");
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

    // Require a valid Supabase JWT before doing any work (catalog writes use service role).
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: cors });
    }
    const userSupa = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userSupa.auth.getUser();
    if (userErr || !userData?.user) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: cors });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const type = body.type as "search" | "barcode" | undefined;

    if (type === "barcode") {
      const code = String(body.code ?? "").trim();
      if (!code) return Response.json({ ok: false, error: "empty code" }, { headers: cors });
      const cached = await admin.from("food_barcodes").select("barcode, foods(*)").eq("barcode", code).maybeSingle();
      if (cached.data?.foods) {
        const enriched = await enrich(admin, [toResult(cached.data.foods as Record<string, unknown>, code)]);
        return Response.json({ ok: true, data: enriched[0] }, { headers: cors });
      }

      // 1) Open Food Facts — couvre la majorité des codes-barres européens
      try {
        const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, {
          headers: { "user-agent": "cortex-home-ai/1.0 (lovable)" },
        });
        if (offRes.ok) {
          const offData = await offRes.json();
          if (offData?.status === 1 && offData?.product) {
            const p = offData.product;
            const n = p.nutriments ?? {};
            const name = p.product_name_fr || p.product_name || p.generic_name_fr || p.generic_name;
            const calories = round(n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : null), 0);
            const protein = round(n.proteins_100g);
            const carbs = round(n.carbohydrates_100g);
            const fat = round(n.fat_100g);
            const fiber = round(n.fiber_100g);
            if (name && (calories != null || protein != null || carbs != null || fat != null)) {
              const payload = {
                source: "icortex" as const,
                source_id: `off:${code}`,
                name,
                normalized_name: normalize(name),
                brand: p.brands ?? null,
                category: p.categories ?? null,
                image_url: p.image_front_small_url ?? p.image_small_url ?? p.image_url ?? null,
                serving_type: "100g",
                calories, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: fiber,
                sugars_g: round(n.sugars_100g),
                saturated_fat_g: round(n["saturated-fat_100g"]),
                sodium_mg: round(n.sodium_100g != null ? n.sodium_100g * 1000 : null),
              };
              const { data: saved, error: upErr } = await admin
                .from("foods")
                .upsert(payload, { onConflict: "source,source_id" })
                .select()
                .single();
              if (!upErr && saved) {
                const q = computeQuality(calories, protein, carbs, fat);
                await admin.from("food_quality_scores").upsert({ food_id: saved.id, ...q });
                await admin.from("food_barcodes").upsert({ barcode: code, food_id: saved.id });
                const enriched = await enrich(admin, [toResult(saved as Record<string, unknown>, code)]);
                return Response.json({ ok: true, data: enriched[0] }, { headers: cors });
              }
            }
          }
        }
      } catch (_) { /* fallback to USDA */ }

      // 2) USDA fallback (principalement produits US)
      if (USDA_KEY) {
        const usda = await usdaByBarcode(USDA_KEY, code);
        if (usda) {
          const payload = usdaToFood(usda); payload.gtinUpc = payload.gtinUpc ?? code;
          const saved = await upsertFood(admin, payload);
          const enriched = await enrich(admin, [toResult(saved as Record<string, unknown>, code)]);
          return Response.json({ ok: true, data: enriched[0] }, { headers: cors });
        }
      }
      return Response.json({ ok: false, error: "not_found", code }, { headers: cors });
    }

    if (type === "search") {
      const query = String(body.query ?? "").trim();
      if (query.length < 2) return Response.json({ ok: true, data: [] }, { headers: cors });
      const norm = normalize(query);

      const synTerms = await expandSynonyms(admin, norm);
      let results = await dbSearch(admin, [norm, ...synTerms]);

      let englishTerm: string | null = null;
      if (results.length < 3 && GEMINI_KEY) {
        englishTerm = await geminiNormalize(GEMINI_KEY, query);
        if (englishTerm) {
          const more = await dbSearch(admin, [normalize(englishTerm)]);
          results = dedupe([...results, ...more]);
        }
      }

      if (results.length < 5 && USDA_KEY) {
        const usdaList = await usdaSearch(USDA_KEY, englishTerm ?? query, 10);
        for (const f of usdaList) {
          try {
            const saved = await upsertFood(admin, usdaToFood(f));
            results.push(toResult(saved as Record<string, unknown>));
          } catch (_) { /* skip */ }
        }
        results = dedupe(results);
      }

      const enriched = await enrich(admin, results.slice(0, 15));
      return Response.json({ ok: true, data: enriched }, { headers: cors });
    }

    return Response.json({ ok: false, error: "unknown type" }, { headers: cors });
  } catch (e) {
    console.error("food-lookup error", e);
    return Response.json({ ok: false, error: "Erreur interne. Réessaie plus tard." }, { status: 200, headers: cors });
  }
});
