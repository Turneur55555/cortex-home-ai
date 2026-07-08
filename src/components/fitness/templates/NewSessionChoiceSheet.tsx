import { ChevronRight, ClipboardList, Sparkles } from "lucide-react";
import { Sheet } from "@/components/shared/FormComponents";

/**
 * Écran de choix ouvert par "Choisir une épreuve" — remplace l'ouverture
 * directe de StartWorkoutSheet. Sans lien avec Sensei (moteur d'IA, carte
 * séparée) : ce choix ne concerne que le point de départ structurel d'une
 * nouvelle séance manuelle/live.
 */
export function NewSessionChoiceSheet({
  onClose,
  onChooseBlank,
  onChooseSaved,
}: {
  onClose: () => void;
  onChooseBlank: () => void;
  onChooseSaved: () => void;
}) {
  return (
    <Sheet title="Nouvelle séance" onClose={onClose}>
      <div className="space-y-3">
        <button
          type="button"
          onClick={onChooseBlank}
          className="flex w-full items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              ✨ Démarrer une séance vide
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Choisis un nom et une salle, ajoute tes exercices au fil de la séance.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        <button
          type="button"
          onClick={onChooseSaved}
          className="flex w-full items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ClipboardList className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              📋 Utiliser une séance sauvegardée
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Repars d'un modèle (Push, Jambes, HYROX Force...) déjà prêt.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </div>
    </Sheet>
  );
}
