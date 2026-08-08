import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";
import { getIsOnline } from "@/lib/offline/networkStatus";
const supabase = supabaseTyped as any;

// Favoris nutritionnels — aliments/repas réutilisables en 1 tap.
// Offline-first (cf. src/lib/offline/) : premier module migré vers le
// repository générique — lecture/écriture toujours locales (IndexedDB)
// d'abord, synchronisation vers Supabase en arrière-plan via la sync queue.
export type NutritionFavorite = {
  id: string;
  user_id: string;
  name: string;
  meal: string | null;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  created_at: string;
  updated_at: string;
};

export type NewFavorite = Pick<
  NutritionFavorite,
  "name" | "meal" | "calories" | "proteins" | "carbs" | "fats"
>;

const favoritesRepo = createOfflineRepository<NutritionFavorite>("nutrition_favorites");

const FAVORITES_KEY = ["nutrition_favorites"] as const;

export function useNutritionFavorites() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: [...FAVORITES_KEY, userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<NutritionFavorite[]> => {
      if (!userId) return [];
      // Hydratation best-effort depuis Supabase quand en ligne — ne bloque
      // jamais la lecture locale (source de vérité immédiate) en cas
      // d'échec réseau, cf. stratégie offline-first.
      if (getIsOnline()) {
        try {
          const { data, error } = await supabase
            .from("nutrition_favorites")
            .select(
              "id, user_id, name, meal, calories, proteins, carbs, fats, created_at, updated_at",
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(30);
          if (!error && data) {
            await hydrateEntitiesFromServer(
              "nutrition_favorites",
              userId,
              data as NutritionFavorite[],
            );
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }
      const local = await favoritesRepo.list(userId);
      return [...local].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);
    },
  });
}

export function useAddFavorite() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (fav: NewFavorite) => {
      if (!user) throw new Error("Non authentifié");
      return favoritesRepo.create(user.id, fav);
    },
    onSuccess: () => {
      toast.success("Ajouté aux favoris");
      qc.invalidateQueries({ queryKey: FAVORITES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteFavorite() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      await favoritesRepo.remove(id, user.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FAVORITES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
