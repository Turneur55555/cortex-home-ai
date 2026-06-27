import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { useBodyMeasurements, useDeleteBodyMeasurement } from "@/hooks/use-fitness";
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

/**
 * Historique des mensurations corporelles — déplacé du module Corps vers Profil.
 * Repliable, avec confirmation de suppression.
 */
export function BodyMeasurementsHistory() {
  const { data, isLoading } = useBodyMeasurements();
  const del = useDeleteBodyMeasurement();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const count = data?.length ?? 0;

  return (
    <section className="mb-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Historique mensurations
            </h2>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {count}
            </span>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="border-t border-white/5 p-3">
            {isLoading && (
              <div className="flex h-16 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && count === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Aucune mesure pour le moment.
              </p>
            )}
            {!isLoading && count > 0 && (
              <ul className="space-y-2">
                {data!.slice(0, 30).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {format(parseISO(m.date), "d MMM yyyy", { locale: fr })}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          m.weight != null && `${m.weight} kg`,
                          m.muscle_mass != null && `MM ${m.muscle_mass}`,
                          m.body_fat != null && `${m.body_fat}% MG`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingId(m.id)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Supprimer la mesure"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <AlertDialog
        open={pendingId !== null}
        onOpenChange={(o) => !o && setPendingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette mesure ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive et l'entrée d'historique sera perdue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingId) del.mutate(pendingId);
                setPendingId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
