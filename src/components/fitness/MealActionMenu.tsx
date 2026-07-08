import { useEffect, useRef, useState } from "react";
import { MoreVertical, BookmarkPlus, Copy, Trash2 } from "lucide-react";

export type MealMenuAction = "copy-yesterday" | "save-as-template" | "delete";

export function MealActionMenu({
  mealLabel,
  onAction,
}: {
  mealLabel: string;
  onAction: (action: MealMenuAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handle = (action: MealMenuAction) => {
    setOpen(false);
    onAction(action);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Actions du repas ${mealLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-elevated"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handle("copy-yesterday")}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Copy className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">Copier le {mealLabel.toLowerCase()} d'hier</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handle("save-as-template")}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <BookmarkPlus className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">Enregistrer comme modèle</span>
          </button>
          <div className="h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => handle("delete")}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            <span className="flex-1">Supprimer le repas</span>
          </button>
        </div>
      )}
    </div>
  );
}
