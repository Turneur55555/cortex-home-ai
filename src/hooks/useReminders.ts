import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  createReminder,
  deleteReminder,
  listReminders,
  toggleComplete,
  toggleFavorite,
  updateReminder,
  type Reminder,
  type ReminderInput,
} from "@/services/reminders";

const KEY = ["reminders"] as const;

export function useReminders() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("reminders_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders" },
        () => qc.invalidateQueries({ queryKey: KEY }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return useQuery({
    queryKey: KEY,
    queryFn: listReminders,
    staleTime: 30_000,
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReminderInput) => createReminder(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
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
      if (prev) {
        qc.setQueryData<Reminder[]>(
          KEY,
          prev.map((r) => (r.id === id ? { ...r, ...patch } as Reminder : r)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReminder(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Reminder[]>(KEY);
      if (prev) qc.setQueryData<Reminder[]>(KEY, prev.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useToggleComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: Reminder) => toggleComplete(r),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: Reminder) => toggleFavorite(r),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
