import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  Columns3,
  LayoutList,
  ListFilter,
  Plus,
  Search,
  Sparkles,
  Calendar as CalendarIcon,
  Bell,
} from "lucide-react";
import { toast } from "sonner";

import { ReminderCard } from "@/components/reminders/ReminderCard";
import { SmartInput } from "@/components/reminders/SmartInput";
import {
  useCreateReminder,
  useDeleteReminder,
  useReminders,
  useToggleComplete,
  useToggleFavorite,
  useUpdateReminder,
} from "@/hooks/useReminders";
import { useReminderNotifications } from "@/hooks/useReminderNotifications";
import { useReminderShortcuts } from "@/hooks/useReminderShortcuts";
import { useSeedSupplements } from "@/hooks/useSeedSupplements";
import {
  REMINDER_PRIORITIES,
  type Reminder,
  type ReminderInput,
  type ReminderPriority,
  type ReminderStatus,
} from "@/types/reminder";
import { EmptyState, FilterPill, IconBtn, Stat } from "@/ui/primitives";

// Lazy-load heavy views to shrink the initial bundle on the Rappels route.
const KanbanView = lazy(() =>
  import("@/components/reminders/KanbanView").then((m) => ({ default: m.KanbanView })),
);
const CalendarView = lazy(() =>
  import("@/components/reminders/CalendarView").then((m) => ({ default: m.CalendarView })),
);
const ReminderSheet = lazy(() =>
  import("@/components/reminders/ReminderSheet").then((m) => ({ default: m.ReminderSheet })),
);

const ViewFallback = () => (
  <div className="space-y-2">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="h-20 animate-pulse rounded-2xl bg-card/50" />
    ))}
  </div>
);


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

const PRIORITY_LABEL: Record<ReminderPriority | "all", string> = {
  all: "Toutes priorités",
  low: "Faible",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
};

function RappelsPage() {
  const { data: reminders = [], isLoading } = useReminders();
  useSeedSupplements(isLoading);
  useReminderNotifications(reminders);

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

  const openCreate = useCallback(() => {
    setEditing(null);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditing(null);
  }, []);

  const openEdit = useCallback((r: Reminder) => {
    setEditing(r);
    setSheetOpen(true);
  }, []);

  // Stable per-item handlers — prevents ReminderCard re-renders on parent state changes.
  const handleToggle = useCallback((r: Reminder) => toggleMut.mutate(r), [toggleMut]);
  const handleFavorite = useCallback((r: Reminder) => favMut.mutate(r), [favMut]);
  const handleMove = useCallback(
    (id: string, status: ReminderStatus) => updateMut.mutate({ id, patch: { status } }),
    [updateMut],
  );


  useReminderShortcuts({
    onCreate: openCreate,
    onFocusSearch: () =>
      document.querySelector<HTMLInputElement>('input[aria-label="Recherche rappels"]')?.focus(),
    onSetView: setView,
    onEscape: () => sheetOpen && closeSheet(),
  });

  const handleSubmit = async (input: ReminderInput) => {
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, patch: input });
        toast.success("Rappel mis à jour");
      } else {
        await createMut.mutateAsync(input);
        toast.success("Rappel créé");
      }
      closeSheet();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    try {
      await deleteMut.mutateAsync(editing.id);
      toast.success("Rappel supprimé");
      closeSheet();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleSmartCreate = async (input: ReminderInput) => {
    try {
      await createMut.mutateAsync(input);
      toast.success("Rappel créé via IA ✨");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <>
      <div className="px-3 pt-14 pb-32">
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

        {/* Smart natural-language input */}
        <SmartInput onCreate={handleSmartCreate} onOpenAdvanced={openCreate} />

        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher… ( / )"
              aria-label="Recherche rappels"
              className="h-10 w-full rounded-xl border border-border bg-card/60 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center rounded-xl border border-border bg-card/60 p-1">
            <IconBtn active={view === "list"} onClick={() => setView("list")} icon={LayoutList} label="Liste (1)" />
            <IconBtn active={view === "kanban"} onClick={() => setView("kanban")} icon={Columns3} label="Kanban (2)" />
            <IconBtn active={view === "calendar"} onClick={() => setView("calendar")} icon={CalendarIcon} label="Calendrier (3)" />
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
          {(["all", ...REMINDER_PRIORITIES] as const).map((p) => (
            <FilterPill
              key={p}
              active={priorityFilter === p}
              onClick={() => setPriorityFilter(p)}
            >
              {PRIORITY_LABEL[p]}
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
            <EmptyState
              icon={Bell}
              title="Aucun rappel"
              description="Créez votre premier rappel pour ne rien oublier."
              actionLabel="Créer un rappel"
              onAction={openCreate}
            />
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {filtered.map((r) => (
                  <ReminderCard
                    key={r.id}
                    reminder={r}
                    onToggle={handleToggle}
                    onFavorite={handleFavorite}
                    onClick={openEdit}
                  />
                ))}
              </AnimatePresence>
            </div>
          )
        ) : view === "kanban" ? (
          <Suspense fallback={<ViewFallback />}>
            <KanbanView
              reminders={filtered}
              onMove={handleMove}
              onPick={openEdit}
              onToggle={handleToggle}
              onFavorite={handleFavorite}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<ViewFallback />}>
            <CalendarView
              cursor={calCursor}
              setCursor={setCalCursor}
              selected={calSelected}
              setSelected={setCalSelected}
              reminders={filtered}
              onPick={openEdit}
              onCreate={openCreate}
            />
          </Suspense>
        )}

      </div>

      <AnimatePresence>
        {sheetOpen && (
          <ReminderSheet
            reminder={editing}
            onClose={closeSheet}
            onSubmit={handleSubmit}
            onDelete={editing ? handleDelete : undefined}
            submitting={createMut.isPending || updateMut.isPending}
          />
        )}
      </AnimatePresence>
    </>
  );
}
