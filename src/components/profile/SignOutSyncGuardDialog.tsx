import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  describeUnresolvedOfflineWork,
  type OfflineSignOutSummary,
} from "@/lib/offline/signOutGuard";

/**
 * CHANTIER 4 (MAJ-04) — Confirmation affichée quand `signOut()` purgerait des
 * opérations/conflits non résolus. Un seul point d'entrée (`SecurityPanel`) :
 * ce composant ne monte rien lui-même, il est piloté entièrement par ses
 * props (mêmes conventions que `SyncQueueSheet` — monté conditionnellement
 * par son appelant, jamais globalement).
 *
 * Deux étapes dans UNE seule boîte de dialogue (section 3 du chantier : « un
 * seul dialogue clair avec un résumé ») :
 * 1. le résumé + choix « Synchroniser d'abord » / « Se déconnecter quand
 *    même » / « Annuler » ;
 * 2. si « Se déconnecter quand même » est choisi, confirmation explicite
 *    supplémentaire avant toute purge — jamais de purge sur le premier clic.
 */
export function SignOutSyncGuardDialog({
  summary,
  busy,
  onSyncFirst,
  onSignOutAnyway,
  onCancel,
}: {
  summary: OfflineSignOutSummary;
  /** Une synchronisation ("Synchroniser d'abord") est en cours. */
  busy: boolean;
  onSyncFirst: () => void;
  onSignOutAnyway: () => void;
  onCancel: () => void;
}) {
  const [confirmingDestructive, setConfirmingDestructive] = useState(false);
  const lines = describeUnresolvedOfflineWork(summary);

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        {confirmingDestructive ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Se déconnecter sans synchroniser ?</AlertDialogTitle>
              <AlertDialogDescription>
                Les données listées ci-dessous ne sont pas encore confirmées par le serveur. En vous
                déconnectant maintenant, elles seront définitivement supprimées de cet appareil —
                cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-foreground/80">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <AlertDialogFooter>
              {/* Bouton simple, PAS `AlertDialogCancel` : celui-ci fermerait tout
                  le flux (Radix ferme le dialogue au clic sur "Cancel"), alors
                  qu'ici on veut seulement revenir à l'étape précédente. */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingDestructive(false)}
              >
                Annuler
              </Button>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onSignOutAnyway}
              >
                Se déconnecter et perdre ces données
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Des modifications ne sont pas encore synchronisées
              </AlertDialogTitle>
              <AlertDialogDescription>
                Vous avez des modifications faites sur cet appareil qui n&apos;ont pas encore
                atteint le serveur. Se déconnecter maintenant les supprimerait de cet appareil.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-foreground/80">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
              <Button type="button" className="w-full" disabled={busy} onClick={onSyncFirst}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Synchroniser d&apos;abord
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => setConfirmingDestructive(true)}
              >
                Se déconnecter quand même
              </Button>
              <AlertDialogCancel disabled={busy} className="mt-0 w-full">
                Annuler
              </AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
