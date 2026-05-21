import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  deleteCategories,
  reorderCategories,
} from "@/services/homeCategories";

import type {
  HomeCategory,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/types/home";

const QK = ["home_categories"] as const;

// ─── Query ────────────────────────────────────────────────────────────────────

export function useHomeCategories() {
  const qc = useQueryClient();
  const seededRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const query = useQuery({
    queryKey: QK,
    queryFn: getCategories,
    staleTime: 60_000,
  });

  // Auto-seed si aucune catégorie n'existe (protection frontend)
  useEffect(() => {
    if (query.isLoading || query.error) return;
    if ((query.data?.length ?? -1) !== 0) return;
    if (seededRef.current) return;
    seededRef.current = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("ensure_home_categories_for_me").then(({ error }: { error: unknown }) => {
      if (!error) void qc.invalidateQueries({ queryKey: QK });
    });
  }, [query.isLoading, query.error, query.data, qc]);

  // Realtime — StrictMode-safe, sans race condition async
  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;

      const userId = data.user.id;
      // Nom unique par montage : évite la réutilisation d'un canal déjà souscrit
      const channelName = `home_categories:${userId}:${Date.now()}`;

      const invalidate = () => void qc.invalidateQueries({ queryKey: QK });
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "home_categories", filter: `user_id=eq.${userId}` },
          invalidate,
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "home_categories", filter: `user_id=eq.${userId}` },
          invalidate,
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "home_categories", filter: `user_id=eq.${userId}` },
          invalidate,
        )
        .subscribe();

      // Si le cleanup a tiré pendant getUser(), on supprime immédiatement
      if (cancelled) {
        void supabase.removeChannel(channel);
        return;
      }

      channelRef.current = channel;
    };

    void setup();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [qc]);

  return query;
}

// ─── Lookup helper ────────────────────────────────────────────────────────────

export function useCategoryBySlug(slug: string): HomeCategory | undefined {
  const { data } = useHomeCategories();
  return data?.find((c) => c.slug === slug);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => createCategory(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK });
      toast.success("Catégorie créée");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateCategoryInput }) =>
      updateCategory(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<HomeCategory[]>(QK);
      qc.setQueryData<HomeCategory[]>(QK, (old = []) =>
        old.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: QK }),
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK });
      toast.success("Catégorie supprimée");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkDeleteCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deleteCategories(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<HomeCategory[]>(QK);
      const set = new Set(ids);
      qc.setQueryData<HomeCategory[]>(QK, (old = []) => old.filter((c) => !set.has(c.id)));
      return { prev };
    },
    onSuccess: (_d, ids) => {
      toast.success(
        ids.length > 1
          ? `${ids.length} catégories supprimées`
          : "Catégorie supprimée",
      );
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: QK }),
  });
}


// ─── Reorder ──────────────────────────────────────────────────────────────────

export function useReorderCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ordered: { id: string; position: number }[]) =>
      reorderCategories(ordered),
    onMutate: async (ordered) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<HomeCategory[]>(QK);
      const posMap = new Map(ordered.map((o) => [o.id, o.position]));
      qc.setQueryData<HomeCategory[]>(QK, (old = []) =>
        [...old]
          .map((c) => ({ ...c, position: posMap.get(c.id) ?? c.position }))
          .sort((a, b) => a.position - b.position),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: QK }),
  });
}
