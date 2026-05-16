import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  subscribeCategories,
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
    console.log("[useHomeCategories] aucune catégorie, seed automatique…");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("ensure_home_categories_for_me").then(({ error }: { error: unknown }) => {
      if (error) console.error("[useHomeCategories] seed échoué :", error);
      else void qc.invalidateQueries({ queryKey: QK });
    });
  }, [query.isLoading, query.error, query.data, qc]);

  // Realtime subscription
  useEffect(() => {
    let unsub: (() => void) | undefined;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      unsub = subscribeCategories(data.user.id, () => {
        void qc.invalidateQueries({ queryKey: QK });
      });
    });
    return () => unsub?.();
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
