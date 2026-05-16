import { useRef, useEffect, useState } from "react";
import { MoreVertical, Pencil, Trash2, Palette, ImageIcon, Layers } from "lucide-react";

interface CategoryMenuProps {
  onEdit: () => void;
  onDelete: () => void;
  onChangeColor: () => void;
  onChangeIcon: () => void;
  onManageCompartments: () => void;
}

export function CategoryMenu({
  onEdit,
  onDelete,
  onChangeColor,
  onChangeIcon,
  onManageCompartments,
}: CategoryMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const items = [
    { icon: Pencil, label: "Modifier", action: onEdit },
    { icon: ImageIcon, label: "Changer l'icône", action: onChangeIcon },
    { icon: Palette, label: "Changer la couleur", action: onChangeColor },
    { icon: Layers, label: "Compartiments", action: onManageCompartments },
    { icon: Trash2, label: "Supprimer", action: onDelete, danger: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/10 transition-colors"
        aria-label="Options"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 min-w-[180px] rounded-2xl border border-border bg-card p-1 shadow-elevated animate-in fade-in slide-in-from-top-2 duration-150">
          {items.map(({ icon: Icon, label, action, danger }) => (
            <button
              key={label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                action();
              }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                danger
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-surface"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
