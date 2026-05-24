import { supabase } from "@/integrations/supabase/client";

export interface ProfileRow {
  display_name: string | null;
}

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("users_profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertDisplayName(userId: string, displayName: string): Promise<string> {
  const trimmed = displayName.trim();
  if (trimmed.length < 3 || trimmed.length > 20) {
    throw new Error("Le pseudo doit faire entre 3 et 20 caractères.");
  }

  const { error } = await supabase
    .from("users_profiles")
    .upsert({ id: userId, display_name: trimmed }, { onConflict: "id" });
  if (error) throw error;

  // Sync auth metadata (fire-and-forget)
  void supabase.auth.updateUser({ data: { display_name: trimmed } }).catch(() => undefined);

  return trimmed;
}
