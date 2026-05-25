import { useEffect } from "react";
import type { Reminder } from "@/types/reminder";

const STORAGE_KEY = "icortex.reminders_notified";

/**
 * Schedules browser notifications for upcoming reminders.
 * - Requests permission once on mount.
 * - Polls every 30s and fires a notification within the [due - notifyBefore, due + 60s] window.
 * - Dedupes via sessionStorage so a notification only fires once per session.
 */
export function useReminderNotifications(reminders: Reminder[]) {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const sent = new Set<string>(
      JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]"),
    );

    const tick = () => {
      const now = Date.now();
      reminders.forEach((r) => {
        if (!r.due_at || r.status === "done") return;
        const due = new Date(r.due_at).getTime();
        const fire = due - r.notify_before_minutes * 60_000;
        if (now >= fire && now < due + 60_000 && !sent.has(r.id)) {
          new Notification(r.title, {
            body: r.description ?? "Rappel ICORTEX",
            tag: r.id,
          });
          sent.add(r.id);
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...sent]));
        }
      });
    };

    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [reminders]);
}
