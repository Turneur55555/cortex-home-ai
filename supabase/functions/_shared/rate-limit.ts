// Server-side rate limiter using rate_limits table (insert-only).
// RLS: users insert/select their own; nothing can update/delete.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function checkRateLimit(
  supa: SupabaseClient,
  userId: string,
  action: string,
  maxPerHour: number,
): Promise<{ ok: boolean; count: number }> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supa
    .from("rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action)
    .gte("window_start", since);
  if (error) {
    console.error("[rate-limit] DB unavailable:", error);
    return { ok: false, count: 0 }; // fail-close : en cas de doute, bloquer
  }
  return { ok: (count ?? 0) < maxPerHour, count: count ?? 0 };
}

export async function recordRateLimit(
  supa: SupabaseClient,
  userId: string,
  action: string,
): Promise<void> {
  const { error } = await supa.from("rate_limits").insert({ user_id: userId, action });
  if (error) console.error("[rate-limit] insert failed", error);
}
