import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export function useNutrition(date: string) {
  return useQuery({
    queryKey: ["nutrition", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition")
        .select("*")
        .eq("date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddNutrition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"nutrition">, "user_id">) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("nutrition").insert({ ...input, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Repas ajouté");
      qc.invalidateQueries({ queryKey: ["nutrition", vars.date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddNutritionBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: Array<Omit<TablesInsert<"nutrition">, "user_id">>) => {
      if (inputs.length === 0) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("nutrition")
        .insert(inputs.map((input) => ({ ...input, user_id: user.id })));
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      const n = vars.length;
      toast.success(`${n} aliment${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""}`);
      const date = vars[0]?.date as string | undefined;
      if (date) qc.invalidateQueries({ queryKey: ["nutrition", date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteNutrition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("nutrition")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["nutrition"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateNutrition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      date,
    }: {
      id: string;
      patch: TablesUpdate<"nutrition">;
      date: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("nutrition")
        .update(patch)
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["nutrition", vars.date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCopyNutritionDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      if (from === to) throw new Error("Choisis un autre jour à copier");
      const { data: rows, error } = await supabase
        .from("nutrition")
        .select("*")
        .eq("date", from);
      if (error) throw error;
      if (!rows || rows.length === 0) throw new Error("Aucun repas à copier ce jour-là");
      const clones = rows.map((r) => {
        const rec = r as Record<string, unknown>;
        const { id: _id, created_at: _ca, ...rest } = rec;
        return { ...rest, date: to, user_id: user.id } as TablesInsert<"nutrition">;
      });
      const { error: insErr } = await supabase.from("nutrition").insert(clones);
      if (insErr) throw insErr;
      return clones.length;
    },
    onSuccess: (n, vars) => {
      toast.success(`${n} repas copiés`);
      qc.invalidateQueries({ queryKey: ["nutrition", vars.to] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
