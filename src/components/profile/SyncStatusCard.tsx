import { useState } from "react";
import { AlertTriangle, Check, CloudUpload, Loader2, WifiOff } from "lucide-react";
import { SpaceButton } from "./SpaceTile";
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
      <SpaceButton
        icon={tone.icon}
        iconClassName={tone.className}
        label="Synchronisation"
        subtitle={
          <>
            {summary.label}
            {summary.detail ? ` · ${summary.detail}` : ""}
          </>
        }
        srHint="Voir les détails"
        attention={summary.needsAttention}
        ariaLabel={`Synchronisation : ${summary.label}. Voir les détails`}
        onClick={() => setOpen(true)}
      />

      {open && <SyncQueueSheet onClose={() => setOpen(false)} sync={sync} />}
    </>
  );
}
