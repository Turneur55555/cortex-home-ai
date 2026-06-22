import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Dumbbell, History, Minus, Plus, RotateCcw, Trash2, Trophy } from "lucide-react";
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
  // Compare en priorité sur le poids, puis sur les reps si poids identique.
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
  return <Minus className="h-3 w-3 text-muted-foreground/60" aria-label="Identique" />;
}

// ─── Single set row (inline edit) ────────────────────────────────────────────

function SetRow({
  set,
  index,
  isMax,
  lastSet,
  onDelete,
  onUpdate,
}: {
  set: ActiveSet;
  index: number;
  isMax: boolean;
  lastSet: LastSessionSet | undefined;
  onDelete: () => void;
  onUpdate: (field: "reps" | "weight" | "rpe", value: number | null) => void;
}) {
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : "");
  const [weight, setWeight] = useState(set.weight != null ? String(set.weight) : "");
  const [rpe, setRpe] = useState(set.rpe != null ? String(set.rpe) : "");
  const [confirmDel, setConfirmDel] = useState(false);

  const parse = (v: string) => (v.trim() === "" ? null : Number(v));

  const inputCls =
    "w-full bg-transparent py-2 text-center text-sm font-semibold tabular-nums outline-none focus:text-primary transition-colors placeholder:text-muted-foreground/30";

  const trend = compareToLast({ reps: set.reps, weight: set.weight }, lastSet);

  if (confirmDel) {
    return (
      <li className="grid grid-cols-[36px_1fr_32px] items-center gap-2 px-2 py-1.5 bg-destructive/5">
        <span className="text-center text-[11px] text-muted-foreground">{index}</span>
        <span className="text-xs text-muted-foreground text-center">Supprimer la série {index} ?</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setConfirmDel(false)}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1"
          >
            Non
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-[10px] text-destructive font-semibold px-1"
          >
            Oui
          </button>
        </div>
      </li>
    );
  }

  // Placeholder textuel (poids ou reps précédent) si la cellule est vide.
  const repsPh = lastSet?.reps != null ? String(lastSet.reps) : "—";
  const weightPh = lastSet?.weight != null ? String(lastSet.weight) : "—";

  return (
    <li
      className={`grid grid-cols-[36px_1fr_1fr_1fr_32px] items-center divide-x divide-white/5 transition-colors ${isMax ? "bg-warning/5" : ""}`}
    >
      {/* # + trend */}
      <div className="flex items-center justify-center gap-0.5 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
          {index}
        </span>
        <TrendIcon trend={trend} />
      </div>

      {/* Reps */}
      <input
        type="number"
        inputMode="numeric"
        value={reps}
        placeholder={repsPh}
        onChange={(e) => setReps(e.target.value)}
        onBlur={(e) => onUpdate("reps", parse(e.target.value))}
        className={inputCls}
      />

      {/* Kg */}
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        value={weight}
        placeholder={weightPh}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={(e) => onUpdate("weight", parse(e.target.value))}
        className={inputCls}
      />

      {/* RPE */}
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        min="1"
        max="10"
        value={rpe}
        placeholder="—"
        onChange={(e) => setRpe(e.target.value)}
        onBlur={(e) => onUpdate("rpe", parse(e.target.value))}
        className={inputCls}
      />

      {/* Delete */}
      <button
        type="button"
        onClick={() => setConfirmDel(true)}
        className="flex h-full items-center justify-center text-muted-foreground/40 transition-colors hover:text-destructive"
        aria-label="Supprimer la série"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
  );
}

// ─── Exercise card ────────────────────────────────────────────────────────────

export function ActiveExerciseCard({
  exercise,
  workoutId,
  imageUrl,
  pr,
}: {
  exercise: ActiveExercise;
  workoutId: string;
  imageUrl: string | null;
  pr: number | null;
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

  const maxWeight =
    sortedSets.reduce<number | null>(
      (m, s) => (s.weight != null ? (m == null ? s.weight : Math.max(m, s.weight)) : m),
      null,
    );

  const volume = sortedSets.reduce(
    (acc, s) => acc + (s.reps ?? 0) * (s.weight ?? 0),
    0,
  );

  const isPR = maxWeight != null && pr != null && maxWeight >= pr;
  const isNewPR = maxWeight != null && pr != null && maxWeight > pr;

  // Résumé "dernière séance" : 1ʳᵉ série (ou plus lourd) du dernier passage.
  const lastSummary = useMemo(() => {
    const sets = lastSession?.sets ?? [];
    if (sets.length === 0) return null;
    const heaviest = sets.reduce<LastSessionSet>(
      (best, cur) => ((cur.weight ?? 0) > (best.weight ?? 0) ? cur : best),
      sets[0],
    );
    return heaviest;
  }, [lastSession]);

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
    restTimer.startForExercise(exercise.id);
  };

  // Réapplique les charges & reps de la dernière séance sur les séries
  // existantes (vides ou non) et crée les séries manquantes.
  const handleRestoreLastSession = async () => {
    const lastSets = lastSession?.sets ?? [];
    if (lastSets.length === 0) return;
    // Mise à jour des séries existantes
    for (const s of sortedSets) {
      const ref = lastSetsByNumber.get(s.set_number);
      if (!ref) continue;
      updateSet.mutate({ id: s.id, reps: ref.reps, weight: ref.weight });
    }
    // Ajout des séries manquantes
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

  const handleUpdate = (set: ActiveSet, field: "reps" | "weight" | "rpe", value: number | null) => {
    updateSet.mutate({ id: set.id, [field]: value });
    if (field !== "rpe" && value != null) {
      restTimer.startForExercise(exercise.id);
    }
  };

  const handleDeleteSet = (id: string) => {
    deleteSet.mutate(id);
  };

  const handleDeleteExercise = () => {
    deleteExercises.mutate([exercise.id]);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] shadow-sm">
      {/* ── Exercise header ── */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        {/* Image */}
        {imageUrl ? (
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10">
            <img
              src={imageUrl}
              alt={exercise.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary/70">
            <Dumbbell className="h-5 w-5" />
          </div>
        )}

        {/* Name + stats */}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-tight">{exercise.name}</h3>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>
              {sortedSets.length} série{sortedSets.length > 1 ? "s" : ""}
            </span>
            {maxWeight != null && <span>· max {maxWeight} kg</span>}
            {volume > 0 && (
              <span className="text-muted-foreground/50">
                · vol {volume >= 1000 ? `${(volume / 1000).toFixed(1)}k` : volume} kg
              </span>
            )}
          </div>

          {/* Dernière séance badge */}
          {lastSummary && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <History className="h-3 w-3" />
              Dernière séance : {lastSummary.weight ?? "—"} kg ×{" "}
              {lastSummary.reps ?? "—"}
            </span>
          )}

          {/* PR badge */}
          {isPR && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
              <Trophy className="h-3 w-3" />
              {isNewPR ? "Nouveau PR !" : `PR — ${pr} kg`}
            </span>
          )}
          {pr != null && !isPR && (
            <span className="mt-1 block text-[10px] text-muted-foreground/60">
              PR actuel : {pr} kg
            </span>
          )}
        </div>

        {/* Delete exercise */}
        <button
          type="button"
          onClick={() => setConfirmDeleteEx(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-destructive/10 hover:text-destructive"
          aria-label="Supprimer l'exercice"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* ── Confirmation suppression exercice ── */}
      {confirmDeleteEx && (
        <div className="mx-4 mb-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
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
              className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDeleteExercise}
              className="flex-1 rounded-lg bg-destructive py-1.5 text-xs font-semibold text-destructive-foreground"
            >
              Supprimer
            </button>
          </div>
        </div>
      )}

      {/* ── Bouton "Reprendre les charges précédentes" ── */}
      {lastSession && lastSession.sets.length > 0 && (
        <div className="mx-4 mb-2">
          <button
            type="button"
            onClick={handleRestoreLastSession}
            disabled={addSet.isPending || updateSet.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reprendre les charges précédentes
          </button>
        </div>
      )}

      {/* ── Sets table ── */}
      <div className="mx-4 mb-4 overflow-hidden rounded-xl border border-white/5 bg-black/20">
        {/* Table header */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_32px] border-b border-white/5 bg-white/[0.02] py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          <div className="text-center">#</div>
          <div className="text-center">Reps</div>
          <div className="text-center">Kg</div>
          <div className="text-center">RPE</div>
          <div />
        </div>

        {/* Set rows */}
        {sortedSets.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground/50">
            Aucune série — utilisez le bouton ci-dessous
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {sortedSets.map((s, idx) => (
              <SetRow
                key={s.id}
                set={s}
                index={idx + 1}
                isMax={s.weight != null && s.weight === maxWeight && maxWeight != null}
                lastSet={lastSetsByNumber.get(s.set_number) ?? lastSession?.sets[idx]}
                onUpdate={(field, value) => handleUpdate(s, field, value)}
                onDelete={() => handleDeleteSet(s.id)}
              />
            ))}
          </ul>
        )}

        {/* Add set */}
        <button
          type="button"
          onClick={handleAddSet}
          disabled={addSet.isPending}
          className="flex w-full items-center justify-center gap-1.5 border-t border-white/5 py-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter une série
        </button>
      </div>
    </div>
  );
}
