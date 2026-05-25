import { memo } from "react";
import { motion } from "framer-motion";
import { Bell, Calendar, Check, Repeat, Star } from "lucide-react";
import { format, isPast, isToday, isTomorrow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { Reminder, ReminderPriority } from "@/types/reminder";


const PRIORITY_CLASS: Record<ReminderPriority, string> = {
  low: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  medium: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  high: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  urgent: "border-destructive/50 bg-destructive/15 text-destructive",
};
const PRIORITY_LABEL: Record<ReminderPriority, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
};

function formatDue(iso: string | null): { label: string; tone: "past" | "today" | "soon" | "later" | "none" } {
  if (!iso) return { label: "Pas d'échéance", tone: "none" };
  const d = parseISO(iso);
  if (isToday(d)) return { label: `Aujourd'hui · ${format(d, "HH:mm")}`, tone: "today" };
  if (isTomorrow(d)) return { label: `Demain · ${format(d, "HH:mm")}`, tone: "soon" };
  if (isPast(d)) return { label: `En retard · ${format(d, "d MMM", { locale: fr })}`, tone: "past" };
  return { label: format(d, "d MMM · HH:mm", { locale: fr }), tone: "later" };
}

export function ReminderCard({
  reminder,
  onToggle,
  onFavorite,
  onClick,
}: {
  reminder: Reminder;
  onToggle: () => void;
  onFavorite: () => void;
  onClick: () => void;
}) {
  const done = reminder.status === "done";
  const due = formatDue(reminder.due_at);
  const toneClass =
    due.tone === "past"
      ? "text-destructive"
      : due.tone === "today"
      ? "text-amber-400"
      : due.tone === "soon"
      ? "text-indigo-300"
      : "text-muted-foreground";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-card/70 p-3.5 shadow-sm backdrop-blur-md transition-all hover:border-primary/40 hover:shadow-elevated"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-border hover:border-primary"
          }`}
          aria-label={done ? "Marquer à faire" : "Marquer terminé"}
        >
          {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={`truncate text-sm font-semibold ${
                done ? "text-muted-foreground line-through" : "text-foreground"
              }`}
            >
              {reminder.title}
            </h3>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFavorite();
              }}
              className="shrink-0 text-muted-foreground transition-colors hover:text-amber-400"
              aria-label="Favori"
            >
              <Star
                className={`h-3.5 w-3.5 ${reminder.favorite ? "fill-amber-400 text-amber-400" : ""}`}
              />
            </button>
          </div>

          {reminder.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {reminder.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_CLASS[reminder.priority]}`}
            >
              {PRIORITY_LABEL[reminder.priority]}
            </span>
            {reminder.category && (
              <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {reminder.category}
              </span>
            )}
            {reminder.recurrence !== "none" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Repeat className="h-2.5 w-2.5" />
              </span>
            )}
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${toneClass}`}>
              {reminder.due_at ? <Calendar className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
              {due.label}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
