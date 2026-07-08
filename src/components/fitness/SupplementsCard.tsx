import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Pill, Plus } from "lucide-react";
import { useSupplements, useToggleSupplementLog } from "@/hooks/use-supplements";

export function SupplementsCard({ date }: { date: string }) {
  const { data, isLoading } = useSupplements(date);
  const toggle = useToggleSupplementLog(date);

  const items = data ?? [];
  const takenCount = items.filter((s) => s.taken).length;
  const preview = items.slice(0, 5);

  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Pill className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Compléments</p>
            <p className="text-[11px] text-muted-foreground">
              {items.length === 0
                ? "Aucun complément"
                : `${takenCount}/${items.length} pris aujourd'hui`}
            </p>
          </div>
        </div>
        <Link
          to="/supplements"
          className="flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Ouvrir la page compléments"
        >
          Gérer
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {isLoading ? (
        <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
      ) : items.length === 0 ? (
        <Link
          to="/supplements"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un complément
        </Link>
      ) : (
        <ul className="space-y-1.5">
          {preview.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() =>
                  toggle.mutate({ supplement_id: s.id, taken: !s.taken })
                }
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                  s.taken
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-transparent"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    s.taken
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {s.taken && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span
                  className={`flex-1 truncate text-sm ${
                    s.taken
                      ? "font-medium text-foreground"
                      : "text-foreground"
                  }`}
                >
                  {s.name}
                </span>
                {(s.dosage || s.unit) && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {[s.dosage, s.unit].filter(Boolean).join(" ")}
                  </span>
                )}
              </button>
            </li>
          ))}
          {items.length > preview.length && (
            <Link
              to="/supplements"
              className="mt-1 block text-center text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              + {items.length - preview.length} autre
              {items.length - preview.length > 1 ? "s" : ""}
            </Link>
          )}
        </ul>
      )}
    </div>
  );
}
