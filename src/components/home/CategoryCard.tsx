import { memo } from "react";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { getIcon } from "@/lib/maison/icons";
import { CategoryMenu } from "./CategoryMenu";
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
}: CategoryCardProps) {
  const Icon = getIcon(category.icon);

  return (
    <div
      className={`relative flex flex-col gap-3 rounded-3xl border border-white/5 bg-surface p-4 cursor-pointer transition-all duration-200 select-none ${
        isDragging ? "shadow-2xl scale-[1.02] opacity-90 z-50" : "hover:border-white/10 active:scale-[0.98]"
      }`}
      onClick={onPress}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onPress()}
      aria-label={`Ouvrir ${category.name}`}
    >
      {/* Icon + Menu */}
      <div className="flex items-start justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md"
          style={{ background: category.color }}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex items-center gap-1">
          {/* Drag handle */}
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
