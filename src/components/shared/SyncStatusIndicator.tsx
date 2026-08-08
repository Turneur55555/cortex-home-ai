import { useState } from "react";
import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { SyncQueueSheet } from "@/components/shared/SyncQueueSheet";

/**
 * Indicateur de statut de sync — discret, cohérent avec le reste de l'UI
 * premium (shadcn/ui). États : En ligne / Hors connexion / Synchronisation…
 * / Synchronisé / Action en attente / Conflit à résoudre. Un tap ouvre le
 * panneau des opérations en attente (`SyncQueueSheet`) quand il y a
 * quelque chose à montrer.
 */
export function SyncStatusIndicator() {
  const sync = useOfflineSync();
  const [open, setOpen] = useState(false);

  const hasWork = sync.pendingCount > 0 || sync.failedCount > 0 || sync.conflicts.length > 0;

  // Rien à signaler et en ligne : pas d'indicateur (discret par défaut).
  if (sync.isOnline && !hasWork && !sync.isSyncing) return null;

  let label: string;
  let icon: React.ReactNode;
  let tone: "muted" | "warn" | "danger" | "ok";

  if (sync.conflicts.length > 0) {
    label = "Conflit à résoudre";
    icon = <AlertTriangle className="h-3.5 w-3.5" />;
    tone = "danger";
  } else if (!sync.isOnline) {
    label = "Hors connexion";
    icon = <WifiOff className="h-3.5 w-3.5" />;
    tone = "muted";
  } else if (sync.isSyncing) {
    label = "Synchronisation…";
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    tone = "warn";
  } else if (sync.failedCount > 0) {
    label = "Action en attente";
    icon = <CloudOff className="h-3.5 w-3.5" />;
    tone = "warn";
  } else if (sync.pendingCount > 0) {
    label = "Action en attente";
    icon = <RefreshCw className="h-3.5 w-3.5" />;
    tone = "warn";
  } else {
    label = "Synchronisé";
    icon = <Check className="h-3.5 w-3.5" />;
    tone = "ok";
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Statut de synchronisation : ${label}`}
        className={cn(
          "fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur-md transition-colors",
          tone === "muted" && "border-border/60 bg-muted/70 text-muted-foreground",
          tone === "warn" &&
            "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
          tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
          tone === "ok" &&
            "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        )}
      >
        {icon}
        <span>{label}</span>
      </button>
      {open && <SyncQueueSheet onClose={() => setOpen(false)} sync={sync} />}
    </>
  );
}
