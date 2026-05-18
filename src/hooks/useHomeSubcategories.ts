import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from "@/services/homeSubcategories";
import type {
  HomeSubcategory,
  CreateSubcategoryInput,
  UpdateSubcategoryInput,
} from "@/types/home";

const qk = (categoryId: string) => ["home_subcategories", categoryId] as const;

// ─── Query ────────────────────────────────────────────────────────────────────

export function useHomeSubcategories(categoryId: string | undefined) {
  return useQuery({
    queryKey: qk(categoryId ?? ""),
    queryFn: () => getSubcategories(categoryId!),
    enabled: !!categoryId,
    staleTime: 60_000,
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function useCreateSubcategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubcategoryInput) => createSubcategory(input),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: qk(variables.category_id) });
      toast.success("Compartiment créé");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function useUpdateSubcategory(categoryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSubcategoryInput }) =>
      updateSubcategory(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk(categoryId) });
      const prev = qc.getQueryData<HomeSubcategory[]>(qk(categoryId));
      qc.setQueryData<HomeSubcategory[]>(qk(categoryId), (old = []) =>
        old.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk(categoryId), ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk(categoryId) }),
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteSubcategory(categoryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSubcategory(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk(categoryId) });
      toast.success("Compartiment supprimé");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
