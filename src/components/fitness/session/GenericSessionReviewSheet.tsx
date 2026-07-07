// ============================================================
// Écran de relecture générique avant sauvegarde — pour toute discipline
// dont historyPresentation.cardVariant !== 'strength'. La musculation
// garde WorkoutSheet tel quel (édition fine série par série, intouchée) ;
// cet écran sert HYROX, Course, Cardio et Activités accompagnées, qui
// n'ont pas cette granularité (segments/blocs, pas des séries).
//
// Réutilise le composant Sheet partagé (comme CoachSheet) plutôt que de
// dupliquer le balisage d'overlay/poignée/fermeture.
// ============================================================

import { useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/shared/FormComponents";
import { useAddWorkout } from "@/hooks/use-fitness";
import type { WorkoutRecordDraft } from "@/lib/fitness/engines/types";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { isReadyEngine } from "@/lib/fitness/engines/types";
import { SessionSummaryCard } from "./SessionSummaryCard";
import { SessionSegmentList } from "./SessionSegmentList";

export function GenericSessionReviewSheet({
  draft,
  onClose,
  onSaved,
}: {
  draft: WorkoutRecordDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const add = useAddWorkout();
  const entry = ENGINE_REGISTRY[draft.discipline];
  const engine = entry && isReadyEngine(entry) ? entry : null;

  const [name, setName] = useState(draft.name);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState(draft.notes ?? "");

  if (!engine) return null; // filet de sécurité, ne devrait pas arriver

  const view = engine.toSessionView(draft);

  const handleSave = async () => {
    try {
      await add.mutateAsync({
        name: name.trim() || draft.name,
        date,
        duration_minutes: draft.duration_minutes,
        notes: notes.trim() || null,
        gym_location: draft.gym_location,
        discipline: draft.discipline,
        metadata: draft.metadata ?? {},
        exercises: [],
      });
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  };

  return (
    <Sheet title={`Récapitulatif — ${entry.label}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Nom de la séance
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <SessionSummaryCard view={{ ...view, notes: undefined }} />
        <SessionSegmentList segments={view.segments} />

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={add.isPending}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
        >
          {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {add.isPending ? "Enregistrement…" : "Enregistrer la séance"}
        </button>
      </div>
    </Sheet>
  );
}
