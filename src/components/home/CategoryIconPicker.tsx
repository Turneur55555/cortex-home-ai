import { getIcon, ICON_NAMES } from "@/lib/maison/icons";

interface CategoryIconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function CategoryIconPicker({ value, onChange }: CategoryIconPickerProps) {
  return (
    <div className="grid grid-cols-8 gap-1.5 max-h-52 overflow-y-auto pr-1">
      {ICON_NAMES.map((name) => {
        const Icon = getIcon(name);
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all active:scale-90 ${
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-surface-elevated text-muted-foreground hover:bg-muted"
            }`}
            aria-label={name}
            title={name}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
