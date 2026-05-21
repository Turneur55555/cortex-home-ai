import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TTL_HOURS = 24; // Cache valide 24h par défaut

export async function getCachedResult(
  supa: SupabaseClient,
  cacheKey: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supa
      .from("ai_cache")
      .select("result")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;
    return data.result as Record<string, unknown>;
  } catch {
    return null; // Cache miss si erreur DB
  }
}

export async function setCachedResult(
  supa: SupabaseClient,
  cacheKey: string,
  functionName: string,
  result: Record<string, unknown>,
  userId: string,
  ttlHours = DEFAULT_TTL_HOURS,
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    await supa.from("ai_cache").upsert({
      cache_key: cacheKey,
      function_name: functionName,
      result,
      user_id: userId,
      expires_at: expiresAt.toISOString(),
    }, { onConflict: "cache_key" });
  } catch (e) {
    console.error("[ai-cache] Erreur écriture cache:", e);
    // Ne pas bloquer si le cache échoue
  }
}
