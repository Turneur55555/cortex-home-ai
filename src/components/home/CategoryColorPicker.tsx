const COLORS = [
  "#f97316", "#ef4444", "#ec4899", "#a855f7",
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4",
  "#10b981", "#22c55e", "#84cc16", "#eab308",
  "#f59e0b", "#78716c", "#64748b", "#0f172a",
];

interface CategoryColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function CategoryColorPicker({ value, onChange }: CategoryColorPickerProps) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="h-8 w-8 rounded-full transition-transform active:scale-90"
          style={{ background: c, outline: value === c ? `3px solid ${c}` : "none", outlineOffset: 2 }}
          aria-label={c}
        />
      ))}
    </div>
  );
}
