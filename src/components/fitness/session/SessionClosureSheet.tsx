import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Sheet } from "@/components/shared/FormComponents";
import { useClosureDurationPreview, type ActiveWorkout } from "@/hooks/use-fitness";
import {
  closureDecision,
  durationFieldText,
  formatPendingSet,
  looksLoggedAfterTheFact,
  parseDurationInput,
  reviewSessionBeforeClosure,
  type ClosureDecision,
  type PendingSetsChoice,
} from "@/lib/fitness/closureReview";
import { setsTonnage } from "@/lib/fitness/sets";
import { formatTonnage } from "@/lib/fitness/strength";

const PENDING_PREVIEW_LIMIT = 4;

/**
 * Récap de clôture — s'ouvre sur « Terminer », AVANT que la séance ne soit close.
 * La règle vit dans `lib/fitness/closureReview.ts` ; ce composant n'affiche et ne transmet
 * que des décisions. Le verrou de clôture reste INTERNE à la mutation (invariant 2.3) :
 * `busy` ne fait que le refléter, et `confirm` refuse lui aussi pendant une clôture en vol.
 */
export function SessionClosureSheet({
  workout,
  busy,
  onConfirm,
  onClose,
}: {
  workout: ActiveWorkout;
  busy: boolean;
  onConfirm: (decision: ClosureDecision, durationMinutes: number | undefined) => void;
  onClose: () => void;
}) {
  const review = useMemo(() => reviewSessionBeforeClosure(workout.exercises), [workout.exercises]);
  const validatedTonnage = useMemo(
    () =>
      setsTonnage(
        (workout.exercises ?? []).flatMap((ex) =>
          (ex.exercise_sets ?? []).filter((s) => s.completed),
        ),
      ),
    [workout.exercises],
  );

  const { data: previewMinutes } = useClosureDurationPreview(workout);
  const [duration, setDuration] = useState("");
  const [durationTouched, setDurationTouched] = useState(false);
  useEffect(() => {
    if (!durationTouched) setDuration(durationFieldText(previewMinutes));
  }, [previewMinutes, durationTouched]);

  const parsed = parseDurationInput(duration);
  const durationInvalid = parsed.kind === "invalid";
  const afterTheFact = looksLoggedAfterTheFact(previewMinutes, review.validatedSets);
  const pendingCount = review.pendingSets.length;

  const confirm = (choice: PendingSetsChoice | null) => {
    if (busy || durationInvalid) return;
    onConfirm(
      closureDecision(review, choice),
      parsed.kind === "value" ? parsed.minutes : undefined,
    );
  };

  const summary = [
    `${review.validatedSets} série${review.validatedSets > 1 ? "s" : ""} validée${
      review.validatedSets > 1 ? "s" : ""
    }`,
    validatedTonnage > 0 ? formatTonnage(validatedTonnage) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Sheet title="Terminer la séance" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{workout.name}</p>
            <p className="text-[13px] text-muted-foreground tabular-nums">{summary}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
          <label htmlFor="closure-duration" className="flex items-center gap-3">
            <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-[15px] font-medium">Durée</span>
            <span className="flex items-baseline gap-1.5">
              <input
                id="closure-duration"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={duration}
                placeholder="—"
                onChange={(e) => {
                  setDurationTouched(true);
                  setDuration(e.target.value);
                }}
                aria-invalid={durationInvalid}
                aria-describedby="closure-duration-help"
                className="h-11 w-20 rounded-xl border border-border bg-background px-3 text-right text-[17px] font-semibold tabular-nums outline-none focus:border-primary"
              />
              <span className="text-[13px] text-muted-foreground">min</span>
            </span>
          </label>
          <p
            id="closure-duration-help"
            className={`mt-2 text-[12px] leading-snug ${
              durationInvalid ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {durationInvalid
              ? "Indique une durée entre 1 et 240 min (ex. 45 ou 1h10)."
              : afterTheFact
                ? "Saisie après coup ? Indique la vraie durée de ta séance."
                : "Calculée sur tes séries validées — corrige-la si besoin."}
          </p>
        </div>

        {pendingCount > 0 && (
          <div
            role="group"
            aria-labelledby="closure-pending-title"
            className="rounded-2xl border border-warning/30 bg-warning/[0.07] px-4 py-3"
          >
            <p
              id="closure-pending-title"
              className="flex items-center gap-2 text-[15px] font-semibold text-warning"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {pendingCount} série{pendingCount > 1 ? "s" : ""} saisie{pendingCount > 1 ? "s" : ""}{" "}
              mais pas cochée{pendingCount > 1 ? "s" : ""}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              Une série non cochée ne compte ni pour tes records, ni pour ton rang.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {review.pendingSets.slice(0, PENDING_PREVIEW_LIMIT).map((s) => (
                <li key={s.setId} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate">
                    {s.exerciseName}{" "}
                    <span className="text-muted-foreground">· série {s.position}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{formatPendingSet(s)}</span>
                </li>
              ))}
            </ul>
            {pendingCount > PENDING_PREVIEW_LIMIT && (
              <p className="mt-1 text-[12px] text-muted-foreground">
                et {pendingCount - PENDING_PREVIEW_LIMIT} autre
                {pendingCount - PENDING_PREVIEW_LIMIT > 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}

        {review.emptySetIds.length > 0 && (
          <p className="px-1 text-[12px] text-muted-foreground">
            {review.emptySetIds.length === 1
              ? "La série vide n'est pas gardée."
              : `Les ${review.emptySetIds.length} séries vides ne sont pas gardées.`}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {pendingCount > 0 ? (
            <>
              <button
                type="button"
                onClick={() => confirm("count")}
                disabled={busy || durationInvalid}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-primary text-[15px] font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Les compter et terminer
              </button>
              <button
                type="button"
                onClick={() => confirm("drop")}
                disabled={busy || durationInvalid}
                className="flex h-12 items-center justify-center rounded-2xl border border-border text-[15px] font-semibold disabled:opacity-50"
              >
                Terminer sans elles
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => confirm(null)}
              disabled={busy || durationInvalid}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-primary text-[15px] font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Terminer la séance
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 items-center justify-center rounded-2xl text-[14px] font-medium text-muted-foreground"
          >
            Revenir à la séance
          </button>
        </div>
      </div>
    </Sheet>
  );
}
