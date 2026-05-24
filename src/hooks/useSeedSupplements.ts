import { useEffect, useRef } from "react";
import { useCreateReminder } from "@/hooks/useReminders";
import type { ReminderInput } from "@/services/reminders";

const SEED_FLAG = "icortex.supps_seeded_v1";

function seedTime(h: number, m: number): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const SUPPLEMENT_SEEDS: ReminderInput[] = [
  { title: "Créatine", description: "5g", category: "Suppléments", due_at: seedTime(8, 0), recurrence: "daily", priority: "medium", all_day: false, notify_before_minutes: 10 },
  { title: "Zinc", description: "15mg", category: "Suppléments", due_at: seedTime(20, 0), recurrence: "daily", priority: "medium", all_day: false, notify_before_minutes: 10 },
  { title: "Magnésium", description: "200mg", category: "Suppléments", due_at: seedTime(22, 0), recurrence: "daily", priority: "medium", all_day: false, notify_before_minutes: 10 },
  { title: "Hydratation", description: "Objectif 2L+", category: "Suppléments", due_at: seedTime(18, 0), recurrence: "daily", priority: "medium", all_day: false, notify_before_minutes: 10 },
];

/** Crée une seule fois la série de rappels suppléments par défaut. */
export function useSeedSupplements(isLoading: boolean) {
  const createMut = useCreateReminder();
  const done = useRef(false);

  useEffect(() => {
    if (isLoading || done.current) return;
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem(SEED_FLAG)) {
      done.current = true;
      return;
    }
    done.current = true;
    localStorage.setItem(SEED_FLAG, "1");
    SUPPLEMENT_SEEDS.forEach((s) => createMut.mutate(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);
}
