import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type ActivityType = "workout" | "meal" | "goal" | "body";

/**
 * Journalise un événement dans user_activity (section « Activité récente » du Profil).
 * Fire-and-forget : ne doit jamais bloquer ni faire échouer l'action principale.
 */
export function logActivity(
  type: ActivityType,
  label: string,
  metadata: Json = {},
): void {
  void (async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("user_activity")
        .insert({ user_id: user.id, type, label, metadata });
      if (error) console.warn("[logActivity]", error.message);
    } catch {
      /* silencieux */
    }
  })();
}
