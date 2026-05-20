import { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { KeyboardSensor } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CategoryCard } from "./CategoryCard";
import type { HomeCategory, CategoryStats } from "@/types/home";

interface SortableItemProps {
  category: HomeCategory;
  stats: CategoryStats;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onManageCompartments: () => void;
  editMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onRequestEditMode: () => void;
}

function SortableItem({ category, editMode, ...props }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id, disabled: editMode });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <CategoryCard
        category={category}
        isDragging={isDragging}
        dragHandleProps={editMode ? undefined : { ...attributes, ...listeners }}
        editMode={editMode}
        {...props}
      />
    </div>
  );
}

interface SortableCategoryListProps {
  categories: HomeCategory[];
  statsMap: Map<string, CategoryStats>;
  onPress: (category: HomeCategory) => void;
  onEdit: (category: HomeCategory) => void;
  onDelete: (category: HomeCategory) => void;
  onManageCompartments: (category: HomeCategory) => void;
  onReorder: (newOrder: HomeCategory[]) => void;
  editMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onRequestEditMode: () => void;
}

export function SortableCategoryList({
  categories,
  statsMap,
  onPress,
  onEdit,
  onDelete,
  onManageCompartments,
  onReorder,
  editMode,
  selectedIds,
  onToggleSelect,
  onRequestEditMode,
}: SortableCategoryListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = categories.findIndex((c) => c.id === active.id);
      const newIndex = categories.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      onReorder(arrayMove(categories, oldIndex, newIndex));
    },
    [categories, onReorder],
  );

  const emptyStats: CategoryStats = { count: 0, expiring: 0, lowStock: 0 };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="grid grid-cols-2 gap-3">
          {categories.map((cat) => (
            <SortableItem
              key={cat.id}
              category={cat}
              stats={statsMap.get(cat.slug) ?? emptyStats}
              onPress={() => onPress(cat)}
              onEdit={() => onEdit(cat)}
              onDelete={() => onDelete(cat)}
              onManageCompartments={() => onManageCompartments(cat)}
              editMode={editMode}
              selected={selectedIds.has(cat.id)}
              onToggleSelect={() => onToggleSelect(cat.id)}
              onRequestEditMode={onRequestEditMode}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
