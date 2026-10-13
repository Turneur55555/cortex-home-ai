import { useState } from "react";
import { MoreVertical, BookmarkPlus, Copy, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MealMenuAction = "copy-yesterday" | "save-as-template" | "delete";

/**
 * Menu ⋮ d'un repas. Rendu via Radix Popover (Portal dans document.body) :
 * la carte repas et le panneau de détail ont `overflow-hidden`, ce qui clippait
 * l'ancien menu en `position: absolute`. Ne pas revenir à un menu non porté.
 */
export function MealActionMenu({
  mealLabel,
  onAction,
}: {
  mealLabel: string;
  onAction: (action: MealMenuAction) => void;
}) {
  const [open, setOpen] = useState(false);

  const handle = (action: MealMenuAction) => {
    setOpen(false);
    onAction(action);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Actions du repas ${mealLabel}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        role="menu"
        align="end"
        sideOffset={4}
        className="w-56 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-elevated"
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
      </PopoverContent>
    </Popover>
  );
}
