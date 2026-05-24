import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Reminder } from "@/services/reminders";

export interface CalendarViewProps {
  cursor: Date;
  setCursor: (d: Date) => void;
  selected: Date | null;
  setSelected: (d: Date) => void;
  reminders: Reminder[];
  onPick: (r: Reminder) => void;
  onCreate: () => void;
}

const WEEK_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

export function CalendarView({
  cursor,
  setCursor,
  selected,
  setSelected,
  reminders,
  onPick,
  onCreate,
}: CalendarViewProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const acc: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + 86400000)) acc.push(d);
    return acc;
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, Reminder[]>();
    reminders.forEach((r) => {
      if (!r.due_at) return;
      const k = format(parseISO(r.due_at), "yyyy-MM-dd");
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    });
    return m;
  }, [reminders]);

  const dayReminders = selected ? byDay.get(format(selected, "yyyy-MM-dd")) ?? [] : [];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card/60 p-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCursor(subMonths(cursor, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-bold capitalize">
            {format(cursor, "MMMM yyyy", { locale: fr })}
          </div>
          <button
            type="button"
            onClick={() => setCursor(addMonths(cursor, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {WEEK_LABELS.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const count = byDay.get(key)?.length ?? 0;
            const isSel = selected && isSameDay(d, selected);
            const inMonth = isSameMonth(d, cursor);
            const today = isSameDay(d, new Date());
            return (
              <button
                type="button"
                key={key}
                onClick={() => setSelected(d)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-all ${
                  isSel
                    ? "bg-gradient-primary font-bold text-primary-foreground shadow-glow"
                    : today
                    ? "border border-primary/40 text-foreground"
                    : inMonth
                    ? "text-foreground hover:bg-surface"
                    : "text-muted-foreground/40 hover:bg-surface"
                }`}
              >
                {format(d, "d")}
                {count > 0 && (
                  <span
                    className={`absolute bottom-1 h-1 w-1 rounded-full ${
                      isSel ? "bg-primary-foreground" : "bg-primary"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {selected ? format(selected, "EEEE d MMMM", { locale: fr }) : "Sélectionnez un jour"}
          </h3>
          <span className="text-[11px] text-muted-foreground">{dayReminders.length} rappel(s)</span>
        </div>
        {dayReminders.length === 0 ? (
          <button
            type="button"
            onClick={onCreate}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card/30 py-5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter pour ce jour
          </button>
        ) : (
          <div className="space-y-2">
            {dayReminders.map((r) => (
              <motion.button
                key={r.id}
                layout
                onClick={() => onPick(r)}
                className="w-full rounded-xl border border-border bg-card/70 p-2.5 text-left backdrop-blur hover:border-primary/40"
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-semibold">{r.title}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {r.due_at ? format(parseISO(r.due_at), "HH:mm") : "—"}
                  </span>
                </div>
                {r.description && (
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                    {r.description}
                  </p>
                )}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
