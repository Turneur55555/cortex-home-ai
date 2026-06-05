import { useEffect } from "react";
import type { Reminder } from "@/types/reminder";

const STORAGE_KEY = "icortex.reminders_notified_v2";

/** Per-occurrence key so a recurring reminder re-fires on each new due date. */
function occurrenceKey(r: Reminder): string {
  return `${r.id}::${r.due_at ?? ""}`;
}

function loadSent(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return new Set<string>();
  }
}

function saveSent(sent: Set<string>) {
  // Cap to avoid unbounded growth.
  const arr = [...sent].slice(-500);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

async function fire(title: string, body: string, tag: string) {
  try {
    // Prefer Service Worker notifications when available (required on iOS PWA,
    // and survives tab focus changes on Android).
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png" });
        return;
      }
    }
    new Notification(title, { body, tag, icon: "/icons/icon-192.png" });
  } catch {
    /* swallow — notification API failures are non-fatal */
  }
}

/**
 * Schedules browser notifications for upcoming reminders.
 * - Polls every 15s and fires inside [due - notifyBefore, due + 5min].
 * - Dedupes per occurrence via localStorage so recurring reminders re-fire.
 * - Does NOT auto-request permission (browsers require a user gesture);
 *   use `requestReminderNotificationPermission()` from a click handler.
 */
export function useReminderNotifications(reminders: Reminder[]) {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const now = Date.now();
      const sent = loadSent();
      let changed = false;

      reminders.forEach((r) => {
        if (!r.due_at || r.status === "done") return;
        const due = new Date(r.due_at).getTime();
        const fireAt = due - r.notify_before_minutes * 60_000;
        // Window: [fireAt, due + 5min] — wider tail so a closed tab catches up on reopen.
        if (now < fireAt || now > due + 5 * 60_000) return;
        const key = occurrenceKey(r);
        if (sent.has(key)) return;

        const minsToDue = Math.round((due - now) / 60_000);
        const body =
          minsToDue > 0
            ? `Dans ${minsToDue} min${minsToDue > 1 ? "s" : ""}`
            : minsToDue === 0
            ? "Maintenant"
            : `Échu il y a ${Math.abs(minsToDue)} min`;

        void fire(r.title, r.description?.trim() || body, r.id);
        sent.add(key);
        changed = true;
      });

      if (changed) saveSent(sent);
    };

    tick();
    const id = setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [reminders]);
}

/** Call from a user gesture (button click) to prompt for permission. */
export async function requestReminderNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}
