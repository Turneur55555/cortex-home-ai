import { supabase } from "@/integrations/supabase/client";
import type { TransferTarget } from "../types";

export const MODULE_QUERY_KEYS: Record<TransferTarget, string[][]> = {
  alimentation: [["items", "alimentation"], ["items"]],
  pharmacie: [["items", "pharmacie"], ["items"]],
  habits: [["items", "habits"], ["items"]],
  menager: [["items", "menager"], ["items"]],
  nutrition: [["nutrition"]],
  fitness: [["workouts"], ["exercises"]],
  body: [["body_tracking"]],
};

type ScalarFns = {
  str: (v: unknown) => string | null;
  num: (v: unknown) => number | null;
  int: (v: unknown) => number | null;
  inRange: (v: unknown, min: number, max: number) => number | null;
};

function makeScalars(): ScalarFns {
  const str = (v: unknown): string | null =>
    typeof v === "string" ? v : v != null ? String(v) : null;
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const int = (v: unknown): number | null => {
    const n = num(v);
    return n == null ? null : Math.round(n);
  };
  const inRange = (v: unknown, min: number, max: number): number | null => {
    const n = num(v);
    return n != null && n >= min && n <= max ? n : null;
  };
  return { str, num, int, inRange };
}

export async function transferData(
  target: TransferTarget,
  items: Array<Record<string, unknown>>,
): Promise<number> {
  console.log("[TRANSFER START]", { target, count: items.length });
  console.log("[TRANSFER PAYLOAD]", JSON.stringify(items, null, 2));

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    console.error("[TRANSFER AUTH ERROR]", authErr);
    throw new Error("Non authentifié");
  }
  console.log("[TRANSFER USER]", user.id);

  if (!items.length) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const { str, num, int, inRange } = makeScalars();

  if (
    target === "alimentation" ||
    target === "pharmacie" ||
    target === "habits" ||
    target === "menager"
  ) {
    const rows = items
      .map((it) => ({
        user_id: user.id,
        module: target,
        name: str(it.name) ?? "Sans nom",
        category: str(it.category) ?? "autre",
        quantity: int(it.quantity) ?? 1,
        unit: str(it.unit),
        location: str(it.location),
        expiration_date: str(it.expiration_date),
        notes: str(it.notes),
      }))
      .filter((r) => r.name !== "Sans nom" || r.category !== "autre");

    console.log("[TRANSFER ROWS]", rows);
    if (!rows.length) return 0;
    const { error, count } = await supabase.from("items").insert(rows, { count: "exact" });
    console.log("[TRANSFER RESULT]", { error, count });
    if (error) { console.error("[TRANSFER SUPABASE ERROR]", error); throw error; }
    return count ?? rows.length;
  }

  if (target === "nutrition") {
    const rows = items
      .map((it) => ({
        user_id: user.id,
        date: str(it.date) ?? today,
        name: str(it.name) ?? "Repas",
        meal: str(it.meal),
        calories: int(it.calories),
        proteins: num(it.proteins),
        carbs: num(it.carbs),
        fats: num(it.fats),
      }))
      .filter(
        (r) =>
          r.name !== "Repas" ||
          r.meal ||
          r.calories != null ||
          r.proteins != null ||
          r.carbs != null ||
          r.fats != null,
      );

    console.log("[TRANSFER ROWS]", rows);
    if (!rows.length) return 0;
    const { error, count } = await supabase.from("nutrition").insert(rows, { count: "exact" });
    console.log("[TRANSFER RESULT]", { error, count });
    if (error) { console.error("[TRANSFER SUPABASE ERROR]", error); throw error; }
    return count ?? rows.length;
  }

  if (target === "body") {
    const rows = items
      .map((it) => ({
        user_id: user.id,
        date: str(it.date) ?? today,
        weight: inRange(it.weight, 20, 500),
        body_fat: inRange(it.body_fat, 1, 70),
        muscle_mass: inRange(it.muscle_mass, 1, 100),
        chest: inRange(it.chest, 30, 250),
        waist: inRange(it.waist, 30, 250),
        hips: inRange(it.hips, 30, 250),
        left_arm: inRange(it.left_arm, 10, 100),
        right_arm: inRange(it.right_arm, 10, 100),
        left_thigh: inRange(it.left_thigh, 20, 150),
        right_thigh: inRange(it.right_thigh, 20, 150),
        notes: str(it.notes),
      }))
      .filter(
        (r) =>
          r.weight != null ||
          r.body_fat != null ||
          r.muscle_mass != null ||
          r.chest != null ||
          r.waist != null ||
          r.hips != null ||
          r.left_arm != null ||
          r.right_arm != null ||
          r.left_thigh != null ||
          r.right_thigh != null ||
          Boolean(r.notes),
      );

    console.log("[TRANSFER ROWS]", rows);
    if (!rows.length) return 0;
    const { error, count } = await supabase
      .from("body_tracking")
      .insert(rows, { count: "exact" });
    console.log("[TRANSFER RESULT]", { error, count });
    if (error) { console.error("[TRANSFER SUPABASE ERROR]", error); throw error; }
    return count ?? rows.length;
  }

  if (target === "fitness") {
    let total = 0;
    for (const it of items) {
      const { data: w, error: wErr } = await supabase
        .from("workouts")
        .insert({
          user_id: user.id,
          date: str(it.date) ?? today,
          name: str(it.name) ?? "Séance",
          duration_minutes: int(it.duration_minutes),
          notes: str(it.notes),
        })
        .select()
        .single();
      console.log("[TRANSFER WORKOUT]", { w, error: wErr });
      if (wErr) { console.error("[TRANSFER SUPABASE ERROR]", wErr); throw wErr; }

      const exs = Array.isArray(it.exercises)
        ? (it.exercises as Array<Record<string, unknown>>)
        : [];
      if (exs.length) {
        const exerciseRows = exs.map((ex) => ({
          user_id: user.id,
          workout_id: w.id,
          name: str(ex.name) ?? "Exercice",
          sets: int(ex.sets),
          reps: int(ex.reps),
          weight: num(ex.weight),
          notes: str(ex.notes),
        }));
        console.log("[TRANSFER EXERCISES]", exerciseRows);
        const { error: eErr } = await supabase.from("exercises").insert(exerciseRows);
        if (eErr) { console.error("[TRANSFER SUPABASE ERROR]", eErr); throw eErr; }
      }
      total++;
    }
    return total;
  }

  console.warn("[TRANSFER] Module non géré:", target);
  return 0;
}
