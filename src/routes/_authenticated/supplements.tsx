import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  Loader2,
  Pencil,
  Pill,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import {
  useAllSupplements,
  useCreateSupplement,
  useDeleteSupplement,
  useSupplementHistory,
  useSupplements,
  useToggleSupplementLog,
  useUpdateSupplement,
  type Supplement,
} from "@/hooks/use-supplements";
import { Sheet, Field, SubmitButton } from "@/components/shared/FormComponents";

export const Route = createFileRoute("/_authenticated/supplements")({
  head: () => ({
    meta: [
      { title: "Compléments — ICORTEX" },
      {
        name: "description",
        content:
          "Gère tes compléments alimentaires, coche les prises du jour et consulte ton historique.",
      },
    ],
  }),
  component: SupplementsPage,
});

function SupplementsPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: todayList, isLoading: loadingToday } = useSupplements(today);
  const { data: allList, isLoading: loadingAll } = useAllSupplements();
  const toggle = useToggleSupplementLog(today);
  const del = useDeleteSupplement();

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Supplement | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Supplement | null>(null);

  const takenCount = (todayList ?? []).filter((s) => s.taken).length;

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-4">
        <Link
          to="/nutrition"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Nutrition
        </Link>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Aujourd'hui
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Compléments</h1>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums">
              {takenCount}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {todayList?.length ?? 0}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground">pris</p>
          </div>
        </div>
      </header>

      {/* Prises du jour */}
      <section className="mb-6">
        <h2 className="mb-2.5 px-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Prises du jour
        </h2>
        {loadingToday ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (todayList ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <Pill className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Aucun complément</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ajoute ton premier complément pour commencer le suivi.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {(todayList ?? []).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() =>
                    toggle.mutate({ supplement_id: s.id, taken: !s.taken })
                  }
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                    s.taken
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                      s.taken
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    }`}
                  >
                    {s.taken && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    {(s.dosage || s.unit || s.notes) && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[s.dosage, s.unit].filter(Boolean).join(" ")}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Gérer les compléments */}
      <section className="mb-6">
        <div className="mb-2.5 flex items-center justify-between px-0.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Mes compléments
          </h2>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </button>
        </div>
        {loadingAll ? (
          <div className="flex h-16 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (allList ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Aucun complément enregistré.
          </p>
        ) : (
          <ul className="space-y-2">
            {(allList ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  {(s.dosage || s.unit) && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[s.dosage, s.unit].filter(Boolean).join(" ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(s)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Modifier"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDel(s)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Historique */}
      <section>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="w-full rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30"
        >
          <p className="text-sm font-semibold">Historique</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Consulter les prises des 30 derniers jours.
          </p>
        </button>
      </section>

      {addOpen && (
        <SupplementFormSheet
          onClose={() => setAddOpen(false)}
          initial={null}
        />
      )}
      {editing && (
        <SupplementFormSheet
          onClose={() => setEditing(null)}
          initial={editing}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          title={`Supprimer « ${confirmDel.name} » ?`}
          message="L'historique des prises pour ce complément sera aussi supprimé."
          confirmLabel="Supprimer"
          onConfirm={() => {
            del.mutate(confirmDel.id, {
              onSuccess: () => setConfirmDel(null),
            });
          }}
          onCancel={() => setConfirmDel(null)}
          pending={del.isPending}
        />
      )}
      {historyOpen && (
        <SupplementHistorySheet onClose={() => setHistoryOpen(false)} />
      )}
    </main>
  );
}

// ────────────────────────────────────────────────────────────────

function SupplementFormSheet({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial: Supplement | null;
}) {
  const create = useCreateSupplement();
  const update = useUpdateSupplement();
  const [name, setName] = useState(initial?.name ?? "");
  const [dosage, setDosage] = useState(initial?.dosage ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      dosage: dosage.trim() || null,
      unit: unit.trim() || null,
      notes: notes.trim() || null,
    };
    if (initial) {
      update.mutate(
        { id: initial.id, patch: payload },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Sheet
      title={initial ? "Modifier le complément" : "Nouveau complément"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Nom"
          value={name}
          onChange={setName}
          placeholder="Ex : Créatine"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Dosage"
            value={dosage}
            onChange={setDosage}
            placeholder="5"
          />
          <Field
            label="Unité"
            value={unit}
            onChange={setUnit}
            placeholder="g / mg / gélule"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Après le petit-déj, à jeun…"
            className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <SubmitButton pending={create.isPending || update.isPending}>
          {initial ? "Enregistrer" : "Ajouter"}
        </SubmitButton>
      </form>
    </Sheet>
  );
}

function SupplementHistorySheet({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useSupplementHistory(30);

  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ name: string; dosage: string | null; unit: string | null }>>();
    (data ?? []).forEach((row) => {
      const r = row as unknown as {
        date: string;
        taken: boolean;
        supplements: { name: string; dosage: string | null; unit: string | null } | null;
      };
      if (!r.taken || !r.supplements) return;
      const arr = map.get(r.date) ?? [];
      arr.push(r.supplements);
      map.set(r.date, arr);
    });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  return (
    <Sheet title="Historique — 30 jours" onClose={onClose}>
      {isLoading ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : grouped.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aucune prise enregistrée sur cette période.
        </p>
      ) : (
        <ul className="space-y-3">
          {grouped.map(([date, sups]) => (
            <li
              key={date}
              className="rounded-xl border border-border bg-card p-3"
            >
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {date}
              </p>
              <ul className="space-y-1">
                {sups.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">{s.name}</span>
                    {(s.dosage || s.unit) && (
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {[s.dosage, s.unit].filter(Boolean).join(" ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  pending,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
    >
      <div
        className="m-4 w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className="text-sm font-semibold">{title}</p>
          <button
            onClick={onCancel}
            className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
