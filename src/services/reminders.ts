import { supabase } from "@/integrations/supabase/client";
import {
  reminderInputSchema,
  type Reminder,
  type ReminderInput,
  type ReminderRecurrence,
} from "@/types/reminder";

const TABLE = "reminders" as const;
const db = () =>
  (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from(TABLE);

/** Advance a date by one recurrence step. Returns null for "none". */
function advanceOnce(d: Date, recurrence: ReminderRecurrence): Date | null {
  const next = new Date(d);
  switch (recurrence) {
    case "daily":
      next.setDate(next.getDate() + 1);
      return next;
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      return next;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      return next;
    default:
      return null;
  }
}

/** Compute the next future occurrence strictly after `now`. */
function nextFutureOccurrence(
  dueIso: string,
  recurrence: ReminderRecurrence,
  recurrenceUntilIso: string | null,
  now: Date = new Date(),
): Date | null {
  if (recurrence === "none") return null;
  let cur = new Date(dueIso);
  const until = recurrenceUntilIso ? new Date(recurrenceUntilIso) : null;
  // Guard against pathological loops (e.g. ~10 years of daily catch-up).
  for (let i = 0; i < 4000; i++) {
    const n = advanceOnce(cur, recurrence);
    if (!n) return null;
    cur = n;
    if (until && cur > until) return null;
    if (cur > now) return cur;
  }
  return null;
}

/**
 * For each recurring reminder whose due date is in the past, roll the due date
 * forward to the next future occurrence and reset status to "todo".
 * Fire-and-forget; UI gets the fresh rows on the next fetch.
 */
async function rolloverRecurring(rows: Reminder[]): Promise<Reminder[]> {
  const now = new Date();
  const updates: Promise<unknown>[] = [];
  const patched = rows.map((r) => {
    if (r.recurrence === "none" || !r.due_at) return r;
    const due = new Date(r.due_at);
    if (due > now && r.status !== "done") return r;
    const next = nextFutureOccurrence(r.due_at, r.recurrence, r.recurrence_until, now);
    if (!next) return r;
    const nextIso = next.toISOString();
    updates.push(
      db()
        .update({ due_at: nextIso, status: "todo", completed_at: null })
        .eq("id", r.id),
    );
    return { ...r, due_at: nextIso, status: "todo" as const, completed_at: null };
  });
  if (updates.length) {
    // Don't block UI on the writes; errors are non-fatal.
    Promise.allSettled(updates).catch(() => undefined);
  }
  return patched;
}

export async function listReminders(): Promise<Reminder[]> {
  const { data, error } = await db()
    .select("*")
    .order("favorite", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Reminder[];
  return rolloverRecurring(rows);
}

export async function createReminder(input: ReminderInput): Promise<Reminder> {
  const parsed = reminderInputSchema.parse(input);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Non authentifié");
  const { data, error } = await db()
    .insert({ ...parsed, user_id: auth.user.id })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Reminder;
}

export async function updateReminder(id: string, patch: Partial<ReminderInput>): Promise<Reminder> {
  const parsed = reminderInputSchema.partial().parse(patch);
  const { data, error } = await db().update(parsed).eq("id", id).select("*").single();
  if (error) throw error;
  return data as unknown as Reminder;
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await db().delete().eq("id", id);
  if (error) throw error;
}

export async function toggleComplete(r: Reminder): Promise<Reminder> {
  const becomingDone = r.status !== "done";

  // For recurring reminders being completed: advance to next occurrence
  // instead of marking done, so it "reappears" on the next day/week/etc.
  if (becomingDone && r.recurrence !== "none" && r.due_at) {
    const next = nextFutureOccurrence(r.due_at, r.recurrence, r.recurrence_until);
    if (next) {
      const nextIso = next.toISOString();
      const { data, error } = await db()
        .update({ due_at: nextIso, status: "todo", completed_at: null })
        .eq("id", r.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as Reminder;
    }
  }

  const done = becomingDone;
  const res = await updateReminder(r.id, { status: done ? "done" : "todo" });
  await db().update({ completed_at: done ? new Date().toISOString() : null }).eq("id", r.id);
  return { ...res, completed_at: done ? new Date().toISOString() : null };
}

export async function toggleFavorite(r: Reminder): Promise<Reminder> {
  return updateReminder(r.id, { favorite: !r.favorite });
}
