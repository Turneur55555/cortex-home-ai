import { useState } from "react";
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  ChevronDown,
  Loader2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTransfer } from "../hooks/useTransfer";
import { detectTransferableContent } from "../utils/detectContent";
import { ALL_TARGETS, TRANSFER_LABELS, type TransferTarget } from "../types";

const IS_DEV = import.meta.env.DEV;

type Props = {
  items: Array<Record<string, unknown>>;
  defaultTarget: TransferTarget;
  onSuccess?: () => void;
  className?: string;
};

export function TransferPanel({ items, defaultTarget, onSuccess, className }: Props) {
  const [target, setTarget] = useState<TransferTarget>(defaultTarget);
  const [showDebug, setShowDebug] = useState(false);
  const { status, transfer, reset } = useTransfer();

  const { canTransfer, totalItems } = detectTransferableContent(items);

  const handleTransfer = async () => {
    if (!canTransfer || status.phase === "pending") return;
    try {
      await transfer(target, items);
      onSuccess?.();
    } catch {
      // handled in useTransfer
    }
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!canTransfer) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-muted-foreground",
          className,
        )}
      >
        Aucune donnée exploitable extraite.
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (status.phase === "success") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {status.count} entrée{status.count > 1 ? "s" : ""} ajoutée{status.count > 1 ? "s" : ""} dans {TRANSFER_LABELS[status.target]}
        </div>
      </div>
    );
  }

  // ── Normal / error state ───────────────────────────────────────────────────
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Module selector */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Déverser vers
        </p>
        <Select
          value={target}
          onValueChange={(v) => {
            setTarget(v as TransferTarget);
            if (status.phase === "error") reset();
          }}
          disabled={status.phase === "pending"}
        >
          {/* h-12 = 48px > 44px iOS minimum touch target */}
          <SelectTrigger
            className="h-12 text-sm"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_TARGETS.map((m) => (
              <SelectItem key={m} value={m}>
                {TRANSFER_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error banner */}
      {status.phase === "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{status.message}</span>
        </div>
      )}

      {/* Transfer button — always rendered, never hidden by overflow/z-index */}
      <button
        type="button"
        onClick={() => void handleTransfer()}
        disabled={status.phase === "pending"}
        className={cn(
          // Full-width, large touch target (iOS HIG ≥ 44px, using 52px)
          "relative flex w-full items-center justify-center gap-2 overflow-hidden",
          "min-h-[3.25rem] rounded-2xl px-5 text-sm font-semibold text-primary-foreground",
          "bg-primary transition-all duration-150",
          "active:scale-[0.97] active:brightness-90",
          // Safari: explicit touch-action to avoid delay
          "touch-manipulation",
          status.phase === "pending" && "opacity-60",
        )}
        // Safari iOS: explicit inline styles override WebKit defaults
        style={{
          WebkitTapHighlightColor: "transparent",
          WebkitAppearance: "none",
          outline: "none",
          cursor: status.phase === "pending" ? "not-allowed" : "pointer",
        }}
        aria-label={`Déverser ${totalItems} élément${totalItems > 1 ? "s" : ""} vers ${TRANSFER_LABELS[target]}`}
      >
        {status.phase === "pending" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Déversement en cours…
          </>
        ) : (
          <>
            <ChevronDown className="h-5 w-5" />
            Déverser {totalItems} élément{totalItems > 1 ? "s" : ""} → {TRANSFER_LABELS[target]}
          </>
        )}
      </button>

      {/* Debug toggle — dev only */}
      {IS_DEV && (
        <div>
          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <Bug className="h-3 w-3" />
            {showDebug ? "Masquer debug" : "Debug"}
          </button>
          {showDebug && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-border bg-surface p-3 text-[10px] leading-relaxed text-muted-foreground">
              {JSON.stringify(
                {
                  canTransfer,
                  totalItems,
                  target,
                  status: status.phase,
                  sampleItem: items[0] ?? null,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
