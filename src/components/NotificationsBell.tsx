import { useMemo, useState } from "react";
import { Bell, X, AlertTriangle, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useReminders } from "@/hooks/useReminders";

/**
 * Cloche de notifications — surface les rappels en retard ou prévus
 * aujourd'hui. Les anciennes alertes de stock ont été retirées avec le
 * module Maison.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data: reminders = [] } = useReminders();

  const { overdue, today } = useMemo(() => {
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const open = reminders.filter((r) => r.status !== "done" && r.due_at);
    const overdueList = open
      .filter((r) => new Date(r.due_at as string) < now)
      .sort(
        (a, b) =>
          new Date(a.due_at as string).getTime() - new Date(b.due_at as string).getTime(),
      );
    const todayList = open
      .filter((r) => {
        const d = new Date(r.due_at as string);
        return d >= now && d <= endOfDay;
      })
      .sort(
        (a, b) =>
          new Date(a.due_at as string).getTime() - new Date(b.due_at as string).getTime(),
      );
    return { overdue: overdueList, today: todayList };
  }, [reminders]);

  const count = overdue.length + today.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/80 text-foreground shadow-sm backdrop-blur hover:bg-surface"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-16 w-full max-w-[400px] rounded-2xl border border-border bg-card p-4 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">Rappels ({count})</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {count === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Aucun rappel en attente. ✨
              </div>
            ) : (
              <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
                {overdue.map((r) => (
                  <ReminderRow key={r.id} title={r.title} dueAt={r.due_at as string} overdue />
                ))}
                {today.map((r) => (
                  <ReminderRow key={r.id} title={r.title} dueAt={r.due_at as string} />
                ))}
              </ul>
            )}

            <Link
              to="/rappels"
              onClick={() => setOpen(false)}
              className="mt-3 block w-full rounded-xl bg-gradient-primary py-2.5 text-center text-xs font-semibold text-primary-foreground"
            >
              Ouvrir les rappels
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

function ReminderRow({
  title,
  dueAt,
  overdue,
}: {
  title: string;
  dueAt: string;
  overdue?: boolean;
}) {
  const d = new Date(dueAt);
  return (
    <li
      className={`rounded-xl border p-3 ${
        overdue
          ? "border-destructive/40 bg-destructive/10"
          : "border-amber-500/30 bg-amber-500/10"
      }`}
    >
      <div className="flex items-start gap-2">
        {overdue ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p
            className={`mt-0.5 text-[11px] ${
              overdue ? "text-destructive" : "text-amber-700 dark:text-amber-400"
            }`}
          >
            {overdue ? "En retard · " : "Aujourd'hui · "}
            {format(d, "d MMM HH:mm", { locale: fr })}
          </p>
        </div>
      </div>
    </li>
  );
}
