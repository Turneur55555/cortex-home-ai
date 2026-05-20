import { Loader2, Minus, Plus, Trash2 } from "lucide-react";

// ─── BulkActionBar ────────────────────────────────────────────────────────────

interface BulkActionBarProps {
  count: number;
  busy: boolean;
  onAdjust: (delta: number) => void;
  onDelete: () => void;
}

export function BulkActionBar({ count, busy, onAdjust, onDelete }: BulkActionBarProps) {
  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[min(420px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-border bg-card/95 p-2.5 shadow-elevated backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="px-2 text-xs font-semibold text-muted-foreground">{count}</span>
        <div className="flex flex-1 items-center gap-1 rounded-xl border border-border bg-surface p-0.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdjust(-1)}
            className="flex h-9 flex-1 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Qté
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdjust(1)}
            className="flex h-9 flex-1 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-destructive px-3 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Supprimer
        </button>
      </div>
    </div>
  );
}
