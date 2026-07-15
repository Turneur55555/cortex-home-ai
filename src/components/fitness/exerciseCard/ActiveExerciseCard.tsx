// ============================================================
// Carte exercice UNIQUE, en séance active — pour TOUTES les disciplines.
// Phase B (2026-07-15, retour de Nathan) : il ne doit plus exister
// plusieurs composants de haut niveau nommés par discipline
// (ActiveCourseExerciseCard, "ActiveMusculationExerciseCard"...). Un seul
// export, `ActiveExerciseCard`, appelé par ActiveWorkoutView.tsx
// (musculation) et ActiveGenericSessionView.tsx (les 5 autres
// disciplines) — voir docs/architecture/phase-b-carte-exercice-unique.md.
//
// En interne, `kind` sépare le rendu des lignes de répétition pour une
// raison structurelle, pas une préférence de code : la ligne musculation
// (poids/répétitions) porte une logique métier profonde sans équivalent
// déclaré ailleurs (1RM live, tendance vs dernière séance, PR, suggestion
// de charge liée à la récupération musculaire, photo d'exercice) — voir
// le document de phase pour la décision explicite de ne pas fusionner
// cette logique dans un système de capacités générique cette fois-ci.
// La ligne générique (ActiveSegmentCard) reste, elle, déjà 100% pilotée
// par configuration (SEGMENT_METRIC_CONFIG, segmentStats.ts) : c'est elle
// qui porte concrètement le principe "les métriques sont déclarées par la
// discipline" pour toute discipline hors musculation.
//
// Le conteneur, l'en-tête repliable, le bouton d'ajout et la confirmation
// de suppression — c'est-à-dire l'architecture au sens où Nathan
// l'entend — sont eux strictement partagés via ExerciseCardPrimitives,
// et le sont déjà depuis la Phase A (rien de nouveau à ce niveau, juste
// consolidé sous un seul nom désormais).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  History,
  Minus,
  RotateCcw,
  Repeat,
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
import type { ActiveGenericSegment } from "@/hooks/useGenericActiveSession";
import {
  useAddGenericSegment,
  useDeleteGenericSegment,
  useReorderGenericSegment,
  useUpdateGenericSegment,
} from "@/hooks/useGenericActiveSession";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import type { LabelGroup } from "@/lib/fitness/segmentStats";
import { ActiveSegmentCard } from "../session/ActiveSegmentCard";
import {
  ExerciseCardConfirmDelete,
  ExerciseCardContainer,
  ExerciseCardHeader,
  ExerciseCardIconButton,
  ExerciseCardPillButton,
  ExerciseCardSetIndex,
  ExerciseCardSetRow,
  ExerciseCardStatField,
  ExercisePhotoTile,
} from "./ExerciseCardPrimitives";

// ─── Props publiques : un seul composant, discriminé par discipline ────────

type MuscuCardProps = {
  kind: "muscu";
  exercise: ActiveExercise;
  imageUrl: string | null;
  lastSession: LastSession | null;
  pr: number | null;
  recoveryMap?: Map<MuscleId, MuscleRecovery>;
  onOpenStats?: () => void;
};

type GenericCardProps = {
  kind: "generic";
  group: LabelGroup<ActiveGenericSegment>;
  workoutId: string;
  /** Discipline de la séance active (résolution exercise_id, voir
   *  services/exerciseResolution.ts). */
  discipline: DisciplineId;
  /** Position à utiliser pour une nouvelle répétition ajoutée à ce
   *  groupe — les positions sont globales à la séance. */
  nextPosition: number;
  onOpenStats: (rawLabel: string) => void;
};

export function ActiveExerciseCard(props: MuscuCardProps | GenericCardProps) {
  if (props.kind === "muscu") return <MuscuExerciseCard {...props} />;
  return <GenericExerciseCard {...props} />;
}

// ─── Branche musculation ─────────────────────────────────────────────────────

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
  if (trend === "up") return <ArrowUp className="h-3 w-3 text-success" aria-label="Progression" />;
  if (trend === "down")
    return <ArrowDown className="h-3 w-3 text-destructive" aria-label="Régression" />;
  return <Minus className="h-3 w-3 text-muted-foreground/50" aria-label="Identique" />;
}

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
    <ExerciseCardSetRow tone={done ? "success" : isMax ? "warning" : null}>
      <ExerciseCardSetIndex>
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
      </ExerciseCardSetIndex>

      <ExerciseCardStatField
        value={weight}
        onChange={setWeight}
        onCommit={(v) => onUpdate("weight", parse(v))}
        placeholder={weightPh}
        unit="kg"
        step="0.5"
      />

      <ExerciseCardStatField
        value={reps}
        onChange={setReps}
        onCommit={(v) => onUpdate("reps", parse(v))}
        placeholder={repsPh}
        unit="reps"
      />

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

      <button
        type="button"
        onClick={() => setConfirmDel(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground/25 transition-colors hover:text-destructive"
        aria-label="Supprimer la série"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </ExerciseCardSetRow>
  );
}

function MuscuExerciseCard({
  exercise,
  imageUrl,
  lastSession,
  pr,
  recoveryMap,
  onOpenStats,
}: Omit<MuscuCardProps, "kind">) {
  const addSet = useAddExerciseSet();
  const updateSet = useUpdateExerciseSet();
  const deleteSet = useDeleteExerciseSet();
  const deleteExercises = useDeleteExercises();
  const upsertPhoto = useUpsertExercisePhoto();

  const [confirmDeleteEx, setConfirmDeleteEx] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handlePhotoFile = (file: File) => {
    upsertPhoto.mutate({ exerciseName: exercise.name, file, exerciseId: exercise.id });
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

  const volume = sortedSets.reduce((acc, s) => acc + (s.reps ?? 0) * (s.weight ?? 0), 0);

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

  const fatigued = useMemo(() => {
    if (!recoveryMap) return [];
    return exerciseToMuscles(exercise.name)
      .map((id) => recoveryMap.get(id))
      .filter((rec): rec is MuscleRecovery => rec != null && rec.status === "fatigued");
  }, [exercise.name, recoveryMap]);

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
      last: { weight: lastSummary.weight, reps: lastSummary.reps },
      recoveryFraction: minFraction,
    });
    if (result.weight == null || !result.recoveryLimited) return null;
    return result.weight;
  }, [lastSummary, recoveryMap, exercise.name]);

  const [isBusy, setIsBusy] = useState(false);

  const handleAddSet = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const last = sortedSets[sortedSets.length - 1];
      const nextNumber = sortedSets.reduce((m, st) => Math.max(m, st.set_number), 0) + 1;
      const fallback = lastSetsByNumber.get(sortedSets.length + 1) ?? lastSession?.sets[0];
      await addSet.mutateAsync({
        exerciseId: exercise.id,
        setNumber: nextNumber,
        reps: last?.reps ?? fallback?.reps ?? null,
        weight: last?.weight ?? fallback?.weight ?? null,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestoreLastSession = async () => {
    if (isBusy) return;
    const lastSets = lastSession?.sets ?? [];
    if (lastSets.length === 0) return;
    setIsBusy(true);
    try {
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
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdate = (set: ActiveSet, field: "reps" | "weight", value: number | null) => {
    updateSet.mutate({ id: set.id, [field]: value });
  };

  const handleToggleDone = (set: ActiveSet, done: boolean) => {
    updateSet.mutate({ id: set.id, completed: done });
    if (done) {
      restTimer.startForExercise(exercise.id);
      try {
        navigator.vibrate?.(50);
      } catch {
        // Vibration API non supportée — dégradation silencieuse, sans impact fonctionnel.
      }
    }
  };

  const handleDeleteSet = (id: string) => deleteSet.mutate(id);
  const handleDeleteExercise = () => deleteExercises.mutate([exercise.id]);

  const metaLine = (
    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className="tabular-nums">
        {sortedSets.length} série{sortedSets.length > 1 ? "s" : ""}
        {doneCount > 0 && <span className="text-success"> ({doneCount}✓)</span>}
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
  );

  const badges = (
    <>
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
    </>
  );

  return (
    <ExerciseCardContainer>
      <ExerciseCardHeader
        photo={
          <ExercisePhotoTile
            imageUrl={imageUrl}
            name={exercise.name}
            onOpenPreview={onOpenStats}
            onPickPhoto={handlePhotoFile}
            uploading={upsertPhoto.isPending}
          />
        }
        title={exercise.name}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        metaLine={metaLine}
        badges={badges}
        actions={
          <>
            <ExerciseCardIconButton
              icon={BarChart3}
              onClick={() => onOpenStats?.()}
              label="Statistiques de l'exercice"
            />
            <ExerciseCardIconButton
              icon={Trash2}
              onClick={() => setConfirmDeleteEx(true)}
              label="Supprimer l'exercice"
              variant="destructive"
            />
          </>
        }
      />

      {confirmDeleteEx && (
        <ExerciseCardConfirmDelete
          label={`Supprimer « ${exercise.name} » ?`}
          detail="Toutes les séries associées seront supprimées."
          onCancel={() => setConfirmDeleteEx(false)}
          onConfirm={handleDeleteExercise}
        />
      )}

      {!collapsed && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {lastSession && lastSession.sets.length > 0 && (
            <button
              type="button"
              onClick={handleRestoreLastSession}
              disabled={isBusy}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/[0.07] py-2.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/[0.12] disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reprendre les charges précédentes
            </button>
          )}

          {suggestion != null && (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-primary/[0.07] px-3 py-2 text-[12px]">
              <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="text-muted-foreground">Suggéré :</span>
              <span className="font-bold text-primary">{suggestion} kg</span>
              <span className="text-muted-foreground/60">
                × {lastSummary?.reps} reps · récup. incomplète
              </span>
            </div>
          )}

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

            <ExerciseCardPillButton
              label="Ajouter une série"
              onClick={handleAddSet}
              disabled={isBusy}
            />
          </div>
        </div>
      )}
    </ExerciseCardContainer>
  );
}

// ─── Branche générique (toutes les disciplines hors musculation) ───────────

function GenericExerciseCard({
  group,
  workoutId,
  discipline,
  nextPosition,
  onOpenStats,
}: Omit<GenericCardProps, "kind">) {
  const updateSegment = useUpdateGenericSegment();
  const deleteSegment = useDeleteGenericSegment();
  const reorderSegment = useReorderGenericSegment();
  const addSegment = useAddGenericSegment();

  const [collapsed, setCollapsed] = useState(false);

  const doneCount = group.instances.filter((s) => s.completed).length;
  const knownKeys = Array.from(new Set(group.instances.flatMap((s) => Object.keys(s.metrics))));

  const handleAddRep = () => {
    addSegment.mutate({
      workoutId,
      label: group.displayLabel,
      metrics: {},
      metricKey: group.instances[0]?.metricKey ?? undefined,
      position: nextPosition,
      discipline,
    });
  };

  return (
    <ExerciseCardContainer>
      <ExerciseCardHeader
        photo={
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl bg-black/25 ring-1 ring-white/10">
            <Repeat className="h-6 w-6 text-primary/70" />
          </div>
        }
        title={group.displayLabel}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        metaLine={
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="tabular-nums">
              {group.instances.length} répétition{group.instances.length > 1 ? "s" : ""}
              {doneCount > 0 && <span className="text-success"> ({doneCount}✓)</span>}
            </span>
          </div>
        }
        actions={
          <ExerciseCardIconButton
            icon={BarChart3}
            onClick={() => onOpenStats(group.instances[0].label)}
            label="Statistiques de l'exercice"
          />
        }
      />

      {!collapsed && (
        <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <ul className="flex flex-col gap-2">
            {group.instances.map((segment, i) => (
              <ActiveSegmentCard
                key={segment.id}
                segment={segment}
                knownKeys={knownKeys}
                isFirst={i === 0}
                isLast={i === group.instances.length - 1}
                onUpdate={(fields) => updateSegment.mutate({ id: segment.id, ...fields })}
                onDelete={() => deleteSegment.mutate(segment.id)}
                onMoveUp={() =>
                  reorderSegment.mutate({
                    segments: group.instances,
                    id: segment.id,
                    direction: "up",
                  })
                }
                onMoveDown={() =>
                  reorderSegment.mutate({
                    segments: group.instances,
                    id: segment.id,
                    direction: "down",
                  })
                }
              />
            ))}
          </ul>

          <ExerciseCardPillButton
            label="Ajouter une répétition"
            onClick={handleAddRep}
            disabled={addSegment.isPending}
          />
        </div>
      )}
    </ExerciseCardContainer>
  );
}
