import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Dumbbell,
  History,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  Trophy,
} from "lucide-react";
import type { ActiveExercise, ActiveSet } from "@/hooks/use-fitness";
import {
  useAddExerciseSet,
  useUpdateExerciseSet,
  useDeleteExerciseSet,
  useDeleteExercises,
} from "@/hooks/use-fitness";
import { restTimer } from "@/hooks/useRestTimer";
import { useLastExerciseSession, type LastSessionSet } from "@/hooks/useLastExerciseSession";

// ─── Comparaison série courante vs dernière séance ──────────────────────────

function compareToLast(
  current: { reps: number | null; weight: number | null },
  last: LastSessionSet | undefined,
): "up" | "down" | "equal" | null {
  if (!last) return null;
  if (current.weight == null && current.reps == null) return null;
  const cw = current.weight ?? 0;
  const lw = last.weight ?? 0;
  if (cw > lw) return "up";
  if (cw < lw) return "down";
  const cr = current.reps ?? 0;
  const lr = last.reps ?? 0;
  if (cr > lr) return "up";
  if (cr < lr) return "down";
  return "equal";
}

function TrendIcon({ trend }: { trend: "up" | "down" | "equal" | null }) {
  if (!trend) return null;
  if (trend === "up")
    return <ArrowUp className="h-3 w-3 text-success" aria-label="Progression" />;
  if (trend === "down")
    return <ArrowDown className="h-3 w-3 text-destructive" aria-label="Régression" />;
  return <Minus className="h-3 w-3 text-muted-foreground/50" aria-label="Identique" />;
}

// ─── Champ numérique tactile (kg / reps / rpe) ──────────────────────────────

function StatField({
  value,
  onChange,
  onCommit,
  placeholder,
  unit,
  step,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  placeholder: string;
  unit: string;
  step?: string;
  width?: string;
}) {
  return (
    <label
      className={`flex h-12 flex-col items-center justify-center rounded-[14px] bg-white/[0.05] transition-all focus-within:bg-primary/10 focus-within:ring-1 focus-within:ring-primary/40 ${width ?? "flex-1"}`}
    >
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        className="w-full bg-transparent text-center text-[15px] font-bold leading-none tabular-nums outline-none placeholder:font-semibold placeholder:text-muted-foreground/25"
      />
      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/45">
        {unit}
      </span>
    </label>
  );
}

// ─── Ligne de série ──────────────────────────────────────────────────────────

function SetRow({
  set,
  index,
  isMax,
  lastSet,
  onDelete,
  onUpdate,
  onToggleDone,
}: {
  set: ActiveSet;
  index: number;
  isMax: boolean;
  lastSet: LastSessionSet | undefined;
  onDelete: () => void;
  onUpdate: (field: "reps" | "weight" | "rpe", value: number | null) => void;
  onToggleDone: (done: boolean) => void;
}) {
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : "");
  const [weight, setWeight] = useState(set.weight != null ? String(set.weight) : "");
  const [rpe, setRpe] = useState(set.rpe != null ? String(set.rpe) : "");
  const [confirmDel, setConfirmDel] = useState(false);

  const parse = (v: string) => (v.trim() === "" ? null : Number(v));
  const trend = compareToLast({ reps: set.reps, weight: set.weight }, lastSet);
  const done = set.completed;

  if (confirmDel) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-2xl bg-destructive/10 px-4 py-3 animate-in fade-in zoom-in-95 duration-150">
        <span className="text-xs font-medium text-muted-foreground">
          Supprimer la série {index} ?
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmDel(false)}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground"
          >
            Non
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg bg-destructive/20 px-2.5 py-1 text-xs font-bold text-destructive"
          >
            Oui
          </button>
        </div>
      </li>
    );
  }

  const repsPh = lastSet?.reps != null ? String(lastSet.reps) : "—";
  const weightPh = lastSet?.weight != null ? String(lastSet.weight) : "—";

  return (
    <li
      className={`group flex items-center gap-1.5 rounded-2xl py-1 pl-1 pr-1 transition-colors ${
        done ? "bg-success/[0.07]" : isMax ? "bg-warning/[0.06]" : ""
      }`}
    >
      {/* Numéro (capsule) + tendance */}
      <div className="relative flex h-12 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
        <span
          className={`text-sm font-extrabold tabular-nums ${
            isMax ? "text-warning" : done ? "text-success" : "text-foreground"
          }`}
        >
          {index}
        </span>
        {trend && (
          <span className="absolute -right-1 -top-1 rounded-full bg-background p-px">
            <TrendIcon trend={trend} />
          </span>
        )}
      </div>

      {/* Poids */}
      <StatField
        value={weight}
        onChange={setWeight}
        onCommit={(v) => onUpdate("weight", parse(v))}
        placeholder={weightPh}
        unit="kg"
        step="0.5"
      />

      {/* Reps */}
      <StatField
        value={reps}
        onChange={setReps}
        onCommit={(v) => onUpdate("reps", parse(v))}
        placeholder={repsPh}
        unit="reps"
      />

      {/* RPE */}
      <StatField
        value={rpe}
        onChange={setRpe}
        onCommit={(v) => onUpdate("rpe", parse(v))}
        placeholder="—"
        unit="rpe"
        step="0.5"
        width="w-[52px]"
      />

      {/* Validation */}
      <button
        type="button"
        onClick={() => onToggleDone(!done)}
        aria-label={done ? "Série validée" : "Valider la série"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-90 ${
          done
            ? "bg-success text-success-foreground shadow-[0_0_0_4px_rgba(34,197,94,0.12)]"
            : "bg-white/[0.06] text-muted-foreground/40 hover:text-muted-foreground"
        }`}
      >
        <Check
          className={`h-5 w-5 transition-transform duration-200 ${done ? "scale-100" : "scale-90"}`}
          strokeWidth={done ? 3 : 2.5}
        />
      </button>

      {/* Suppression */}
      <button
        type="button"
        onClick={() => setConfirmDel(true)}
        className="flex h-11 w-5 shrink-0 items-center justify-center text-muted-foreground/25 transition-colors hover:text-destructive"
        aria-label="Supprimer la série"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// ─── Carte exercice ───────────────────────────────────────────────────────────

export function ActiveExerciseCard({
  exercise,
  workoutId,
  imageUrl,
  pr,
  onOpenStats,
}: {
  exercise: ActiveExercise;
  workoutId: string;
  imageUrl: string | null;
  pr: number | null;
  onOpenStats?: () => void;
}) {
  const addSet = useAddExerciseSet();
  const updateSet = useUpdateExerciseSet();
  const deleteSet = useDeleteExerciseSet();
  const deleteExercises = useDeleteExercises();

  const { data: lastSession } = useLastExerciseSession(exercise.name, workoutId);

  const [confirmDeleteEx, setConfirmDeleteEx] = useState(false);

  const sortedSets = [...(exercise.exercise_sets ?? [])].sort(
    (a, b) => a.set_number - b.set_number,
  );

  const lastSetsByNumber = useMemo(() => {
    const m = new Map<number, LastSessionSet>();
    for (const s of lastSession?.sets ?? []) m.set(s.set_number, s);
    return m;
  }, [lastSession]);

  const maxWeight = sortedSets.reduce<number | null>(
    (m, s) => (s.weight != null ? (m == null ? s.weight : Math.max(m, s.weight)) : m),
    null,
  );

  const volume = sortedSets.reduce(
    (acc, s) => acc + (s.reps ?? 0) * (s.weight ?? 0),
    0,
  );

  const isPR = maxWeight != null && pr != null && maxWeight >= pr;
  const isNewPR = maxWeight != null && pr != null && maxWeight > pr;

  const lastSummary = useMemo(() => {
    const sets = lastSession?.sets ?? [];
    if (sets.length === 0) return null;
    return sets.reduce<LastSessionSet>(
      (best, cur) => ((cur.weight ?? 0) > (best.weight ?? 0) ? cur : best),
      sets[0],
    );
  }, [lastSession]);

  const volLabel =
    volume >= 1000 ? `${(volume / 1000).toFixed(1)}k` : `${volume}`;

  const handleAddSet = async () => {
    const last = sortedSets[sortedSets.length - 1];
    const nextIndex = sortedSets.length + 1;
    const fallback = lastSetsByNumber.get(nextIndex) ?? lastSession?.sets[0];
    await addSet.mutateAsync({
      exerciseId: exercise.id,
      setNumber: nextIndex,
      reps: last?.reps ?? fallback?.reps ?? null,
      weight: last?.weight ?? fallback?.weight ?? null,
    });
  };

  const handleRestoreLastSession = async () => {
    const lastSets = lastSession?.sets ?? [];
    if (lastSets.length === 0) return;
    for (const s of sortedSets) {
      const ref = lastSetsByNumber.get(s.set_number);
      if (!ref) continue;
      updateSet.mutate({ id: s.id, reps: ref.reps, weight: ref.weight });
    }
    const existingNumbers = new Set(sortedSets.map((s) => s.set_number));
    const toCreate = lastSets.filter((s) => !existingNumbers.has(s.set_number));
    for (const ref of toCreate) {
      await addSet.mutateAsync({
        exerciseId: exercise.id,
        setNumber: ref.set_number,
        reps: ref.reps,
        weight: ref.weight,
      });
    }
  };

  const handleUpdate = (
    set: ActiveSet,
    field: "reps" | "weight" | "rpe",
    value: number | null,
  ) => {
    updateSet.mutate({ id: set.id, [field]: value });
  };

  const handleToggleDone = (set: ActiveSet, done: boolean) => {
    updateSet.mutate({ id: set.id, completed: done });
    if (done) restTimer.startForExercise(exercise.id);
  };

  const handleDeleteSet = (id: string) => deleteSet.mutate(id);
  const handleDeleteExercise = () => deleteExercises.mutate([exercise.id]);

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/5 bg-surface/80 p-4 shadow-[0_4px_24px_-12px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ── En-tête ── */}
      <div className="flex items-start gap-3">
        {/* Zone tactile : photo + nom + stats → fiche détaillée */}
        <button
          type="button"
          onClick={onOpenStats}
          className="flex min-w-0 flex-1 items-start gap-3 text-left transition-opacity active:opacity-70"
        >
          {imageUrl ? (
            <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10">
              <img
                src={imageUrl}
                alt={exercise.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary/70">
              <Dumbbell className="h-7 w-7" />
            </div>
          )}

          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="line-clamp-2 text-[17px] font-semibold leading-tight tracking-tight">
              {exercise.name}
            </h3>

            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="tabular-nums">
                {sortedSets.length} série{sortedSets.length > 1 ? "s" : ""}
              </span>
              {maxWeight != null && (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="tabular-nums">{maxWeight} kg max</span>
                </>
              )}
              {volume > 0 && (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="tabular-nums text-muted-foreground/70">{volLabel} kg</span>
                </>
              )}
            </div>

            {/* Badges */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {isPR && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
                  <Trophy className="h-3 w-3" />
                  {isNewPR ? "Nouveau record" : `Record ${pr} kg`}
                </span>
              )}
              {lastSummary && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <History className="h-3 w-3" />
                  {lastSummary.weight ?? "—"} kg × {lastSummary.reps ?? "—"}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={onOpenStats}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-primary/10 hover:text-primary"
            aria-label="Statistiques de l'exercice"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteEx(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-destructive/10 hover:text-destructive"
            aria-label="Supprimer l'exercice"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Confirmation suppression exercice ── */}
      {confirmDeleteEx && (
        <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 animate-in fade-in zoom-in-95 duration-150">
          <p className="text-sm font-semibold text-destructive">
            Supprimer « {exercise.name} » ?
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Toutes les séries associées seront supprimées.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteEx(false)}
              className="flex-1 rounded-xl border border-border py-2 text-xs font-medium"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDeleteExercise}
              className="flex-1 rounded-xl bg-destructive py-2 text-xs font-semibold text-destructive-foreground"
            >
              Supprimer
            </button>
          </div>
        </div>
      )}

      {/* ── Reprendre les charges précédentes ── */}
      {lastSession && lastSession.sets.length > 0 && (
        <button
          type="button"
          onClick={handleRestoreLastSession}
          disabled={addSet.isPending || updateSet.isPending}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/[0.07] py-2.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/[0.12] disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reprendre les charges précédentes
        </button>
      )}

      {/* ── Séries ── */}
      <div className="mt-3">
        {sortedSets.length === 0 ? (
          <p className="rounded-2xl bg-white/[0.02] py-5 text-center text-xs text-muted-foreground/50">
            Aucune série — ajoutez-en une ci-dessous
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedSets.map((s, idx) => (
              <SetRow
                key={s.id}
                set={s}
                index={idx + 1}
                isMax={s.weight != null && s.weight === maxWeight && maxWeight != null}
                lastSet={lastSetsByNumber.get(s.set_number) ?? lastSession?.sets[idx]}
                onUpdate={(field, value) => handleUpdate(s, field, value)}
                onToggleDone={(done) => handleToggleDone(s, done)}
                onDelete={() => handleDeleteSet(s.id)}
              />
            ))}
          </ul>
        )}

        {/* Ajouter une série */}
        <button
          type="button"
          onClick={handleAddSet}
          disabled={addSet.isPending}
          className="mt-2 flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-white/[0.05] text-[13px] font-semibold text-primary transition-all active:scale-[0.99] hover:bg-primary/10 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Ajouter une série
        </button>
      </div>
    </div>
  );
}
