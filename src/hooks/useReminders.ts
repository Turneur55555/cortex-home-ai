import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  createReminder,
  deleteReminder,
  listReminders,
  toggleComplete,
  toggleFavorite,
  updateReminder,
} from "@/services/reminders";
import type { Reminder, ReminderInput } from "@/types/reminder";

/**
 * Centralized query-key factory. Use everywhere instead of inline arrays
 * to keep invalidation/setQueryData call-sites consistent.
 */
export const reminderKeys = {
  all: ["reminders"] as const,
  list: () => [...reminderKeys.all] as const,
};

const KEY = reminderKeys.list();

/** Helper: patch a single reminder in the cached list without refetch. */
function patchInCache(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  patch: Partial<Reminder>,
) {
  qc.setQueryData<Reminder[]>(KEY, (prev) =>
    prev ? prev.map((r) => (r.id === id ? ({ ...r, ...patch } as Reminder) : r)) : prev,
  );
}

export function useReminders() {
  const qc = useQueryClient();

  // Throttle realtime invalidations to avoid storms when many rows mutate at once.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel("reminders_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders" },
        () => {
          if (pending.current) return;
          pending.current = setTimeout(() => {
            pending.current = null;
            qc.invalidateQueries({ queryKey: KEY });
          }, 250);
        },
      )
      .subscribe();
    return () => {
      if (pending.current) clearTimeout(pending.current);
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return useQuery({
    queryKey: KEY,
    queryFn: listReminders,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReminderInput) => createReminder(input),
    // Use server response directly; skip a redundant list refetch.
    onSuccess: (created) => {
      qc.setQueryData<Reminder[]>(KEY, (prev) => (prev ? [created, ...prev] : prev));
    },
  });
}

export function useUpdateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ReminderInput> }) =>
      updateReminder(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Reminder[]>(KEY);
      patchInCache(qc, id, patch as Partial<Reminder>);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    // Reconcile with server response — no full refetch needed.
    onSuccess: (updated) => patchInCache(qc, updated.id, updated),
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReminder(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Reminder[]>(KEY);
      qc.setQueryData<Reminder[]>(KEY, (p) => (p ? p.filter((r) => r.id !== id) : p));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
  });
}

export function useToggleComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: Reminder) => toggleComplete(r),
    onMutate: async (r) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Reminder[]>(KEY);
      const done = r.status !== "done";
      patchInCache(qc, r.id, {
        status: done ? "done" : "todo",
        completed_at: done ? new Date().toISOString() : null,
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSuccess: (updated) => patchInCache(qc, updated.id, updated),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: Reminder) => toggleFavorite(r),
    onMutate: async (r) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Reminder[]>(KEY);
      patchInCache(qc, r.id, { favorite: !r.favorite });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSuccess: (updated) => patchInCache(qc, updated.id, updated),
  });
}
