import { z } from "zod";

export const REMINDER_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const REMINDER_STATUSES = ["todo", "in_progress", "done"] as const;
export const REMINDER_RECURRENCES = ["none", "daily", "weekly", "monthly", "yearly"] as const;

export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];
export type ReminderRecurrence = (typeof REMINDER_RECURRENCES)[number];

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
  priority: z.enum(REMINDER_PRIORITIES).optional(),
  status: z.enum(REMINDER_STATUSES).optional(),
  recurrence: z.enum(REMINDER_RECURRENCES).optional(),
  recurrence_until: z.string().nullable().optional(),
  notify_before_minutes: z.number().int().min(0).max(10080).optional(),
  favorite: z.boolean().optional(),
});

export type ReminderInput = z.infer<typeof reminderInputSchema>;

export const PRIORITY_LABEL: Record<ReminderPriority, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
};

export const STATUS_LABEL: Record<ReminderStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
};

export const RECURRENCE_LABEL: Record<ReminderRecurrence, string> = {
  none: "Aucune",
  daily: "Quotidienne",
  weekly: "Hebdomadaire",
  monthly: "Mensuelle",
  yearly: "Annuelle",
};
