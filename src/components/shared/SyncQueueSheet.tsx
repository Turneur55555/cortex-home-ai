import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OfflineSyncState } from "@/hooks/useOfflineSync";

/**
 * Panneau des opérations en attente / échouées + résolution de conflit.
 * Visible seulement via `SyncStatusIndicator` quand il y a quelque chose à
 * montrer (pas de doublon d'entrée dans une nav — cohérent avec les autres
 * `*Sheet.tsx` du projet).
 */
export function SyncQueueSheet({ onClose, sync }: { onClose: () => void; sync: OfflineSyncState }) {
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Synchronisation</SheetTitle>
          <SheetDescription>
            {sync.isOnline
              ? "Vos modifications se synchronisent automatiquement."
              : "Hors connexion — vos modifications sont enregistrées et partiront dès le retour du réseau."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {sync.conflicts.length > 0 && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Conflits à résoudre
              </h3>
              {sync.conflicts.map((conflict) => (
                <ConflictCard
                  key={conflict.id}
                  conflict={conflict}
                  onResolve={(strategy) => sync.resolveConflict(conflict.id, strategy)}
                />
              ))}
            </section>
          )}

          <section className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {sync.pendingCount + sync.failedCount === 0
                  ? "Tout est synchronisé"
                  : `${sync.pendingCount + sync.failedCount} action${sync.pendingCount + sync.failedCount > 1 ? "s" : ""} en attente`}
              </p>
              {sync.failedCount > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {sync.failedCount} en échec — nouvelle tentative automatique
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!sync.isOnline || sync.isSyncing}
              onClick={() => sync.syncNow()}
            >
              <RefreshCw className={sync.isSyncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              Réessayer
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ConflictCard({
  conflict,
  onResolve,
}: {
  conflict: OfflineSyncState["conflicts"][number];
  onResolve: (strategy: "keep-local" | "keep-server") => void;
}) {
  const local = conflict.localData as Record<string, unknown>;
  const server = conflict.serverData as Record<string, unknown>;
  const label = typeof local.name === "string" ? local.name : conflict.table;

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Cette donnée a été modifiée ailleurs. Choisissez la version à conserver.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border/60 bg-background/60 p-2">
          <Badge variant="secondary" className="mb-1">
            Ma version
          </Badge>
          <VersionPreview data={local} />
        </div>
        <div className="rounded-md border border-border/60 bg-background/60 p-2">
          <Badge variant="secondary" className="mb-1">
            Version serveur
          </Badge>
          <VersionPreview data={server} />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => onResolve("keep-local")}>
          Garder ma version
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => onResolve("keep-server")}
        >
          Garder la version serveur
        </Button>
      </div>
    </div>
  );
}

function VersionPreview({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([field]) => !["id", "user_id", "created_at", "updated_at"].includes(field),
  );
  return (
    <dl className="space-y-0.5">
      {entries.slice(0, 4).map(([field, value]) => (
        <div key={field} className="flex justify-between gap-2 text-muted-foreground">
          <dt className="truncate">{field}</dt>
          <dd className="truncate text-foreground">{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
