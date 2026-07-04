import { useMemo } from "react";
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

interface DbFacts {
  hasBody: boolean;
  hasGoal: boolean;
  hasHeight: boolean;
  hasNutritionGoals: boolean;
}

export function useProfileCompletion({ hasAvatar, hasCustomPseudo }: Params) {
  const { user } = useAuth();

  // Les faits DB ne dépendent pas de hasAvatar/hasCustomPseudo :
  // clé stable = pas de refetch inutile quand l'avatar ou le pseudo change.
  const query = useQuery({
    queryKey: ["profile_completion", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<DbFacts> => {
      const uid = user!.id;
      const [body, goals, prefs, nut] = await Promise.all([
        supabase.from("body_tracking").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", uid),
        (supabase as any).from("user_preferences").select("height_cm").eq("user_id", uid).maybeSingle(),
        supabase.from("nutrition_goals").select("user_id").eq("user_id", uid).maybeSingle(),
      ]);

      return {
        hasBody: (body.count ?? 0) > 0,
        hasGoal: (goals.count ?? 0) > 0,
        hasHeight: (prefs.data as any)?.height_cm != null,
        hasNutritionGoals: !!nut.data,
      };
    },
  });

  const data = useMemo((): ProfileCompletion | undefined => {
    if (!query.data) return undefined;
    const f = query.data;
    const items = [
      { key: "pseudo", label: "Pseudo personnalisé", done: hasCustomPseudo },
      { key: "avatar", label: "Avatar ajouté", done: hasAvatar },
      { key: "height", label: "Taille renseignée", done: f.hasHeight },
      { key: "body", label: "1ère mensuration", done: f.hasBody },
      { key: "goals", label: "1 objectif défini", done: f.hasGoal },
      { key: "nutrition", label: "Objectifs nutrition", done: f.hasNutritionGoals },
    ];
    const done = items.filter((i) => i.done).length;
    return { items, done, total: items.length, score: Math.round((done / items.length) * 100) };
  }, [query.data, hasAvatar, hasCustomPseudo]);

  return { ...query, data };
}
