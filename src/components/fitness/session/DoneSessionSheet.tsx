import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { AppSheet } from "@/components/profile/AppSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogDoneWorkout, useWorkouts } from "@/hooks/use-fitness";
import { useLocalToday } from "@/hooks/useLocalToday";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { formatKg, longDayLabel, relativeDaysLabel } from "@/lib/fitness/todayCard";
import {
  DURATION_CHOICES,
  buildDoneSessionDraft,
  defaultDoneSessionDuration,
  describeDoneExercise,
  describeDoneSessionError,
  parseDoneDuration,
  validateDoneSession,
  type DoneExerciseDraft,
  type DoneSessionDraft,
  type DoneSessionPayload,
  type DoneSessionTarget,
} from "@/lib/fitness/doneSession";
import { cn } from "@/lib/utils";

export interface LoggedDoneSession {
  workoutId: string;
  payload: DoneSessionPayload;
}

/**
 * « Séance faite » — confirmer APRÈS COUP une séance déjà faite, en un geste.
 *
 * Tout ce qui est décidé vit dans `lib/fitness/doneSession.ts` (pré-remplissage, durée
 * proposée, validation) ; l'écriture est `useLogDoneWorkout` (chemin d'une séance vécue en
 * direct, pour que l'XP serveur voie les séries). Ce composant ne fait qu'afficher et éditer le
 * brouillon.
 *
 * Le geste nominal tient en UN appui : les exercices et les séries de la dernière séance du même
 * nom sont déjà là, la durée est proposée d'après un fait ; on ne déplie un exercice que pour
 * corriger.
 */
export function DoneSessionSheet({
  target,
  onClose,
  onLogged,
}: {
  target: DoneSessionTarget;
  onClose: () => void;
  onLogged: (logged: LoggedDoneSession) => void;
}) {
  const workoutsQuery = useWorkouts();
  const templatesQuery = useWorkoutTemplates();
  const today = useLocalToday();
  const logDone = useLogDoneWorkout();

  const ready = !workoutsQuery.isLoading && !templatesQuery.isLoading;
  const [draft, setDraft] = useState<DoneSessionDraft | null>(null);
  const [duration, setDuration] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestion = useMemo(
    () =>
      ready ? defaultDoneSessionDuration(workoutsQuery.data ?? [], target.name, target.date) : null,
    [ready, workoutsQuery.data, target.name, target.date],
  );

  // Le brouillon est construit UNE fois, dès que les sources sont lues : une relecture des
  // séances (synchronisation en arrière-plan) ne doit jamais effacer une correction en cours.
  useEffect(() => {
    if (!ready || initialized) return;
    const template =
      target.templateId !== null
        ? ((templatesQuery.data ?? []).find((t) => t.id === target.templateId) ?? null)
        : null;
    setDraft(buildDoneSessionDraft({ target, workouts: workoutsQuery.data ?? [], template }));
    if (suggestion) setDuration(String(suggestion.minutes));
    setInitialized(true);
  }, [ready, initialized, target, templatesQuery.data, workoutsQuery.data, suggestion]);

  const validation = useMemo(
    () => (draft ? validateDoneSession(draft, duration, today) : null),
    [draft, duration, today],
  );

  const updateExercise = (key: string, update: (e: DoneExerciseDraft) => DoneExerciseDraft) => {
    setError(null);
    setDraft((d) =>
      d ? { ...d, exercises: d.exercises.map((e) => (e.key === key ? update(e) : e)) } : d,
    );
  };

  const submit = async () => {
    if (!draft || !validation || logDone.isPending) return;
    if (!validation.ok) {
      setError(describeDoneSessionError(validation));
      return;
    }
    try {
      const { workoutId } = await logDone.mutateAsync(validation.payload);
      onLogged({ workoutId, payload: validation.payload });
    } catch {
      // La mutation a déjà affiché son erreur.
    }
  };

  const dayLabel = `${capitalizeFirst(relativeDaysLabel(target.date, today))} · ${longDayLabel(target.date)}`;
  const durationMinutes = parseDoneDuration(duration);

  return (
    <AppSheet
      open
      onOpenChange={(open) => {
        if (!open && !logDone.isPending) onClose();
      }}
      title="Séance faite"
      description={dayLabel}
    >
      {!initialized ? (
        <div className="space-y-3 pb-4" aria-busy="true">
          <Skeleton className="h-8 w-2/3 rounded-xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : !draft ? (
        <p className="pb-6 text-sm text-muted-foreground">
          Aucune séance « {target.name} » à reprendre : enregistre-la depuis l'écran Séances.
        </p>
      ) : (
        <div className="pb-2">
          <h3 className="break-words font-serif text-[26px] font-semibold italic leading-tight text-foreground">
            {draft.name}
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            {draft.source.kind === "last-session"
              ? `Comme ta séance du ${longDayLabel(draft.source.date).toLocaleLowerCase("fr-FR")} — corrige seulement ce qui a changé.`
              : "Pré-remplie avec ta séance sauvegardée — corrige ce qui a changé."}
          </p>

          <ul className="mt-4 space-y-2">
            {draft.exercises.map((exercise) => (
              <ExerciseRow
                key={exercise.key}
                exercise={exercise}
                open={expanded === exercise.key}
                onToggleOpen={() => setExpanded((k) => (k === exercise.key ? null : exercise.key))}
                onChange={(update) => updateExercise(exercise.key, update)}
              />
            ))}
          </ul>

          <section className="mt-5" aria-labelledby="done-duration-label">
            <div className="flex items-baseline justify-between gap-3">
              <h4 id="done-duration-label" className="text-[13px] font-semibold text-foreground">
                Durée
              </h4>
              <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Durée en minutes"
                  value={duration}
                  onChange={(e) => {
                    setError(null);
                    setDuration(e.target.value.replace(/\D/g, "").slice(0, 3));
                  }}
                  className="h-11 w-16 rounded-xl border border-white/10 bg-white/[0.05] text-center text-[16px] font-semibold tabular-nums text-foreground"
                />
                min
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {DURATION_CHOICES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={durationMinutes === minutes}
                  onClick={() => {
                    setError(null);
                    setDuration(String(minutes));
                  }}
                  className={cn(
                    "min-h-[44px] min-w-[56px] rounded-full px-3.5 text-[13px] font-semibold tabular-nums active:scale-95",
                    durationMinutes === minutes
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/[0.06] text-foreground",
                  )}
                >
                  {minutes}
                </button>
              ))}
            </div>
            {suggestion && (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                {suggestion.from.kind === "same-name"
                  ? `Proposée d'après ta dernière séance « ${draft.name} » enregistrée en direct.`
                  : "Proposée d'après ta dernière séance enregistrée en direct."}
              </p>
            )}
          </section>

          <div className="sticky bottom-0 -mx-6 mt-5 bg-gradient-to-t from-background via-background/95 to-transparent px-6 pb-1 pt-4">
            {error && (
              <p
                role="alert"
                className="mb-2 text-center text-[12px] font-semibold text-destructive"
              >
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={logDone.isPending}
              className="flex min-h-[52px] w-full flex-col items-center justify-center rounded-2xl bg-primary px-4 text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary-glow-soft)] active:scale-[0.98] disabled:opacity-60"
            >
              <span className="text-[15px] font-bold">
                {logDone.isPending ? "Enregistrement…" : "Valider la séance"}
              </span>
              {validation?.ok && !logDone.isPending && (
                <span className="text-[11px] font-semibold opacity-80">
                  {validation.totalSets} série{validation.totalSets > 1 ? "s" : ""}
                  {validation.volumeKg > 0 ? ` · ${formatKg(validation.volumeKg)} kg` : ""}
                  {` · ${validation.payload.durationMinutes} min`}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </AppSheet>
  );
}

function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text[0].toLocaleUpperCase("fr-FR") + text.slice(1);
}

function ExerciseRow({
  exercise,
  open,
  onToggleOpen,
  onChange,
}: {
  exercise: DoneExerciseDraft;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (update: (e: DoneExerciseDraft) => DoneExerciseDraft) => void;
}) {
  const panelId = `done-ex-${exercise.key}`;
  return (
    <li
      className={cn(
        "rounded-2xl border bg-white/[0.035] transition-colors",
        exercise.included ? "border-white/[0.08]" : "border-transparent opacity-55",
      )}
    >
      <div className="flex items-center gap-1 pr-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={exercise.included}
          aria-label={`${exercise.name} : ${exercise.included ? "fait" : "pas fait"}`}
          onClick={() => onChange((e) => ({ ...e, included: !e.included }))}
          className="flex h-[52px] w-12 shrink-0 items-center justify-center"
        >
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border",
              exercise.included
                ? "border-primary bg-primary text-primary-foreground"
                : "border-white/25 bg-transparent",
            )}
          >
            {exercise.included && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2 py-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-foreground">
              {exercise.name}
            </span>
            <span className="block text-[12px] tabular-nums text-muted-foreground">
              {exercise.included ? describeDoneExercise(exercise.sets) : "Pas fait cette fois"}
            </span>
          </span>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground">
            <ChevronDown
              aria-hidden
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            />
          </span>
        </button>
      </div>

      {open && (
        <div id={panelId} className="space-y-1.5 px-3 pb-3">
          {exercise.sets.map((set, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Série {index + 1}
              </span>
              <SetField
                label={`Répétitions, série ${index + 1}`}
                unit="rép."
                inputMode="numeric"
                value={set.reps}
                onChange={(v) =>
                  onChange((e) => ({
                    ...e,
                    sets: e.sets.map((s, i) => (i === index ? { ...s, reps: v } : s)),
                  }))
                }
              />
              <SetField
                label={`Charge, série ${index + 1}`}
                unit="kg"
                inputMode="decimal"
                value={set.weight}
                onChange={(v) =>
                  onChange((e) => ({
                    ...e,
                    sets: e.sets.map((s, i) => (i === index ? { ...s, weight: v } : s)),
                  }))
                }
              />
              <button
                type="button"
                aria-label={`Retirer la série ${index + 1}`}
                onClick={() =>
                  onChange((e) => ({ ...e, sets: e.sets.filter((_, i) => i !== index) }))
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground active:scale-95"
              >
                <Minus aria-hidden className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange((e) => {
                const last = e.sets[e.sets.length - 1];
                return {
                  ...e,
                  included: true,
                  sets: [...e.sets, last ? { ...last } : { reps: "", weight: "" }],
                };
              })
            }
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.05] text-[13px] font-semibold text-foreground active:scale-[0.98]"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Ajouter une série
          </button>
        </div>
      )}
    </li>
  );
}

function SetField({
  label,
  unit,
  inputMode,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  inputMode: "numeric" | "decimal";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-11 min-w-0 flex-1 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.05] px-2.5">
      <input
        type="text"
        inputMode={inputMode}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-right text-[16px] font-semibold tabular-nums text-foreground outline-none"
      />
      <span className="shrink-0 text-[11px] text-muted-foreground">{unit}</span>
    </label>
  );
}
