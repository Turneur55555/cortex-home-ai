/**
 * Regression test for the `nutrition_meal_check` production incident
 * (16/07/2026): the DB constraint and the app's meal-slug list drifted,
 * so inserting a "Goûter" entry failed with Postgres error 23514.
 *
 * Exercises the real constraint against the real database — inserts one
 * row per valid meal slug, confirms an invalid slug is rejected, and
 * confirms moving a row between meals (the "move meal" feature) works
 * for every slug pair.
 *
 * Exécution :
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
 *     npx vitest run src/lib/nutrition/nutritionMealCheck.test.ts
 *
 * Sans les variables d'env, les tests sont `skip` (comme rls.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MEAL_SLUGS } from "./meals";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

const HAS_ENV = !!(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY);
const d = HAS_ENV ? describe : describe.skip;

d("nutrition_meal_check — regression", () => {
  let admin: SupabaseClient;
  let userId: string;
  const insertedIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `nutrition-meal-test-${crypto.randomUUID()}@icortex.test`;
    const { data, error } = await (admin.auth as any).admin.createUser({
      email,
      password: `Pwd-${crypto.randomUUID()}`,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    userId = data.user.id;
  });

  afterAll(async () => {
    if (insertedIds.length) {
      await admin.from("nutrition").delete().in("id", insertedIds);
    }
    if (userId) {
      await (admin.auth as any).admin.deleteUser(userId);
    }
  });

  it.each(MEAL_SLUGS)("inserts one food item into meal=%s successfully", async (meal) => {
    const { data, error } = await admin
      .from("nutrition")
      .insert({ user_id: userId, date: "2026-07-16", meal, name: `test-${meal}`, calories: 100 })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) insertedIds.push(data.id);
  });

  it("rejects an invalid meal value with Postgres error 23514", async () => {
    const { error } = await admin.from("nutrition").insert({
      user_id: userId,
      date: "2026-07-16",
      meal: "brunch-invalide",
      name: "test-invalid",
      calories: 100,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("nutrition_meal_check");
  });

  it("moves a food item between every pair of valid meals (meal move feature)", async () => {
    const { data, error: insErr } = await admin
      .from("nutrition")
      .insert({
        user_id: userId,
        date: "2026-07-16",
        meal: MEAL_SLUGS[0],
        name: "test-move",
        calories: 50,
      })
      .select("id")
      .single();
    expect(insErr).toBeNull();
    const id = data!.id as string;
    insertedIds.push(id);

    for (const target of MEAL_SLUGS) {
      const { error } = await admin.from("nutrition").update({ meal: target }).eq("id", id);
      expect(error, `move to "${target}" failed`).toBeNull();
    }
  });
});
