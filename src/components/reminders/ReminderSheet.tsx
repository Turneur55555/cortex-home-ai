import { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  PRIORITY_LABEL,
  RECURRENCE_LABEL,
  REMINDER_PRIORITIES,
  REMINDER_RECURRENCES,
  REMINDER_STATUSES,
  STATUS_LABEL,
  type Reminder,
  type ReminderInput,
  type ReminderPriority,
  type ReminderRecurrence,
  type ReminderStatus,
} from "@/types/reminder";

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReminderSheet({
  reminder,
  onClose,
  onSubmit,
  onDelete,
  submitting,
}: {
  reminder?: Reminder | null;
  onClose: () => void;
  onSubmit: (input: ReminderInput) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  submitting?: boolean;
}) {
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [description, setDescription] = useState(reminder?.description ?? "");
  const [category, setCategory] = useState(reminder?.category ?? "");
  const [dueLocal, setDueLocal] = useState(toLocalInputValue(reminder?.due_at ?? null));
  const [priority, setPriority] = useState<ReminderPriority>(reminder?.priority ?? "medium");
  const [status, setStatus] = useState<ReminderStatus>(reminder?.status ?? "todo");
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>(reminder?.recurrence ?? "none");
  const [notifyBefore, setNotifyBefore] = useState<number>(reminder?.notify_before_minutes ?? 30);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Le titre est requis");
      return;
    }
    const input: ReminderInput = {
      title: title.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      due_at: dueLocal ? new Date(dueLocal).toISOString() : null,
      priority,
      status,
      recurrence,
      notify_before_minutes: notifyBefore,
    };
    await onSubmit(input);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5 shadow-elevated animate-slide-in-right"
        style={{ animationDuration: "0.25s" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{reminder ? "Modifier le rappel" : "Nouveau rappel"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted-foreground hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5">
          <Field label="Titre" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
              placeholder="Acheter du pain"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Détails optionnels…"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Échéance">
              <input
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Catégorie">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={60}
                placeholder="Maison, Santé…"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priorité">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ReminderPriority)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                {REMINDER_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </Field>
            <Field label="Statut">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ReminderStatus)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                {REMINDER_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Récurrence">
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as ReminderRecurrence)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                {REMINDER_RECURRENCES.map((r) => (
                  <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>
                ))}
              </select>
            </Field>
            <Field label="Notifier avant (min)">
              <input
                type="number"
                min={0}
                max={10080}
                value={notifyBefore}
                onChange={(e) => setNotifyBefore(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          {reminder && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 text-sm font-semibold text-destructive hover:bg-destructive/20"
              aria-label="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow transition-opacity disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {reminder ? "Enregistrer" : "Créer le rappel"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
