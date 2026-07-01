// Import Apple Health → tables Supabase, par batchs pour éviter les timeouts.
import { supabase } from "@/integrations/supabase/client";
import type { ParseResult } from "./appleHealth";

const CHUNK = 500;

async function upsertChunks<T>(
  table: string,
  rows: T[],
  onConflict: string,
): Promise<{ inserted: number; errors: string[] }> {
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    // @ts-expect-error dynamic table
    const { error } = await supabase.from(table).upsert(slice, { onConflict });
    if (error) errors.push(`${table}[${i}]: ${error.message}`);
    else inserted += slice.length;
  }
  return { inserted, errors };
}

export interface ImportSummary {
  body: number;
  workouts: number;
  activity: number;
  errors: string[];
}

export async function importAppleHealth(
  parsed: ParseResult,
  userId: string,
): Promise<ImportSummary> {
  const today = new Date().toISOString().slice(0, 10);

  const bodyRows = parsed.body
    .filter((b) => b.date <= today)
    .map((b) => ({ user_id: userId, ...b }));

  // upsert par (user_id, date) — pas de contrainte unique dédiée, on fait insert et on ignore les doublons via .upsert avec ignoreDuplicates
  let bodyInserted = 0;
  const bodyErrors: string[] = [];
  for (let i = 0; i < bodyRows.length; i += CHUNK) {
    const slice = bodyRows.slice(i, i + CHUNK);
    const { error, data } = await supabase
      .from("body_tracking")
      .upsert(slice, { onConflict: "user_id,date", ignoreDuplicates: true })
      .select("id");
    if (error) bodyErrors.push(`body[${i}]: ${error.message}`);
    else bodyInserted += data?.length ?? slice.length;
  }

  const workoutRows = parsed.workouts
    .filter((w) => w.date <= today)
    .map((w) => ({ user_id: userId, gym_location: "Apple Health", ...w }));

  let workoutsInserted = 0;
  const workoutErrors: string[] = [];
  for (let i = 0; i < workoutRows.length; i += CHUNK) {
    const slice = workoutRows.slice(i, i + CHUNK);
    const { error, data } = await supabase.from("workouts").insert(slice).select("id");
    if (error) workoutErrors.push(`workouts[${i}]: ${error.message}`);
    else workoutsInserted += data?.length ?? 0;
  }

  const activityRows = parsed.activity
    .filter((a) => a.date <= today)
    .map((a) => ({ user_id: userId, source: "apple_health", ...a }));

  const activityRes = await upsertChunks(
    "daily_activity",
    activityRows,
    "user_id,date,source",
  );

  return {
    body: bodyInserted,
    workouts: workoutsInserted,
    activity: activityRes.inserted,
    errors: [...bodyErrors, ...workoutErrors, ...activityRes.errors],
  };
}
