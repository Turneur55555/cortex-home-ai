import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Kept for backward compat — module in DB is now always "maison"|"nutrition"|"sport". */
export type StockModule = string;

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Items for a specific room (room column = roomId). */
export function useStockItems(roomId: string) {
  return useQuery({
    queryKey: ["items", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("room", roomId)
        .order("expiration_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}

/** Lightweight overview stats — grouped client-side by room. */
export function useAllStockStats() {
  return useQuery({
    queryKey: ["items_stats"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, room, location, expiration_date, quantity, low_stock_threshold")
        .eq("module", "maison")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

type AddInput = {
  room: string;
  location?: string | null;
  name: string;
  quantity?: number;
  unit?: string | null;
  expiration_date?: string | null;
  alert_days_before?: number;
  notes?: string | null;
  low_stock_threshold?: number | null;
  calories_per_100g?: number | null;
  protein_per_100g?: number | null;
  carbs_per_100g?: number | null;
  fat_per_100g?: number | null;
  fiber_per_100g?: number | null;
  sugar_per_100g?: number | null;
  sodium_per_100g?: number | null;
};

export function useAddStockItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("items").insert({
        ...input,
        user_id: user.id,
        module: "maison",
        category: "autre",
      });
      if (error) throw error;
      return input.room;
    },
    onSuccess: (room) => {
      toast.success("Item ajouté");
      qc.invalidateQueries({ queryKey: ["items", room] });
      qc.invalidateQueries({ queryKey: ["items_stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** id + roomId (for cache) + any field to patch. */
export function useUpdateStockItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      roomId,
      patch,
    }: {
      id: string;
      roomId: string;
      patch: TablesUpdate<"items">;
    }) => {
      const { error } = await supabase.from("items").update(patch).eq("id", id);
      if (error) throw error;
      return roomId;
    },
    onSuccess: (roomId) => {
      qc.invalidateQueries({ queryKey: ["items", roomId] });
      qc.invalidateQueries({ queryKey: ["items_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteStockItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, roomId }: { id: string; roomId: string }) => {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
      return roomId;
    },
    onSuccess: (roomId) => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["items", roomId] });
      qc.invalidateQueries({ queryKey: ["items_stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkDeleteStockItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, roomId }: { ids: string[]; roomId: string }) => {
      if (ids.length === 0) return roomId;
      const { error } = await supabase.from("items").delete().in("id", ids);
      if (error) throw error;
      return roomId;
    },
    onSuccess: (roomId, vars) => {
      toast.success(`${vars.ids.length} supprimé(s)`);
      qc.invalidateQueries({ queryKey: ["items", roomId] });
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
      roomId,
    }: {
      items: { id: string; quantity: number }[];
      roomId: string;
    }) => {
      if (items.length === 0) return roomId;
      await Promise.all(
        items.map((it) =>
          supabase.from("items").update({ quantity: it.quantity }).eq("id", it.id),
        ),
      );
      return roomId;
    },
    onSuccess: (roomId, vars) => {
      toast.success(`${vars.items.length} ajusté(s)`);
      qc.invalidateQueries({ queryKey: ["items", roomId] });
      qc.invalidateQueries({ queryKey: ["items_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
