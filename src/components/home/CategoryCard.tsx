import { memo, useRef } from "react";
import { AlertTriangle, Check, TrendingDown, X } from "lucide-react";
import { getIcon } from "@/lib/maison/icons";
import { CategoryMenu } from "./CategoryMenu";
import { cn } from "@/lib/utils";
import type { HomeCategory, CategoryStats } from "@/types/home";

interface CategoryCardProps {
  category: HomeCategory;
  stats: CategoryStats;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onManageCompartments: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
  // Multi-select edit mode
  editMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onRequestEditMode?: () => void;
}

function triggerHaptic(ms = 12) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* noop */
    }
  }
}

export const CategoryCard = memo(function CategoryCard({
  category,
  stats,
  onPress,
  onEdit,
  onDelete,
  onManageCompartments,
  dragHandleProps,
  isDragging,
  editMode = false,
  selected = false,
  onToggleSelect,
  onRequestEditMode,
}: CategoryCardProps) {
  const Icon = getIcon(category.icon);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = () => {
    if (editMode || !onRequestEditMode) return;
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      triggerHaptic(20);
      onRequestEditMode?.();
    }, 500);
  };

  const handleClick = () => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (editMode) {
      triggerHaptic(8);
      onToggleSelect?.();
      return;
    }
    onPress();
  };

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-3xl border p-4 cursor-pointer transition-all duration-200 select-none",
        "bg-surface",
        selected
          ? "border-primary/70 shadow-[0_0_0_2px_oklch(0.62_0.22_285_/_0.6),0_8px_30px_-12px_oklch(0.62_0.22_285_/_0.5)]"
          : "border-white/5 hover:border-white/10",
        editMode && !selected && "border-white/10",
        editMode && "animate-wiggle",
        isDragging && "shadow-2xl scale-[1.02] opacity-90 z-50 animate-none",
        !editMode && "active:scale-[0.98]",
      )}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      onContextMenu={(e) => e.preventDefault()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      aria-label={editMode ? `Sélectionner ${category.name}` : `Ouvrir ${category.name}`}
      aria-pressed={editMode ? selected : undefined}
    >
      {/* Red delete cross — edit mode */}
      {editMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic(12);
            onDelete();
          }}
          aria-label={`Supprimer ${category.name}`}
          className="absolute -left-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg ring-2 ring-background animate-none"
        >
          <X className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      )}

      {/* Selected check — top right corner */}
      {editMode && selected && (
        <div className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background animate-none">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </div>
      )}

      {/* Icon + Menu */}
      <div className="flex items-start justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md"
          style={{ background: category.color }}
        >
          <Icon className="h-5 w-5" />
        </div>

        {!editMode && (
          <div className="flex items-center gap-1">
            {dragHandleProps && (
              <div
                {...dragHandleProps}
                onClick={(e) => e.stopPropagation()}
                className="flex h-7 w-7 cursor-grab items-center justify-center rounded-lg text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
                aria-label="Réorganiser"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                </svg>
              </div>
            )}
            <CategoryMenu
              onEdit={onEdit}
              onDelete={onDelete}
              onChangeColor={onEdit}
              onChangeIcon={onEdit}
              onManageCompartments={onManageCompartments}
            />
          </div>
        )}
      </div>

      {/* Name + count */}
      <div>
        <p className="font-bold leading-tight">{category.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {stats.count} objet{stats.count !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Badges */}
      {(stats.expiring > 0 || stats.lowStock > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {stats.expiring > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
              <AlertTriangle className="h-2.5 w-2.5" />
              {stats.expiring} expire bientôt
            </span>
          )}
          {stats.lowStock > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
              <TrendingDown className="h-2.5 w-2.5" />
              {stats.lowStock} stock bas
            </span>
          )}
        </div>
      )}

      {/* Color accent bar */}
      <div
        className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full opacity-40"
        style={{ background: category.color }}
      />
    </div>
  );
});
