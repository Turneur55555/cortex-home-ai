import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, Field } from "@/components/shared/FormComponents";
import { isValidWorkoutDurationMinutes, useUpdateWorkoutSchedule } from "@/hooks/use-fitness";

interface EditWorkoutScheduleModalProps {
  workoutId: string;
  /** Date actuellement enregistrée (format `yyyy-MM-dd`, colonne Postgres `date`). */
  currentDate: string;
  /** `duration_minutes` actuellement enregistré. */
  currentDurationMinutes: number | null;
  onClose: () => void;
}

/**
 * Correction manuelle de la date et de la durée d'une séance terminée — pour
 * les séances validées après oubli de clôture, dont `duration_minutes` peut
 * être complètement faux (ex. 187 min au lieu de 62). Ne touche jamais aux
 * exercices/séries : seule la ligne `workouts` (id inchangé) est mise à jour.
 *
 * Musculation : la durée reste purement descriptive — la corriger ne change
 * jamais les calories (voir useUpdateWorkoutSchedule).
 */
export function EditWorkoutScheduleModal({
  workoutId,
  currentDate,
  currentDurationMinutes,
  onClose,
}: EditWorkoutScheduleModalProps) {
  const update = useUpdateWorkoutSchedule();
  const [dateText, setDateText] = useState(currentDate);
  const [durationText, setDurationText] = useState(
    currentDurationMinutes != null ? String(currentDurationMinutes) : "",
  );

  const durationValue = Number(durationText);
  const isDateValid = dateText.trim() !== "";
  const isDurationValid =
    durationText.trim() !== "" && isValidWorkoutDurationMinutes(durationValue);
  const canSubmit = isDateValid && isDurationValid && !update.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    await update.mutateAsync({ id: workoutId, date: dateText, durationMinutes: durationValue });
    onClose();
  };

  return (
    <Sheet title="Modifier la séance" onClose={onClose}>
      <div className="space-y-5">
        <Field
          id="workout-date"
          label="Date"
          type="date"
          value={dateText}
          onChange={setDateText}
          required
        />
        <div>
          <Field
            id="workout-duration"
            label="Durée réelle (minutes)"
            type="number"
            value={durationText}
            onChange={setDurationText}
            placeholder="ex. 62"
            required
          />
          {durationText.trim() !== "" && !isDurationValid && (
            <p className="mt-1.5 text-xs text-destructive">
              La durée doit être un nombre entier de minutes, supérieur à 0.
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </Sheet>
  );
}
