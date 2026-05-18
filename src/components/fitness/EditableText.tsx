import { useState } from "react";
import { Pencil } from "lucide-react";

export function EditableText({
  value,
  onSave,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`bg-transparent outline-none border-b border-primary ${className}`}
        style={{ minWidth: 60 }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`group inline-flex items-center gap-1.5 text-left ${className}`}
    >
      <span>{value}</span>
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-primary/60" />
    </button>
  );
}
