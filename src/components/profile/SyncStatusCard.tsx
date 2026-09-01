import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, CloudUpload, Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { SyncQueueSheet } from "@/components/shared/SyncQueueSheet";
import { summarizeSyncQueue, type SyncSummaryTone } from "@/lib/offline/syncQueueSummary";

/**
 * Bloc « Synchronisation » du Profil — SEUL point d'accès au panneau détaillé
 * (`SyncQueueSheet`) depuis l'audit UI du 01/09/2026.
 *
 * Avant : un indicateur flottant était monté globalement dans
 * `_authenticated.tsx` et apparaissait par-dessus n'importe quel écran dès
 * qu'une action était en attente — donc après quasiment chaque geste pendant
 * une séance. La synchronisation est une fonctionnalité SECONDAIRE : elle est
 * désormais rangée dans le Profil, à côté des autres réglages, et
 * n'interrompt plus jamais l'utilisateur.
 *
 * Aucune logique de synchronisation ici : on lit `useOfflineSync()` (le hook
 * existant, source unique) et on réutilise `SyncQueueSheet` tel quel — liste
 * des opérations, erreurs, « Réessayer », « Retirer de la file » et
 * résolution de conflit restent intégralement disponibles.
 */

const TONE_STYLES: Record<SyncSummaryTone, { icon: React.ReactNode; className: string }> = {
  ok: {
    icon: <Check className="h-4 w-4" />,
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  syncing: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    className: "bg-primary/15 text-primary",
  },
  pending: {
    icon: <CloudUpload className="h-4 w-4" />,
    className: "bg-primary/15 text-primary",
  },
  offline: {
    icon: <WifiOff className="h-4 w-4" />,
    className: "bg-muted text-muted-foreground",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  attention: {
    icon: <AlertTriangle className="h-4 w-4" />,
    className: "bg-destructive/15 text-destructive",
  },
};

export function SyncStatusCard() {
  const sync = useOfflineSync();
  const [open, setOpen] = useState(false);

  const summary = summarizeSyncQueue({
    isOnline: sync.isOnline,
    isSyncing: sync.isSyncing,
    pendingCount: sync.pendingCount,
    failedCount: sync.failedCount,
    blockedCount: sync.blockedCount,
    conflictCount: sync.conflicts.length,
  });
  const tone = TONE_STYLES[summary.tone];

  return (
    <>
      {/* Le titre « Synchronisation » est porté par le `SettingsGroup` qui
          enveloppe ce bloc dans Profil — pas de second en-tête ici. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Synchronisation : ${summary.label}. Voir les détails`}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                tone.className,
              )}
            >
              {tone.icon}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{summary.label}</p>
              {summary.detail && (
                <p className="truncate text-xs text-muted-foreground">{summary.detail}</p>
              )}
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            {/* Indication discrète, jamais une notification permanente :
                une pastille sur ce bloc, uniquement quand une intervention
                est réellement nécessaire. */}
            {summary.needsAttention && (
              <span
                aria-hidden
                data-testid="sync-attention-dot"
                className="h-1.5 w-1.5 rounded-full bg-destructive"
              />
            )}
            <span className="text-xs text-muted-foreground">Voir les détails</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>
      </div>

      {open && <SyncQueueSheet onClose={() => setOpen(false)} sync={sync} />}
    </>
  );
}
