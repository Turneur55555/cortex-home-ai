// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useReminderNotifications,
  requestReminderNotificationPermission,
} from "./useReminderNotifications";
import type { Reminder } from "@/types/reminder";

const STORAGE_KEY = "icortex.reminders_notified_v2";

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  const base: Reminder = {
    id: "r-1",
    user_id: "u-1",
    title: "Prendre créatine",
    description: "5g",
    category: "Suppléments",
    due_at: new Date().toISOString(),
    all_day: false,
    priority: "medium",
    status: "todo",
    recurrence: "daily",
    recurrence_until: null,
    notify_before_minutes: 10,
    favorite: false,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

let notifSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();

  notifSpy = vi.fn();
  class FakeNotification {
    static permission: NotificationPermission = "granted";
    static requestPermission = vi.fn(async () => "granted" as NotificationPermission);
    constructor(title: string, opts?: NotificationOptions) {
      notifSpy(title, opts);
    }
  }
  // @ts-expect-error stub
  globalThis.Notification = FakeNotification;
  // Force fallback path (no SW registration)
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: vi.fn(async () => undefined) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // @ts-expect-error cleanup
  delete globalThis.Notification;
});

describe("useReminderNotifications — fenêtre de déclenchement", () => {
  it("ne déclenche pas avant la fenêtre [due - notifyBefore]", async () => {
    const due = new Date(Date.now() + 30 * 60_000).toISOString(); // dans 30 min
    const reminders = [makeReminder({ due_at: due, notify_before_minutes: 10 })];

    renderHook(() => useReminderNotifications(reminders));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(notifSpy).not.toHaveBeenCalled();
  });

  it("déclenche dans la fenêtre [due - notifyBefore, due + 5min]", async () => {
    const due = new Date(Date.now() + 5 * 60_000).toISOString(); // dans 5 min
    const reminders = [makeReminder({ due_at: due, notify_before_minutes: 10 })];

    renderHook(() => useReminderNotifications(reminders));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(notifSpy).toHaveBeenCalledTimes(1);
    expect(notifSpy.mock.calls[0][0]).toBe("Prendre créatine");
  });

  it("ne déclenche pas si due_at est passé de plus de 5 min", async () => {
    const due = new Date(Date.now() - 10 * 60_000).toISOString();
    const reminders = [makeReminder({ due_at: due })];

    renderHook(() => useReminderNotifications(reminders));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(notifSpy).not.toHaveBeenCalled();
  });

  it("ignore les rappels status=done", async () => {
    const due = new Date(Date.now() + 1 * 60_000).toISOString();
    const reminders = [makeReminder({ due_at: due, status: "done" })];

    renderHook(() => useReminderNotifications(reminders));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(notifSpy).not.toHaveBeenCalled();
  });

  it("n'agit pas si la permission n'est pas accordée", async () => {
    // @ts-expect-error override
    globalThis.Notification.permission = "default";
    const due = new Date(Date.now() + 1 * 60_000).toISOString();

    renderHook(() => useReminderNotifications([makeReminder({ due_at: due })]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(notifSpy).not.toHaveBeenCalled();
  });
});

describe("useReminderNotifications — déduplication localStorage", () => {
  it("ne notifie qu'une fois par occurrence sur des ticks successifs", async () => {
    const due = new Date(Date.now() + 2 * 60_000).toISOString();
    const reminders = [makeReminder({ due_at: due })];

    renderHook(() => useReminderNotifications(reminders));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000); // 4 ticks de 15s
    });

    expect(notifSpy).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toContain(`r-1::${due}`);
  });

  it("re-déclenche pour une nouvelle occurrence (recurring → nouveau due_at)", async () => {
    const due1 = new Date(Date.now() + 1 * 60_000).toISOString();
    const { rerender } = renderHook(
      ({ list }: { list: Reminder[] }) => useReminderNotifications(list),
      { initialProps: { list: [makeReminder({ due_at: due1 })] } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(notifSpy).toHaveBeenCalledTimes(1);

    // Lendemain : nouveau due_at pour le même id (récurrence quotidienne)
    const due2 = new Date(Date.now() + 2 * 60_000).toISOString();
    rerender({ list: [makeReminder({ due_at: due2 })] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(notifSpy).toHaveBeenCalledTimes(2);
  });

  it("respecte la dédup pré-existante chargée depuis localStorage", async () => {
    const due = new Date(Date.now() + 1 * 60_000).toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([`r-1::${due}`]));

    renderHook(() =>
      useReminderNotifications([makeReminder({ due_at: due })]),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(notifSpy).not.toHaveBeenCalled();
  });
});

describe("useReminderNotifications — cycle de vie / changement de page", () => {
  it("arrête le polling au démontage (simule navigation hors page)", async () => {
    const due = new Date(Date.now() + 30 * 60_000).toISOString();
    const { unmount } = renderHook(() =>
      useReminderNotifications([makeReminder({ due_at: due })]),
    );

    unmount();

    // Avance jusqu'à la fenêtre — sans hook monté, rien ne doit fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25 * 60_000);
    });
    expect(notifSpy).not.toHaveBeenCalled();
  });

  it("continue à notifier après un changement de liste (mise à jour reminders)", async () => {
    const due = new Date(Date.now() + 2 * 60_000).toISOString();
    const { rerender } = renderHook(
      ({ list }: { list: Reminder[] }) => useReminderNotifications(list),
      { initialProps: { list: [] as Reminder[] } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(notifSpy).not.toHaveBeenCalled();

    rerender({ list: [makeReminder({ due_at: due })] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(notifSpy).toHaveBeenCalledTimes(1);
  });
});

describe("requestReminderNotificationPermission", () => {
  it("retourne la permission existante si déjà décidée", async () => {
    // @ts-expect-error override
    globalThis.Notification.permission = "granted";
    await expect(requestReminderNotificationPermission()).resolves.toBe("granted");
  });

  it("appelle requestPermission si état = default", async () => {
    // @ts-expect-error override
    globalThis.Notification.permission = "default";
    const res = await requestReminderNotificationPermission();
    expect(res).toBe("granted");
    // @ts-expect-error spy
    expect(globalThis.Notification.requestPermission).toHaveBeenCalled();
  });
});
