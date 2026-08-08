import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";

/**
 * `supplements` (catalogue perso, id + updated_at) est offline-first (cf.
 * src/lib/offline/), même pattern que `useRecipes.ts` : écriture toujours
 * locale (IndexedDB) d'abord, sync en arrière-plan.
 *
 * `supplement_logs` reste ONLINE-ONLY : pas de colonne `updated_at`, et son
 * upsert est indexé sur la clé composite `(user_id, supplement_id, date)`
 * plutôt que sur `id` — incompatible avec le repository générique qui
 * suppose une identité par `id` (même raisonnement que `nutrition_goals`
 * exclue en vague précédente). Conséquence hors connexion : la liste des
 * compléments reste consultable (cache local), mais cocher/décocher "pris
 * aujourd'hui" nécessite une connexion.
 */

export type Supplement = {
  id: string;
  user_id: string;
  name: string;
  dosage: string | null;
  unit: string | null;
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplementLog = {
  id: string;
  user_id: string;
  supplement_id: string;
  date: string;
  taken: boolean;
  created_at: string;
};

export type SupplementWithLog = Supplement & { taken: boolean };

export const supplementsRepo = createOfflineRepository<Supplement>("supplements");

async function listSupplements(userId: string): Promise<Supplement[]> {
  if (getIsOnline()) {
    try {
      const { data, error } = await supabase.from("supplements").select("*").eq("user_id", userId);
      if (!error && data) {
        await hydrateEntitiesFromServer("supplements", userId, data as Supplement[]);
      }
    } catch {
      // Hors ligne ou erreur réseau : on continue avec le store local.
    }
  }
  const local = await supplementsRepo.list(userId);
  return [...local].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function useSupplements(date: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ["supplements", date, userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<SupplementWithLog[]> => {
      if (!userId) return [];
      const sups = (await listSupplements(userId)).filter((s) => s.is_active);

      let takenSet = new Set<string>();
      try {
        const { data: logs, error: lErr } = await supabase
          .from("supplement_logs")
          .select("*")
          .eq("user_id", userId)
          .eq("date", date);
        if (!lErr && logs) {
          takenSet = new Set(
            ((logs ?? []) as SupplementLog[]).filter((l) => l.taken).map((l) => l.supplement_id),
          );
        }
      } catch {
        // Hors ligne : impossible de savoir ce qui a été coché aujourd'hui,
        // on affiche la liste sans état "pris" plutôt que de tout faire échouer.
      }

      return sups.map((s) => ({ ...s, taken: takenSet.has(s.id) }));
    },
  });
}

export function useAllSupplements() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ["supplements", "all", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Supplement[]> => {
      if (!userId) return [];
      return listSupplements(userId);
    },
  });
}

export function useCreateSupplement() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      dosage?: string | null;
      unit?: string | null;
      notes?: string | null;
    }) => {
      if (!user) throw new Error("Non authentifié");
      await supplementsRepo.create(user.id, {
        name: input.name.trim(),
        dosage: input.dosage?.trim() || null,
        unit: input.unit?.trim() || null,
        notes: input.notes?.trim() || null,
        sort_order: 0,
        is_active: true,
      });
    },
    onSuccess: () => {
      toast.success("Complément ajouté");
      qc.invalidateQueries({ queryKey: ["supplements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateSupplement() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<Supplement, "name" | "dosage" | "unit" | "notes" | "is_active" | "sort_order">
      >;
    }) => {
      if (!user) throw new Error("Non authentifié");
      await supplementsRepo.update(id, user.id, patch);
    },
    onSuccess: () => {
      toast.success("Complément mis à jour");
      qc.invalidateQueries({ queryKey: ["supplements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteSupplement() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      await supplementsRepo.remove(id, user.id);
    },
    onSuccess: () => {
      toast.success("Complément supprimé");
      qc.invalidateQueries({ queryKey: ["supplements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Journal de prise (`supplement_logs`) — online-only, cf. note d'en-tête. */
export function useToggleSupplementLog(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ supplement_id, taken }: { supplement_id: string; taken: boolean }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      if (taken) {
        const { error } = await supabase.from("supplement_logs").upsert(
          {
            user_id: user.id,
            supplement_id,
            date,
            taken: true,
          },
          { onConflict: "user_id,supplement_id,date" },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("supplement_logs")
          .delete()
          .eq("user_id", user.id)
          .eq("supplement_id", supplement_id)
          .eq("date", date);
        if (error) throw error;
      }
    },
    onMutate: async ({ supplement_id, taken }) => {
      await qc.cancelQueries({ queryKey: ["supplements", date] });
      const prev = qc.getQueryData<SupplementWithLog[]>(["supplements", date]);
      qc.setQueryData<SupplementWithLog[]>(["supplements", date], (old) =>
        (old ?? []).map((s) => (s.id === supplement_id ? { ...s, taken } : s)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["supplements", date], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["supplements", date] });
    },
  });
}

export function useSupplementHistory(days = 30) {
  return useQuery({
    queryKey: ["supplements", "history", days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const isoSince = since.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("supplement_logs")
        .select("*, supplements(name, dosage, unit)")
        .gte("date", isoSince)
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
