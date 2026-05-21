import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export const ReminderPriority = ["low", "medium", "high", "urgent"] as const;
export const ReminderStatus = ["todo", "in_progress", "done"] as const;
export const ReminderRecurrence = ["none", "daily", "weekly", "monthly", "yearly"] as const;

export type ReminderPriority = (typeof ReminderPriority)[number];
export type ReminderStatus = (typeof ReminderStatus)[number];
export type ReminderRecurrence = (typeof ReminderRecurrence)[number];

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  due_at: string | null;
  all_day: boolean;
  priority: ReminderPriority;
  status: ReminderStatus;
  recurrence: ReminderRecurrence;
  recurrence_until: string | null;
  notify_before_minutes: number;
  favorite: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const reminderInputSchema = z.object({
  title: z.string().trim().min(1, "Titre requis").max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  due_at: z.string().nullable().optional(),
  all_day: z.boolean().optional(),
  priority: z.enum(ReminderPriority).optional(),
  status: z.enum(ReminderStatus).optional(),
  recurrence: z.enum(ReminderRecurrence).optional(),
  recurrence_until: z.string().nullable().optional(),
  notify_before_minutes: z.number().int().min(0).max(10080).optional(),
  favorite: z.boolean().optional(),
});

export type ReminderInput = z.infer<typeof reminderInputSchema>;

const TABLE = "reminders" as const;
const db = () => (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from(TABLE);

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
  return updateReminder(r.id, {
    status: done ? "done" : "todo",
  } as Partial<ReminderInput>).then(async (res) => {
    await db().update({ completed_at: done ? new Date().toISOString() : null }).eq("id", r.id);
    return { ...res, completed_at: done ? new Date().toISOString() : null };
  });
}

export async function toggleFavorite(r: Reminder): Promise<Reminder> {
  return updateReminder(r.id, { favorite: !r.favorite });
}
