import { AlertTriangle, CheckSquare, Leaf, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

// ─── ItemRow ──────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: Tables<"items">;
  onDelete: () => void;
  onQty: (q: number) => void;
  onEdit?: () => void;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}

export function ItemRow({
  item,
  onDelete,
  onQty,
  onEdit,
  selecting = false,
  selected = false,
  onToggle,
}: ItemRowProps) {
  const exp = item.expiration_date ? parseISO(item.expiration_date as unknown as string) : null;
  const daysLeft = exp ? differenceInDays(exp, new Date()) : null;
  const expState =
    daysLeft == null ? null : daysLeft < 0 ? "expired" : daysLeft <= 7 ? "soon" : "ok";
  const isLowStock =
    item.low_stock_threshold != null && item.quantity <= item.low_stock_threshold;
  const hasNutrition = item.calories_per_100g != null;

  return (
    <li
      data-testid="stocks-item"
      data-item-name={item.name}
      onClick={selecting ? onToggle : undefined}
      className={
        "flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-card transition-colors " +
        (selecting
          ? selected
            ? "cursor-pointer border-primary bg-primary/5"
            : "cursor-pointer border-border"
          : "border-border")
      }
    >
      {selecting && (
        <span
          className={
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border " +
            (selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface")
          }
          aria-hidden
        >
          {selected && <CheckSquare className="h-3 w-3" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold leading-tight">{item.name}</p>
          {hasNutrition && (
            <span title="Valeurs nutritionnelles disponibles">
              <Leaf className="h-3 w-3 shrink-0 text-accent opacity-70" />
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {item.unit && <span>{item.unit}</span>}
          {isLowStock && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" />
              Stock bas
            </span>
          )}
          {hasNutrition && (
            <span className="text-[10px] text-muted-foreground/70">
              {Math.round(item.calories_per_100g!)} kcal/100g
            </span>
          )}
          {exp && (
            <span
              className={
                expState === "expired"
                  ? "inline-flex items-center gap-1 text-destructive"
                  : expState === "soon"
                    ? "inline-flex items-center gap-1 text-warning"
                    : "inline-flex items-center gap-1"
              }
            >
              {(expState === "expired" || expState === "soon") && (
                <AlertTriangle className="h-3 w-3" />
              )}
              {expState === "expired"
                ? `Expiré ${format(exp, "d MMM", { locale: fr })}`
                : format(exp, "d MMM yyyy", { locale: fr })}
            </span>
          )}
        </div>
      </div>

      {selecting ? (
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
          ×{item.quantity}
        </span>
      ) : (
        <>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={() => onQty(Math.max(0, item.quantity - 1))}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onQty(item.quantity + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
              aria-label="Modifier"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            data-testid="stocks-item-delete"
            onClick={onDelete}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </li>
  );
}
