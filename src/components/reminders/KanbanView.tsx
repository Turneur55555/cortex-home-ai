import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  closestCenter,
} from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import { ReminderCard } from "./ReminderCard";
import type { Reminder, ReminderStatus } from "@/services/reminders";

const COLUMNS: { id: ReminderStatus; label: string; tone: string }[] = [
  { id: "todo", label: "À faire", tone: "text-muted-foreground" },
  { id: "in_progress", label: "En cours", tone: "text-indigo-300" },
  { id: "done", label: "Terminé", tone: "text-emerald-400" },
];

export function KanbanView({
  reminders,
  onMove,
  onPick,
  onToggle,
  onFavorite,
}: {
  reminders: Reminder[];
  onMove: (id: string, status: ReminderStatus) => void;
  onPick: (r: Reminder) => void;
  onToggle: (r: Reminder) => void;
  onFavorite: (r: Reminder) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const byCol = useMemo(() => {
    const map: Record<ReminderStatus, Reminder[]> = { todo: [], in_progress: [], done: [] };
    reminders.forEach((r) => map[r.status].push(r));
    return map;
  }, [reminders]);

  const active = activeId ? reminders.find((r) => r.id === activeId) ?? null : null;

  const handleEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id;
    if (!overId) return;
    const id = String(e.active.id);
    const status = String(overId) as ReminderStatus;
    const r = reminders.find((x) => x.id === id);
    if (r && r.status !== status) onMove(id, status);
  };

  const handleStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-2">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            label={col.label}
            tone={col.tone}
            count={byCol[col.id].length}
          >
            <AnimatePresence initial={false}>
              {byCol[col.id].map((r) => (
                <DraggableCard
                  key={r.id}
                  reminder={r}
                  onPick={() => onPick(r)}
                  onToggle={() => onToggle(r)}
                  onFavorite={() => onFavorite(r)}
                />
              ))}
            </AnimatePresence>
            {byCol[col.id].length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground/60">
                Glissez ici
              </div>
            )}
          </KanbanColumn>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 200 }}>
        {active ? (
          <div className="w-[280px] rotate-1 opacity-95">
            <ReminderCard reminder={active} onToggle={() => {}} onFavorite={() => {}} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  id,
  label,
  tone,
  count,
  children,
}: {
  id: ReminderStatus;
  label: string;
  tone: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-[280px] shrink-0 flex-col gap-2 rounded-2xl border bg-card/40 p-2 backdrop-blur transition-colors ${
        isOver ? "border-primary/60 bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between px-1.5 pt-1">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${tone}`}>{label}</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function DraggableCard({
  reminder,
  onPick,
  onToggle,
  onFavorite,
}: {
  reminder: Reminder;
  onPick: () => void;
  onToggle: () => void;
  onFavorite: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: reminder.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`touch-none ${isDragging ? "opacity-30" : ""}`}
    >
      <ReminderCard
        reminder={reminder}
        onToggle={onToggle}
        onFavorite={onFavorite}
        onClick={onPick}
      />
    </div>
  );
}
