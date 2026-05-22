import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Columns3,
  LayoutList,
  ListFilter,
  Plus,
  Search,
  Sparkles,
  Calendar as CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ReminderCard } from "@/components/reminders/ReminderCard";
import { ReminderSheet } from "@/components/reminders/ReminderSheet";
import { SmartInput } from "@/components/reminders/SmartInput";
import { KanbanView } from "@/components/reminders/KanbanView";
import {
  useCreateReminder,
  useDeleteReminder,
  useReminders,
  useToggleComplete,
  useToggleFavorite,
  useUpdateReminder,
} from "@/hooks/useReminders";
import {
  ReminderPriority,
  ReminderStatus,
  type Reminder,
  type ReminderInput,
} from "@/services/reminders";

export const Route = createFileRoute("/_authenticated/rappels")({
  head: () => ({
    meta: [
      { title: "Rappels — ICORTEX" },
      { name: "description", content: "Gérez vos rappels et échéances." },
    ],
  }),
  component: RappelsPage,
});

type ViewMode = "list" | "kanban" | "calendar";
type StatusFilter = "all" | ReminderStatus | "favorites" | "overdue";

function RappelsPage() {
  const { data: reminders = [], isLoading } = useReminders();
  const createMut = useCreateReminder();
  const updateMut = useUpdateReminder();
  const deleteMut = useDeleteReminder();
  const toggleMut = useToggleComplete();
  const favMut = useToggleFavorite();

  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | ReminderPriority>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [calCursor, setCalCursor] = useState(new Date());
  const [calSelected, setCalSelected] = useState<Date | null>(new Date());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Browser notifications: request permission once, then check upcoming due reminders.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const sent = new Set<string>(
      JSON.parse(sessionStorage.getItem("icortex.reminders_notified") ?? "[]"),
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
          sessionStorage.setItem("icortex.reminders_notified", JSON.stringify([...sent]));
        }
      });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [reminders]);

  const stats = useMemo(() => {
    const today = new Date();
    const todayKey = today.toDateString();
    return {
      total: reminders.length,
      todo: reminders.filter((r) => r.status !== "done").length,
      overdue: reminders.filter(
        (r) => r.status !== "done" && r.due_at && new Date(r.due_at) < today,
      ).length,
      today: reminders.filter(
        (r) => r.due_at && new Date(r.due_at).toDateString() === todayKey,
      ).length,
    };
  }, [reminders]);

  const filtered = useMemo(() => {
    const now = new Date();
    return reminders.filter((r) => {
      if (statusFilter === "favorites" && !r.favorite) return false;
      if (statusFilter === "overdue") {
        if (r.status === "done" || !r.due_at || new Date(r.due_at) >= now) return false;
      } else if (statusFilter !== "all" && statusFilter !== "favorites") {
        if (r.status !== statusFilter) return false;
      }
      if (priorityFilter !== "all" && r.priority !== priorityFilter) return false;
      if (debounced) {
        const hay = `${r.title} ${r.description ?? ""} ${r.category ?? ""}`.toLowerCase();
        if (!hay.includes(debounced)) return false;
      }
      return true;
    });
  }, [reminders, statusFilter, priorityFilter, debounced]);

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const handleSubmit = async (input: ReminderInput) => {
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, patch: input });
        toast.success("Rappel mis à jour");
      } else {
        await createMut.mutateAsync(input);
        toast.success("Rappel créé");
      }
      setSheetOpen(false);
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    try {
      await deleteMut.mutateAsync(editing.id);
      toast.success("Rappel supprimé");
      setSheetOpen(false);
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <AppShell>
      <div className="pb-32">
        {/* Hero header */}
        <div className="relative mb-4 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-elevated">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "radial-gradient(circle at 90% 10%, rgba(108,99,255,0.35), transparent 55%)",
            }}
          />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                <Sparkles className="h-3 w-3 text-primary" /> Rappels
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Vos rappels</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Organisez vos échéances en toute fluidité.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-glow active:scale-95"
            >
              <Plus className="h-4 w-4" /> Nouveau
            </button>
          </div>

          <div className="relative mt-4 grid grid-cols-4 gap-2">
            <Stat label="Total" value={stats.total} />
            <Stat label="À faire" value={stats.todo} />
            <Stat label="Aujourd'hui" value={stats.today} tone="indigo" />
            <Stat label="En retard" value={stats.overdue} tone="danger" />
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="h-10 w-full rounded-xl border border-border bg-card/60 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center rounded-xl border border-border bg-card/60 p-1">
            <ViewBtn active={view === "list"} onClick={() => setView("list")} icon={LayoutList} />
            <ViewBtn
              active={view === "calendar"}
              onClick={() => setView("calendar")}
              icon={CalendarIcon}
            />
          </div>
        </div>

        {/* Filter pills */}
        <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1">
          <FilterPill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            Tous
          </FilterPill>
          <FilterPill
            active={statusFilter === "overdue"}
            onClick={() => setStatusFilter("overdue")}
            tone="danger"
          >
            En retard
          </FilterPill>
          <FilterPill active={statusFilter === "todo"} onClick={() => setStatusFilter("todo")}>
            À faire
          </FilterPill>
          <FilterPill
            active={statusFilter === "in_progress"}
            onClick={() => setStatusFilter("in_progress")}
          >
            En cours
          </FilterPill>
          <FilterPill active={statusFilter === "done"} onClick={() => setStatusFilter("done")}>
            Terminé
          </FilterPill>
          <FilterPill
            active={statusFilter === "favorites"}
            onClick={() => setStatusFilter("favorites")}
            tone="amber"
          >
            Favoris
          </FilterPill>
          <span className="mx-1 text-muted-foreground/40">
            <ListFilter className="h-3.5 w-3.5" />
          </span>
          {(["all", ...ReminderPriority] as const).map((p) => (
            <FilterPill
              key={p}
              active={priorityFilter === p}
              onClick={() => setPriorityFilter(p)}
            >
              {p === "all"
                ? "Toutes priorités"
                : p === "low"
                ? "Faible"
                : p === "medium"
                ? "Moyenne"
                : p === "high"
                ? "Haute"
                : "Urgente"}
            </FilterPill>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-card/50" />
            ))}
          </div>
        ) : view === "list" ? (
          filtered.length === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {filtered.map((r) => (
                  <ReminderCard
                    key={r.id}
                    reminder={r}
                    onToggle={() => toggleMut.mutate(r)}
                    onFavorite={() => favMut.mutate(r)}
                    onClick={() => {
                      setEditing(r);
                      setSheetOpen(true);
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )
        ) : (
          <CalendarView
            cursor={calCursor}
            setCursor={setCalCursor}
            selected={calSelected}
            setSelected={setCalSelected}
            reminders={filtered}
            onPick={(r) => {
              setEditing(r);
              setSheetOpen(true);
            }}
            onCreate={openCreate}
          />
        )}
      </div>

      <AnimatePresence>
        {sheetOpen && (
          <ReminderSheet
            reminder={editing}
            onClose={() => {
              setSheetOpen(false);
              setEditing(null);
            }}
            onSubmit={handleSubmit}
            onDelete={editing ? handleDelete : undefined}
            submitting={createMut.isPending || updateMut.isPending}
          />
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "indigo" | "danger";
}) {
  const valClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "indigo"
      ? "text-indigo-300"
      : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-2.5 backdrop-blur">
      <div className={`text-xl font-bold ${valClass}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Bell;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        active ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function FilterPill({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "danger" | "amber";
}) {
  const activeClass =
    tone === "danger"
      ? "border-destructive/50 bg-destructive/15 text-destructive"
      : tone === "amber"
      ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
      : "border-primary/50 bg-primary/15 text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${
        active
          ? activeClass
          : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/30 p-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Bell className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-bold">Aucun rappel</h3>
      <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">
        Créez votre premier rappel pour ne rien oublier.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-primary px-4 text-xs font-semibold text-primary-foreground shadow-glow"
      >
        <Plus className="h-4 w-4" /> Créer un rappel
      </button>
    </div>
  );
}

function CalendarView({
  cursor,
  setCursor,
  selected,
  setSelected,
  reminders,
  onPick,
  onCreate,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  selected: Date | null;
  setSelected: (d: Date) => void;
  reminders: Reminder[];
  onPick: (r: Reminder) => void;
  onCreate: () => void;
}) {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + 86400000)) days.push(d);

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

  const dayReminders = selected
    ? byDay.get(format(selected, "yyyy-MM-dd")) ?? []
    : [];

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
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
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
