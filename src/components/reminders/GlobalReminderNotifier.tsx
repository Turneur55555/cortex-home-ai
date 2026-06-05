import { useReminders } from "@/hooks/useReminders";
import { useReminderNotifications } from "@/hooks/useReminderNotifications";

/**
 * Mount once at the app shell level so reminder notifications fire on every
 * authenticated route — not only when the /rappels page is open.
 */
export function GlobalReminderNotifier() {
  const { data: reminders = [] } = useReminders();
  useReminderNotifications(reminders);
  return null;
}
