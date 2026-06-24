// nutrition-analysis edge — analyse micronutriments / signaux de carence.
// Lit les micros depuis les COLONNES de foods (schéma propriétaire) avec repli jsonb micros / USDA / IA.
// IMPORTANT : tendances indicatives, PAS un diagnostic. Toujours HTTP 200. IA = GEMINI_API_KEY (API Google directe).

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

const RDA: Record<string, { rda: number; unit: string; label: string }> = {
  iron: { rda: 11, unit: "mg", label: "Fer" },
  calcium: { rda: 950, unit: "mg", label: "Calcium" },
  magnesium: { rda: 380, unit: "mg", label: "Magnésium" },
  zinc: { rda: 11, unit: "mg", label: "Zinc" },
  potassium: { rda: 3500, unit: "mg", label: "Potassium" },
  vitamin_c: { rda: 110, unit: "mg", label: "Vitamine C" },
  vitamin_d: { rda: 15, unit: "µg", label: "Vitamine D" },
  vitamin_b12: { rda: 4, unit: "µg", label: "Vitamine B12" },
  folate: { rda: 330, unit: "µg", label: "Folates (B9)" },
  vitamin_a: { rda: 750, unit: "µg", label: "Vitamine A" },
  vitamin_b6: { rda: 1.7, unit: "mg", label: "Vitamine B6" },
  vitamin_e: { rda: 12, unit: "mg", label: "Vitamine E" },
};

// Colonnes foods correspondant à chaque clé RDA
const MICRO_COL: Record<string, string> = {
  iron: "iron_mg", calcium: "calcium_mg", magnesium: "magnesium_mg", zinc: "zinc_mg",
  potassium: "potassium_mg", vitamin_c: "vitamin_c_mg", vitamin_d: "vitamin_d_ug",
  vitamin_b12: "vitamin_b12_ug", folate: "vitamin_b9_ug", vitamin_a: "vitamin_a_ug",
  vitamin_b6: "vitamin_b6_mg", vitamin_e: "vitamin_e_mg",
};

const MICRO_MAP: Record<string, string> = {
  "303": "iron", "301": "calcium", "304": "magnesium", "309": "zinc",
  "306": "potassium", "307": "sodium", "401": "vitamin_c", "328": "vitamin_d",
  "418": "vitamin_b12", "417": "folate", "320": "vitamin_a", "415": "vitamin_b6",
  "323": "vitamin_e",
};

const normalize = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function supplementNutrient(title: string): string | null {
  const t = normalize(title);
  if (t.includes("zinc")) return "zinc";
  if (t.includes("magnesium")) return "magnesium";
  if (t.includes("fer") || t.includes("iron")) return "iron";
  if (t.includes("calcium")) return "calcium";
  if (t.includes("potassium")) return "potassium";
  if (t.includes("vitamine c") || t === "vit c") return "vitamin_c";
  if (t.includes("vitamine d")) return "vitamin_d";
  if (t.includes("b12")) return "vitamin_b12";
  if (t.includes("folate") || t.includes("b9")) return "folate";
  if (t.includes("vitamine a")) return "vitamin_a";
  if (t.includes("b6")) return "vitamin_b6";
  if (t.includes("vitamine e")) return "vitamin_e";
  return null;
}

function parseDose(desc: string, unit: string): number | null {
  if (!desc) return null;
  const m = desc.replace(",", ".").match(/([\d.]+)\s*(mcg|µg|ug|mg|g)/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  let inMg: number;
  if (u === "g") inMg = v * 1000;
  else if (u === "mg") inMg = v;
  else inMg = v / 1000;
  return unit === "µg" ? inMg * 1000 : inMg;
}

// Construit le dict micros (clés RDA) depuis les colonnes foods, repli sur jsonb micros.
function microsFromFood(food: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  const jsonb = (food.micros ?? {}) as Record<string, number>;
  for (const key of Object.keys(RDA)) {
    const col = MICRO_COL[key];
    const v = food[col];
    if (v != null && Number.isFinite(Number(v))) out[key] = Number(v);
    else if (jsonb[key] != null && Number.isFinite(Number(jsonb[key]))) out[key] = Number(jsonb[key]);
  }
  return out;
}

async function fetchUsdaMicros(apiKey: string, fdcId: string): Promise<Record<string, number>> {
  try {
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`);
    if (!res.ok) return {};
    const food = await res.json();
    const out: Record<string, number> = {};
    for (const n of food.foodNutrients ?? []) {
      const num = String(n.nutrient?.number ?? n.nutrientNumber ?? "");
      const key = MICRO_MAP[num];
      const value = n.amount ?? n.value;
      if (key && value != null && Number.isFinite(value)) out[key] = Math.round(value * 1000) / 1000;
    }
    return out;
  } catch {
    return {};
  }
}

async function estimateMicrosAI(apiKey: string, names: string[]): Promise<Record<string, { kcal100: number; micros: Record<string, number> }>> {
  if (!names.length) return {};
  const keys = Object.keys(RDA).join(", ");
  const prompt = `Estime la composition nutritionnelle MOYENNE pour 100 g de chaque aliment.\nAliments: ${JSON.stringify(names)}.\nRéponds STRICTEMENT en JSON (aucun texte autour), objet dont chaque clé est le nom EXACT de l'aliment et la valeur:\n{ \"kcal100\": number, \"iron\": number, \"calcium\": number, \"magnesium\": number, \"zinc\": number, \"potassium\": number, \"vitamin_c\": number, \"vitamin_d\": number, \"vitamin_b12\": number, \"folate\": number, \"vitamin_a\": number, \"vitamin_b6\": number, \"vitamin_e\": number }\nUnités /100 g: kcal100 en kcal; ${keys}: minéraux et vitamines C/E/B6 en mg; vitamines D/B12/A et folates en µg. Si inconnu, mets 0.`;
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gemini-2.5-flash", messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return {};
    const j = await res.json();
    let text = j.choices?.[0]?.message?.content ?? "";
    text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0) return {};
    const parsed = JSON.parse(text.slice(start, end + 1));
    const out: Record<string, { kcal100: number; micros: Record<string, number> }> = {};
    for (const [name, v] of Object.entries(parsed as Record<string, Record<string, number>>)) {
      const kcal100 = Number(v.kcal100) || 0;
      const micros: Record<string, number> = {};
      for (const k of Object.keys(RDA)) {
        if (v[k] != null && Number.isFinite(Number(v[k]))) micros[k] = Number(v[k]);
      }
      out[name] = { kcal100, micros };
    }
    return out;
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const USDA_KEY = Deno.env.get("USDA_API_KEY") ?? "";
    const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 200, headers: cors });

    const body = await req.json().catch(() => ({}));
    const days = Math.min(90, Math.max(3, Number(body.days) || 7));

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    const sinceStr = since.toISOString().split("T")[0];

    const { data: meals } = await admin
      .from("nutrition").select("name, calories, date").eq("user_id", user.id).gte("date", sinceStr);
    const mealList = meals ?? [];

    const { data: foods } = await admin
      .from("foods").select("id, normalized_name, source, source_id, calories, micros, iron_mg, calcium_mg, magnesium_mg, zinc_mg, potassium_mg, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, vitamin_b9_ug, vitamin_a_ug, vitamin_b6_mg, vitamin_e_mg");
    const foodList = (foods ?? []) as Array<Record<string, unknown>>;

    function matchFood(name: string) {
      const n = normalize(name);
      if (!n) return null;
      let best: Record<string, unknown> | null = null;
      for (const f of foodList) {
        const fn = String(f.normalized_name ?? "");
        if (!fn) continue;
        if (fn === n) return f;
        if ((n.includes(fn) || fn.includes(n)) && (!best || fn.length < String(best.normalized_name).length)) best = f;
      }
      return best;
    }

    type Profile = { kcal100: number; micros: Record<string, number>; source: "catalog" | "usda" | "ai" };
    const profiles = new Map<string, Profile>();
    const enrichCache: Record<string, Record<string, number>> = {};
    const distinctNames = [...new Set(mealList.map((m) => String(m.name ?? "")).filter(Boolean))];
    const needAi: string[] = [];

    for (const name of distinctNames) {
      const food = matchFood(name);
      const kcal100 = food ? Number(food.calories) : NaN;
      if (food && Number.isFinite(kcal100) && kcal100 > 0) {
        let micros = microsFromFood(food);
        if (Object.keys(micros).length === 0 && food.source === "usda" && food.source_id && USDA_KEY) {
          const sid = String(food.source_id);
          if (!enrichCache[sid]) {
            enrichCache[sid] = await fetchUsdaMicros(USDA_KEY, sid);
            if (Object.keys(enrichCache[sid]).length > 0) await admin.from("foods").update({ micros: enrichCache[sid] }).eq("id", food.id);
          }
          micros = enrichCache[sid];
        }
        if (micros && Object.keys(micros).length > 0) {
          profiles.set(name, { kcal100, micros, source: food.source === "usda" ? "usda" : "catalog" });
          continue;
        }
      }
      needAi.push(name);
    }

    let aiEstimatedCount = 0;
    if (needAi.length && AI_KEY) {
      const aiProfiles = await estimateMicrosAI(AI_KEY, needAi);
      for (const name of needAi) {
        const p = aiProfiles[name] ?? aiProfiles[name.trim()];
        if (p && p.kcal100 > 0 && Object.keys(p.micros).length > 0) {
          profiles.set(name, { kcal100: p.kcal100, micros: p.micros, source: "ai" });
          aiEstimatedCount++;
        }
      }
    }

    const totals: Record<string, number> = {};
    let covered = 0;
    for (const meal of mealList) {
      const prof = profiles.get(String(meal.name ?? ""));
      if (!prof || prof.kcal100 <= 0) continue;
      const grams = (Number(meal.calories) / prof.kcal100) * 100;
      if (!Number.isFinite(grams) || grams <= 0) continue;
      covered++;
      for (const k of Object.keys(RDA)) {
        if (prof.micros[k] != null) totals[k] = (totals[k] ?? 0) + prof.micros[k] * (grams / 100);
      }
    }

    // Reminders module removed — supplements are no longer tracked.
    const supplementsConsidered: Array<{ name: string; nutrient: string; daily: number; unit: string }> = [];
    const supDaily: Record<string, number> = {};

    const coverage = mealList.length ? covered / mealList.length : 0;
    const nutrients = Object.entries(RDA).map(([key, meta]) => {
      const fromFood = (totals[key] ?? 0) / days;
      const fromSupp = supDaily[key] ?? 0;
      const intake = Math.round((fromFood + fromSupp) * 10) / 10;
      const pct = Math.round((intake / meta.rda) * 100);
      let status: "ok" | "low" | "deficient" | "unknown";
      if (coverage < 0.3 && fromSupp === 0) status = "unknown";
      else if (pct >= 80) status = "ok";
      else if (pct >= 50) status = "low";
      else status = "deficient";
      return { key, label: meta.label, unit: meta.unit, rda: meta.rda, intake, intake_from_supplements: Math.round(fromSupp * 10) / 10, pct, status };
    });

    const signals = nutrients.filter((n) => n.status === "low" || n.status === "deficient");

    let aiSummary: string | null = null;
    if (AI_KEY) {
      try {
        const prompt = `Tu es un assistant nutrition prudent et honnête (FR). Données sur ${days} jours (couverture ${Math.round(coverage * 100)}%, dont ${aiEstimatedCount} aliment(s) estimé(s) par IA).\nApports moyens/jour vs recommandés :\n${nutrients.map((n) => `- ${n.label}: ${n.intake} ${n.unit} (${n.pct}%, ${n.status})`).join("\n")}\nCompléments: ${supplementsConsidered.map((s) => `${s.name} ${s.daily}${s.unit}`).join(", ") || "aucun"}.\nConsignes: parle de TENDANCES/SIGNAUX (jamais de diagnostic); si couverture faible, dis-le; 3-5 phrases; propose 1-2 aliments pour les signaux bas; rappelle qu'une carence se confirme par prise de sang.`;
        const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${AI_KEY}` },
          body: JSON.stringify({ model: "gemini-2.5-flash", messages: [{ role: "user", content: prompt }] }),
        });
        if (aiRes.ok) {
          const j = await aiRes.json();
          aiSummary = j.choices?.[0]?.message?.content ?? null;
        }
      } catch (_) { /* graceful */ }
    }

    return Response.json({
      ok: true,
      period_days: days,
      meals_analyzed: mealList.length,
      coverage: Math.round(coverage * 100),
      ai_estimated_foods: aiEstimatedCount,
      nutrients,
      signals,
      supplements_considered: supplementsConsidered,
      ai_summary: aiSummary,
      disclaimer: "Analyse indicative basée sur tes repas loggés et tes compléments (certains aliments sont estimés par IA) — ce n'est pas un diagnostic. Une carence se confirme par une prise de sang. Plus tu logges tes repas, plus l'analyse est fiable.",
    }, { headers: cors });
  } catch (e) {
    console.error("nutrition-analysis error", e);
    return Response.json({ ok: false, error: "Erreur interne. Réessaie plus tard." }, { status: 200, headers: cors });
  }
});
