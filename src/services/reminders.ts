import { supabase } from "@/integrations/supabase/client";
import {
  reminderInputSchema,
  type Reminder,
  type ReminderInput,
} from "@/types/reminder";

const TABLE = "reminders" as const;
const db = () =>
  (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from(TABLE);

export async function listReminders(): Promise<Reminder[]> {
  const { data, error } = await db()
    .select("*")
    .order("favorite", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Reminder[];
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
  const done = r.status !== "done";
  const res = await updateReminder(r.id, { status: done ? "done" : "todo" });
  await db().update({ completed_at: done ? new Date().toISOString() : null }).eq("id", r.id);
  return { ...res, completed_at: done ? new Date().toISOString() : null };
}

export async function toggleFavorite(r: Reminder): Promise<Reminder> {
  return updateReminder(r.id, { favorite: !r.favorite });
}
