import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Camera,
  Check,
  ChevronDown,
  Dumbbell,
  History,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  Trophy,
  Zap,
} from "lucide-react";
import type { ActiveExercise, ActiveSet } from "@/hooks/use-fitness";
import {
  useAddExerciseSet,
  useUpdateExerciseSet,
  useDeleteExerciseSet,
  useDeleteExercises,
} from "@/hooks/use-fitness";
import { useUpsertExercisePhoto } from "@/hooks/useUserExercisePhotos";
import { restTimer } from "@/hooks/useRestTimer";
import type { LastSession, LastSessionSet } from "@/hooks/useLastExerciseSession";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import { exerciseToMuscles } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import { recommendLoad } from "@/lib/fitness/loadRecommendation";
import { estimate1RM } from "@/lib/fitness/strength";

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

// ─── Champ numérique tactile (kg / reps) ────────────────────────────────────

function StatField({
  value,
  onChange,
  onCommit,
  placeholder,
  unit,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  placeholder: string;
  unit: string;
  step?: string;
}) {
  return (
    <label className="flex h-12 flex-1 flex-col items-center justify-center rounded-[14px] bg-white/[0.05] transition-all focus-within:bg-primary/10 focus-within:ring-1 focus-within:ring-primary/40">
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
  onUpdate: (field: "reps" | "weight", value: number | null) => void;
  onToggleDone: (done: boolean) => void;
}) {
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : "");
  const [weight, setWeight] = useState(set.weight != null ? String(set.weight) : "");
  const [confirmDel, setConfirmDel] = useState(false);

  // #4 : resynchronise l'affichage si la donnée change hors saisie
  // (ex. "Reprendre les charges précédentes" met à jour reps/weight).
  useEffect(() => {
    setReps(set.reps != null ? String(set.reps) : "");
  }, [set.reps]);
  useEffect(() => {
    setWeight(set.weight != null ? String(set.weight) : "");
  }, [set.weight]);

  const parse = (v: string) => (v.trim() === "" ? null : Number(v));
  const trend = compareToLast({ reps: set.reps, weight: set.weight }, lastSet);
  const done = set.completed;

  const liveE1RM = useMemo(() => {
    const w = parseFloat(weight);
    const r = parseFloat(reps);
    if (!isFinite(w) || !isFinite(r) || w <= 0 || r <= 0) return null;
    return estimate1RM(w, r);
  }, [weight, reps]);

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

  const repsPh = lastSet?.reps != null ? String(lastSet.reps) : "";
  const weightPh = lastSet?.weight != null ? String(lastSet.weight) : "";

  return (
    <li
      className={`group flex items-center gap-1.5 rounded-2xl py-1 pl-1 pr-1 transition-colors ${
        done ? "bg-success/[0.07]" : isMax ? "bg-warning/[0.06]" : ""
      }`}
    >
      {/* Numéro (capsule) + 1RM live + tendance */}
      <div className="relative flex h-12 w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-white/[0.06]">
        <span
          className={`text-sm font-extrabold tabular-nums leading-none ${
            isMax ? "text-warning" : done ? "text-success" : "text-foreground"
          }`}
        >
          {index}
        </span>
        {liveE1RM != null && (
          <span className="text-[8px] font-medium leading-none tabular-nums text-primary/60">
            {Math.round(liveE1RM)}¹
          </span>
        )}
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
        className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground/25 transition-colors hover:text-destructive"
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
  imageUrl,
  lastSession,
  pr,
  recoveryMap,
  onOpenStats,
}: {
  exercise: ActiveExercise;
  imageUrl: string | null;
  lastSession: LastSession | null;
  pr: number | null;
  recoveryMap?: Map<MuscleId, MuscleRecovery>;
  onOpenStats?: () => void;
}) {
  const addSet = useAddExerciseSet();
  const updateSet = useUpdateExerciseSet();
  const deleteSet = useDeleteExerciseSet();
  const deleteExercises = useDeleteExercises();
  const upsertPhoto = useUpsertExercisePhoto();
  const fileRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteEx, setConfirmDeleteEx] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await upsertPhoto.mutateAsync({
      exerciseName: exercise.name,
      file,
      exerciseId: exercise.id,
    });
  };

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

  const doneCount = sortedSets.filter((s) => s.completed).length;

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

  const volLabel = volume >= 1000 ? `${(volume / 1000).toFixed(1)}k` : `${volume}`;

  // Muscles fatigués (status "fatigued") pour cet exercice
  const fatigued = useMemo(() => {
    if (!recoveryMap) return [];
    return exerciseToMuscles(exercise.name)
      .map((id) => recoveryMap.get(id))
      .filter((rec): rec is MuscleRecovery => rec != null && rec.status === "fatigued");
  }, [exercise.name, recoveryMap]);

  // Charge recommandée via RPE auto-régulation (Epley inverse)
  const suggestion = useMemo(() => {
    if (!lastSummary?.weight || !lastSummary?.reps) return null;
    let minFraction: number | null = null;
    if (recoveryMap) {
      for (const id of exerciseToMuscles(exercise.name)) {
        const rec = recoveryMap.get(id);
        if (rec?.hoursRemaining != null) {
          const f = Math.max(0, 1 - Math.max(0, rec.hoursRemaining) / rec.recoveryWindowHours);
          if (minFraction == null || f < minFraction) minFraction = f;
        }
      }
    }
    const result = recommendLoad({
      last: { weight: lastSummary.weight, reps: lastSummary.reps, rpe: null },
      targetReps: lastSummary.reps,
      targetRpe: 7,
      recoveryFraction: minFraction,
    });
    return result.weight;
  }, [lastSummary, recoveryMap, exercise.name]);

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
    field: "reps" | "weight",
    value: number | null,
  ) => {
    updateSet.mutate({ id: set.id, [field]: value });
  };

  const handleToggleDone = (set: ActiveSet, done: boolean) => {
    updateSet.mutate({ id: set.id, completed: done });
    if (done) {
      restTimer.startForExercise(exercise.id);
      try { navigator.vibrate?.(50); } catch {}
    }
  };

  const handleDeleteSet = (id: string) => deleteSet.mutate(id);
  const handleDeleteExercise = () => deleteExercises.mutate([exercise.id]);

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/5 bg-surface/80 p-4 shadow-[0_4px_24px_-12px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ── En-tête ── */}
      <div className="flex items-start gap-3">
        {/* Photo + bouton caméra overlay */}
        <div className="relative h-[72px] w-[72px] shrink-0">
          <button
            type="button"
            onClick={onOpenStats}
            aria-label="Voir la photo et les détails"
            className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-black/25 ring-1 ring-white/10 transition-opacity active:opacity-70"
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={exercise.name}
                className="h-full w-full object-contain"
                loading="lazy"
              />
            ) : (
              <Dumbbell className="h-7 w-7 text-primary/70" />
            )}
          </button>
          {/* Bouton ajout photo */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upsertPhoto.isPending}
            aria-label="Ajouter une photo"
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border shadow-sm text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            {upsertPhoto.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Camera className="h-3 w-3" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoFile}
          />
        </div>

        {/* Nom + stats → repli/dépli */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="min-w-0 flex-1 pt-0.5 text-left"
        >
          <div className="flex items-start gap-1.5">
            <h3 className="line-clamp-2 flex-1 text-[17px] font-semibold leading-tight tracking-tight">
              {exercise.name}
            </h3>
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 ${
                collapsed ? "" : "rotate-180"
              }`}
            />
          </div>

          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="tabular-nums">
              {sortedSets.length} série{sortedSets.length > 1 ? "s" : ""}
              {doneCount > 0 && (
                <span className="text-success"> ({doneCount}✓)</span>
              )}
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
            {fatigued.map((rec) => (
              <span
                key={rec.id}
                className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-400"
                title={`${rec.label} peu récupéré — ${rec.hoursRemaining != null ? Math.round(rec.hoursRemaining) + "h restantes" : ""}`}
              >
                ⚠ {rec.label}
              </span>
            ))}
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

      {/* ── Contenu repliable ── */}
      {!collapsed && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Reprendre les charges précédentes */}
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

          {/* Charge recommandée (RPE auto-régulation) */}
          {suggestion != null && (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-primary/[0.07] px-3 py-2 text-[12px]">
              <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="text-muted-foreground">Suggéré :</span>
              <span className="font-bold text-primary">{suggestion} kg</span>
              <span className="text-muted-foreground/60">× {lastSummary?.reps} reps · RPE 7</span>
            </div>
          )}

          {/* Séries */}
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
      )}
    </div>
  );
}
