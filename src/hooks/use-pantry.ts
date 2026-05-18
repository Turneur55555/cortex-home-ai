import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PantryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  location: string | null;
  expiration_date: string | null;
  calories_per_100g: number | null;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  fiber_per_100g: number | null;
  sugar_per_100g: number | null;
  sodium_per_100g: number | null;
  low_stock_threshold: number | null;
};

// ─── Pantry query (cuisine items, qty > 0) ────────────────────────────────────

export function usePantryItems() {
  return useQuery({
    queryKey: ["items", "cuisine"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select(
          "id, name, quantity, unit, location, expiration_date, " +
          "calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, " +
          "fiber_per_100g, sugar_per_100g, sodium_per_100g, low_stock_threshold",
        )
        .eq("room", "cuisine")
        .gt("quantity", 0)
        .order("name")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as PantryItem[];
    },
  });
}

// ─── Deduct from stock ────────────────────────────────────────────────────────

type HistoryClient = {
  from: (t: string) => { insert: (v: unknown) => Promise<unknown> };
};

export function useDeductFromStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      quantityUsed,
      mealName,
    }: {
      itemId: string;
      quantityUsed: number;
      mealName: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { data: item, error: fetchErr } = await supabase
        .from("items")
        .select("id, name, quantity, room")
        .eq("id", itemId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!item) throw new Error("Item introuvable");

      if (item.quantity < quantityUsed) {
        throw new Error(
          `Stock insuffisant — ${item.name} : ${item.quantity} disponible${item.quantity > 1 ? "s" : ""}`,
        );
      }

      const newQty = Math.max(0, item.quantity - quantityUsed);

      const { error: updateErr } = await supabase
        .from("items")
        .update({ quantity: newQty })
        .eq("id", itemId);
      if (updateErr) throw updateErr;

      void (supabase as unknown as HistoryClient).from("stock_history").insert({
        user_id: user.id,
        item_id: itemId,
        item_name: item.name,
        action_type: "consumed",
        quantity_before: item.quantity,
        quantity_after: newQty,
        source: "nutrition",
        meal_name: mealName,
        room_id: item.room ?? "cuisine",
      });

      return { room: (item.room as string | null) ?? "cuisine" };
    },
    onSuccess: ({ room }) => {
      qc.invalidateQueries({ queryKey: ["items", room] });
      qc.invalidateQueries({ queryKey: ["items", "cuisine"] });
      qc.invalidateQueries({ queryKey: ["items_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Full item update (edit sheet + move) ────────────────────────────────────

type ItemPatch = {
  name?: string;
  quantity?: number;
  unit?: string | null;
  location?: string | null;
  module?: string;
  room?: string | null;
  expiration_date?: string | null;
  notes?: string | null;
  low_stock_threshold?: number | null;
  alert_days_before?: number;
  calories_per_100g?: number | null;
  protein_per_100g?: number | null;
  carbs_per_100g?: number | null;
  fat_per_100g?: number | null;
  fiber_per_100g?: number | null;
  sugar_per_100g?: number | null;
  sodium_per_100g?: number | null;
};

export function useUpdateItemFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      oldRoom,
      oldQuantity,
      itemName,
    }: {
      id: string;
      patch: ItemPatch;
      oldRoom: string;
      oldQuantity: number;
      itemName: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { error } = await supabase.from("items").update(patch).eq("id", id);
      if (error) throw error;

      if (patch.quantity !== undefined && patch.quantity !== oldQuantity) {
        void (supabase as unknown as HistoryClient).from("stock_history").insert({
          user_id: user.id,
          item_id: id,
          item_name: itemName,
          action_type: "adjusted",
          quantity_before: oldQuantity,
          quantity_after: patch.quantity,
          source: "manual",
          room_id: patch.room ?? oldRoom,
        });
      }

      return { oldRoom, newRoom: patch.room ?? oldRoom };
    },
    onSuccess: ({ oldRoom, newRoom }) => {
      toast.success("Modifié");
      qc.invalidateQueries({ queryKey: ["items", oldRoom] });
      if (newRoom !== oldRoom) {
        qc.invalidateQueries({ queryKey: ["items", newRoom] });
      }
      qc.invalidateQueries({ queryKey: ["items_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Realtime subscription ────────────────────────────────────────────────────

export function useItemsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("items_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => {
        qc.invalidateQueries({ queryKey: ["items"] });
        qc.invalidateQueries({ queryKey: ["items_stats"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
