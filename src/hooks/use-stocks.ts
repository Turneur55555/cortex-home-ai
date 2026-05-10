import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type StockModule = "alimentation" | "pharmacie" | "habits" | "menager";

export const STOCK_MODULE_LABELS: Record<StockModule, string> = {
  alimentation: "Alimentation",
  pharmacie: "Pharmacie",
  habits: "Garde-robe",
  menager: "Ménager",
};

export function useStockItems(module: StockModule) {
  return useQuery({
    queryKey: ["items", module],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("module", module)
        .order("expiration_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}

export function useAddStockItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<TablesInsert<"items">, "user_id"> & { module: StockModule },
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("items").insert({ ...input, user_id: user.id });
      if (error) throw error;
      return input.module;
    },
    onSuccess: (module) => {
      toast.success("Item ajouté");
      qc.invalidateQueries({ queryKey: ["items", module] });
      qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateStockItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      module,
      patch,
    }: {
      id: string;
      module: StockModule;
      patch: TablesUpdate<"items">;
    }) => {
      const { error } = await supabase.from("items").update(patch).eq("id", id);
      if (error) throw error;
      return module;
    },
    onSuccess: (module) => {
      qc.invalidateQueries({ queryKey: ["items", module] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteStockItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, module }: { id: string; module: StockModule }) => {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
      return module;
    },
    onSuccess: (module) => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["items", module] });
      qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkDeleteStockItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, module }: { ids: string[]; module: StockModule }) => {
      if (ids.length === 0) return module;
      const { error } = await supabase.from("items").delete().in("id", ids);
      if (error) throw error;
      return module;
    },
    onSuccess: (module, vars) => {
      toast.success(`${vars.ids.length} supprimé(s)`);
      qc.invalidateQueries({ queryKey: ["items", module] });
      qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkAdjustStockItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      items,
      module,
    }: {
      items: { id: string; quantity: number }[];
      module: StockModule;
    }) => {
      if (items.length === 0) return module;
      await Promise.all(
        items.map((it) =>
          supabase.from("items").update({ quantity: it.quantity }).eq("id", it.id),
        ),
      );
      return module;
    },
    onSuccess: (module, vars) => {
      toast.success(`${vars.items.length} ajusté(s)`);
      qc.invalidateQueries({ queryKey: ["items", module] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
