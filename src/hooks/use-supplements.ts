import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";

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

export function useSupplements(date: string) {
  return useQuery({
    queryKey: ["supplements", date],
    staleTime: 30_000,
    queryFn: async (): Promise<SupplementWithLog[]> => {
      const [{ data: sups, error: sErr }, { data: logs, error: lErr }] =
        await Promise.all([
          supabase
            .from("supplements")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase.from("supplement_logs").select("*").eq("date", date),
        ]);
      if (sErr) throw sErr;
      if (lErr) throw lErr;
      const takenSet = new Set(
        ((logs ?? []) as SupplementLog[])
          .filter((l) => l.taken)
          .map((l) => l.supplement_id),
      );
      return ((sups ?? []) as Supplement[]).map((s) => ({
        ...s,
        taken: takenSet.has(s.id),
      }));
    },
  });
}

export function useAllSupplements() {
  return useQuery({
    queryKey: ["supplements", "all"],
    queryFn: async (): Promise<Supplement[]> => {
      const { data, error } = await supabase
        .from("supplements")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Supplement[];
    },
  });
}

export function useCreateSupplement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      dosage?: string | null;
      unit?: string | null;
      notes?: string | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("supplements").insert({
        user_id: user.id,
        name: input.name.trim(),
        dosage: input.dosage?.trim() || null,
        unit: input.unit?.trim() || null,
        notes: input.notes?.trim() || null,
      });
      if (error) throw error;
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
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Supplement, "name" | "dosage" | "unit" | "notes" | "is_active" | "sort_order">>;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("supplements")
        .update(patch)
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
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
  return useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("supplements")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Complément supprimé");
      qc.invalidateQueries({ queryKey: ["supplements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleSupplementLog(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      supplement_id,
      taken,
    }: {
      supplement_id: string;
      taken: boolean;
    }) => {
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
        logActivity("supplement", "Complément coché", { date });
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
        (old ?? []).map((s) =>
          s.id === supplement_id ? { ...s, taken } : s,
        ),
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
