import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface ProfileCompletion {
  score: number; // 0..100
  total: number;
  done: number;
  items: { key: string; label: string; done: boolean }[];
}

interface Params {
  hasAvatar: boolean;
  hasCustomPseudo: boolean;
}

export function useProfileCompletion({ hasAvatar, hasCustomPseudo }: Params) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile_completion", user?.id, hasAvatar, hasCustomPseudo],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<ProfileCompletion> => {
      const uid = user!.id;
      const [body, goals, prefs, nut] = await Promise.all([
        supabase.from("body_tracking").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", uid),
        (supabase as any).from("user_preferences").select("height_cm").eq("user_id", uid).maybeSingle(),
        supabase.from("nutrition_goals").select("user_id").eq("user_id", uid).maybeSingle(),
      ]);

      const heightCm = (prefs as any)?.data?.height_cm ?? null;

      const items = [
        { key: "pseudo", label: "Pseudo personnalisé", done: hasCustomPseudo },
        { key: "avatar", label: "Avatar ajouté", done: hasAvatar },
        { key: "height", label: "Taille renseignée", done: !!prefs.data?.height_cm },
        { key: "body", label: "1ère mensuration", done: (body.count ?? 0) > 0 },
        { key: "goals", label: "1 objectif défini", done: (goals.count ?? 0) > 0 },
        { key: "nutrition", label: "Objectifs nutrition", done: !!nut.data },
      ];
      const done = items.filter((i) => i.done).length;
      return { items, done, total: items.length, score: Math.round((done / items.length) * 100) };
    },
  });
}
