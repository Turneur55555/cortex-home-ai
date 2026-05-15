import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

// Legacy alias kept for backward compat with ScanSheet / BarcodeScannerSheet
export type StockModule = string;

export function useStockItems(roomId: string) {
  return useQuery({
    queryKey: ["items", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("module", roomId)
        .order("expiration_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}

/** Lightweight hook for computing per-room and per-compartment counts on the overview. */
export function useAllStockStats() {
  return useQuery({
    queryKey: ["items_stats"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, module, location, expiration_date")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddStockItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<TablesInsert<"items">, "user_id"> & { module: string },
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
      qc.invalidateQueries({ queryKey: ["items_stats"] });
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
      module: string;
      patch: TablesUpdate<"items">;
    }) => {
      const { error } = await supabase.from("items").update(patch).eq("id", id);
      if (error) throw error;
      return module;
    },
    onSuccess: (module) => {
      qc.invalidateQueries({ queryKey: ["items", module] });
      qc.invalidateQueries({ queryKey: ["items_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteStockItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, module }: { id: string; module: string }) => {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
      return module;
    },
    onSuccess: (module) => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["items", module] });
      qc.invalidateQueries({ queryKey: ["items_stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkDeleteStockItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, module }: { ids: string[]; module: string }) => {
      if (ids.length === 0) return module;
      const { error } = await supabase.from("items").delete().in("id", ids);
      if (error) throw error;
      return module;
    },
    onSuccess: (module, vars) => {
      toast.success(`${vars.ids.length} supprimé(s)`);
      qc.invalidateQueries({ queryKey: ["items", module] });
      qc.invalidateQueries({ queryKey: ["items_stats"] });
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
      module: string;
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
