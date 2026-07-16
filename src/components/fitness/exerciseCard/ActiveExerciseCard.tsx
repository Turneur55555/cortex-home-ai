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
  ArrowRight,
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  History,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Repeat,
  Trash2,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
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
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import {
  bestMetricValue,
  primaryColumnsForInstances,
  SEGMENT_METRIC_CONFIG,
  type LabelGroup,
} from "@/lib/fitness/segmentStats";
import { useDisciplineSegmentHistory } from "@/hooks/useDisciplineSegmentHistory";
import {
  ActiveSegmentCard,
  inputUnit,
  metricLabel,
  parseMetricInput,
  toDisplayString,
} from "../session/ActiveSegmentCard";
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
  const [confirmDeleteEx, setConfirmDeleteEx] = useState(false);

  const doneCount = group.instances.filter((s) => s.completed).length;
  // Lot V4 — le modèle métier de la répétition appartient à la discipline :
  // les champs proposés = clés déclarées par le moteur pour CET exercice
  // (repMetricKeysFor — un bloc Rameur expose distance/temps/allure/watts/
  // cadence/FC même vide, un Sled Push charge+distance...) ∪ clés déjà
  // saisies (rien n'est jamais perdu). Plus aucune répétition générique.
  const engineRepKeys = useMemo(() => {
    const entry = ENGINE_REGISTRY[discipline];
    return entry?.repMetricKeysFor?.(group.displayLabel) ?? [];
  }, [discipline, group.displayLabel]);
  const knownKeys = Array.from(
    new Set([...engineRepKeys, ...group.instances.flatMap((s) => Object.keys(s.metrics))]),
  );

  // Lot V5 (2026-07-16, "Premium Experience — Marche inclinée") : les
  // activités dont l'unité métier est LE KILOMÈTRE (marche inclinée,
  // tapis) ne se présentent plus comme une liste de répétitions mais
  // comme un VOYAGE — Km terminés ✓ / Km en cours ● / Km à venir ○ sur un
  // rail de progression, kilomètre courant en héros, validation-
  // récompense. Détection 100% présentation (mêmes données, mêmes
  // mutations, mêmes moteurs — rien d'autre ne change).
  const isKmJourney = discipline === "cardio" && /marche|tapis|treadmill/i.test(group.displayLabel);
  // Lot V6 (Tapis de course) : même voyage, identités distinctes — sur
  // tapis la FC fait partie du récit du kilomètre et l'inclinaison n'est
  // qu'un réglage secondaire, à l'inverse de la marche inclinée où
  // l'inclinaison EST l'exercice. `/marche/` prioritaire : "Marche sur
  // tapis" reste une marche (même règle que REP_MODELS, cardioEngine).
  const kmJourneyFlavor: "marche" | "tapis" = /marche/i.test(group.displayLabel)
    ? "marche"
    : "tapis";

  // Addendum 3 (2026-07-15, audit convergence UX) : badge "Nouveau record"
  // générique — pendant du badge Trophy de MuscuExerciseCard (isPR/isNewPR),
  // sans toucher au moteur de Rang/PR musculation (invariant 9.9, hors
  // scope). Historique = séances PASSÉES uniquement (la séance active n'est
  // pas encore sauvegardée) via le même hook que SegmentAnalysisSheet.
  const numericInstances = group.instances.map((s) => ({
    metrics: Object.fromEntries(
      Object.entries(s.metrics).filter((e): e is [string, number] => typeof e[1] === "number"),
    ),
  }));
  const primaryColumn = primaryColumnsForInstances(numericInstances)[0] ?? null;
  const { data: historyInstances } = useDisciplineSegmentHistory(discipline, group.displayLabel);
  const currentBest = primaryColumn ? bestMetricValue(numericInstances, primaryColumn.key) : null;
  const historicalBest =
    primaryColumn && historyInstances ? bestMetricValue(historyInstances, primaryColumn.key) : null;
  const isRecord =
    primaryColumn != null &&
    currentBest != null &&
    (historicalBest == null ||
      (SEGMENT_METRIC_CONFIG[primaryColumn.key].direction === "min"
        ? currentBest.value <= historicalBest.value
        : currentBest.value >= historicalBest.value));
  const isNewRecord =
    isRecord && historicalBest != null && currentBest!.value !== historicalBest.value;

  // Lot V3 — le duel : répétitions de la DERNIÈRE séance passée de cet
  // exercice (même hook/cache que le badge Record, aucune requête en plus).
  // Alimente le badge "Dernière fois", les placeholders/tendances des
  // lignes, et "Reprendre les valeurs précédentes" — pendant exact de
  // `lastSession` côté musculation, dans le vocabulaire de la discipline.
  const lastSession = useMemo(() => {
    const insts = historyInstances ?? [];
    if (insts.length === 0) return null;
    const byWorkout = new Map<string, { date: string; reps: typeof insts }>();
    for (const inst of insts) {
      const entry = byWorkout.get(inst.workoutId);
      if (entry) entry.reps.push(inst);
      else byWorkout.set(inst.workoutId, { date: inst.date, reps: [inst] });
    }
    let latest: { date: string; reps: typeof insts } | null = null;
    for (const entry of byWorkout.values()) {
      if (!latest || entry.date > latest.date) latest = entry;
    }
    return latest;
  }, [historyInstances]);

  const lastSummary = useMemo(() => {
    if (!lastSession) return null;
    const cols = primaryColumnsForInstances(lastSession.reps).slice(0, 2);
    const parts = cols
      .map((col) => bestMetricValue(lastSession.reps, col.key)?.formatted)
      .filter((f): f is string => !!f);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [lastSession]);

  const isBusy = addSegment.isPending || updateSegment.isPending;

  const handleAddRep = () => {
    if (isBusy) return;
    // Valeurs de départ, même cascade que handleAddSet muscu : d'abord la
    // DERNIÈRE répétition de la séance en cours (ajouter le Km 3 reprend
    // vitesse/inclinaison du Km 2 — "l'utilisateur ajoute simplement un
    // nouveau kilomètre", lot V4.1), sinon la répétition suivante de la
    // dernière séance passée, sinon champs vides — jamais inventé.
    const currentLast = group.instances[group.instances.length - 1];
    const ref = lastSession?.reps[group.instances.length];
    addSegment.mutate({
      workoutId,
      label: group.displayLabel,
      metrics:
        currentLast && Object.keys(currentLast.metrics).length > 0
          ? { ...currentLast.metrics }
          : ref
            ? { ...ref.metrics }
            : {},
      metricKey: group.instances[0]?.metricKey ?? undefined,
      position: nextPosition,
      discipline,
    });
  };

  // "Reprendre les valeurs précédentes" — pendant exact du bouton muscu :
  // recopie rang par rang les métriques de la dernière séance, crée les
  // répétitions manquantes. Mutations existantes uniquement.
  const handleRestoreLastSession = async () => {
    if (isBusy || !lastSession) return;
    const refs = lastSession.reps;
    group.instances.forEach((segment, i) => {
      const ref = refs[i];
      if (!ref) return;
      updateSegment.mutate({ id: segment.id, metrics: { ...ref.metrics } });
    });
    for (let i = group.instances.length; i < refs.length; i++) {
      await addSegment.mutateAsync({
        workoutId,
        label: group.displayLabel,
        metrics: { ...refs[i].metrics },
        metricKey: group.instances[0]?.metricKey ?? undefined,
        position: nextPosition + (i - group.instances.length),
        discipline,
      });
    }
  };

  // Validation d'une répétition : mêmes retours que la série muscu —
  // vibration, et minuteur de repos quand l'exercice a plusieurs
  // répétitions (fractionné/circuits ; jamais pour un bloc unique type
  // Rameur 2000m, où un repos automatique n'aurait aucun sens).
  const handleUpdateRep = (
    segment: ActiveGenericSegment,
    fields: {
      label?: string;
      metrics?: Record<string, number | string>;
      completed?: boolean;
    },
  ) => {
    updateSegment.mutate({ id: segment.id, ...fields });
    if (fields.completed) {
      // Pas de minuteur de repos entre deux kilomètres (lot V5) : la
      // marche/le tapis est un effort CONTINU — un repos automatique par
      // km n'a aucun sens, contrairement aux intervalles/circuits.
      if (group.instances.length > 1 && !isKmJourney) restTimer.startForExercise(group.key);
      try {
        navigator.vibrate?.(50);
      } catch {
        // Vibration API non supportée — dégradation silencieuse.
      }
    }
  };

  const handleDeleteExercise = () => {
    for (const segment of group.instances) deleteSegment.mutate(segment.id);
  };

  const recordBadge = isRecord && (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
      <Trophy className="h-3 w-3" />
      {isNewRecord ? "Nouveau record" : `Record ${currentBest!.formatted}`}
    </span>
  );

  const badges = (
    <>
      {recordBadge}
      {lastSummary && (
        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <History className="h-3 w-3" />
          {lastSummary}
        </span>
      )}
    </>
  );

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
          isKmJourney ? (
            // Lot V5 — la progression est le personnage principal : le
            // compteur de kilomètres raconte la séance, pas un compte de
            // "répétitions".
            <div className="mt-1.5 flex items-center gap-1.5 text-[12px]">
              <span
                key={doneCount}
                className="font-bold tabular-nums text-foreground animate-in zoom-in-75 duration-300"
              >
                {doneCount > 0
                  ? `${doneCount} km au compteur`
                  : "Le tapis t'attend — Km 1 à valider"}
              </span>
              {doneCount > 0 && group.instances.some((s) => !s.completed) && (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="text-muted-foreground">
                    Km {group.instances.findIndex((s) => !s.completed) + 1} en cours
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="tabular-nums">
                {group.instances.length} répétition{group.instances.length > 1 ? "s" : ""}
                {doneCount > 0 && <span className="text-success"> ({doneCount}✓)</span>}
              </span>
              {currentBest && (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="tabular-nums">{currentBest.formatted}</span>
                </>
              )}
            </div>
          )
        }
        badges={badges}
        actions={
          <>
            <ExerciseCardIconButton
              icon={BarChart3}
              onClick={() => onOpenStats(group.instances[0].label)}
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
          label={`Supprimer « ${group.displayLabel} » ?`}
          detail="Toutes les répétitions associées seront supprimées."
          onCancel={() => setConfirmDeleteEx(false)}
          onConfirm={handleDeleteExercise}
        />
      )}

      {!collapsed && (
        <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {lastSession && lastSession.reps.length > 0 && (
            <button
              type="button"
              onClick={handleRestoreLastSession}
              disabled={isBusy}
              className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/[0.07] py-2.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/[0.12] disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reprendre les valeurs précédentes
            </button>
          )}

          {isKmJourney ? (
            <KmJourneyBody
              instances={group.instances}
              lastReps={lastSession?.reps ?? []}
              knownKeys={knownKeys}
              flavor={kmJourneyFlavor}
              onUpdateRep={handleUpdateRep}
              onDeleteRep={(segment) => deleteSegment.mutate(segment.id)}
              onMoveUp={(segment) =>
                reorderSegment.mutate({
                  segments: group.instances,
                  id: segment.id,
                  direction: "up",
                })
              }
              onMoveDown={(segment) =>
                reorderSegment.mutate({
                  segments: group.instances,
                  id: segment.id,
                  direction: "down",
                })
              }
              onAddKm={handleAddRep}
              addPending={addSegment.isPending}
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {group.instances.map((segment, i) => (
                  <ActiveSegmentCard
                    key={segment.id}
                    segment={segment}
                    knownKeys={knownKeys}
                    index={i + 1}
                    lastRepMetrics={lastSession?.reps[i]?.metrics ?? null}
                    isFirst={i === 0}
                    isLast={i === group.instances.length - 1}
                    onUpdate={(fields) => handleUpdateRep(segment, fields)}
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
            </>
          )}
        </div>
      )}
    </ExerciseCardContainer>
  );
}

// ─── Lot V5 — Le voyage kilomètre (Marche inclinée / Tapis) ─────────────────
// La séance ne se lit plus comme un formulaire mais comme un chemin :
// Km terminés ✓ (lignes compactes, célébrées), Km en cours ● (carte héros,
// grands champs, bouton "Valider le kilomètre"), Km à venir ○ (fantômes),
// reliés par un rail de progression vertical. Mêmes données, mêmes
// mutations, mêmes moteurs — uniquement l'expérience.

type KmJourneyProps = {
  instances: ActiveGenericSegment[];
  lastReps: Array<{ metrics: Record<string, number | string> }>;
  knownKeys: string[];
  flavor: "marche" | "tapis";
  onUpdateRep: (
    segment: ActiveGenericSegment,
    fields: { metrics?: Record<string, number | string>; completed?: boolean },
  ) => void;
  onDeleteRep: (segment: ActiveGenericSegment) => void;
  onMoveUp: (segment: ActiveGenericSegment) => void;
  onMoveDown: (segment: ActiveGenericSegment) => void;
  onAddKm: () => void;
  addPending: boolean;
};

function KmJourneyBody({
  instances,
  lastReps,
  knownKeys,
  flavor,
  onUpdateRep,
  onDeleteRep,
  onMoveUp,
  onMoveDown,
  onAddKm,
  addPending,
}: KmJourneyProps) {
  // Le kilomètre "focalisé" : par défaut le premier non terminé (le Km en
  // cours) ; taper un Km terminé/à venir le rouvre en héros pour l'éditer.
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const firstOpenIdx = instances.findIndex((s) => !s.completed);
  const doneCount = instances.filter((s) => s.completed).length;
  const allDone = firstOpenIdx === -1;

  const orderedKeys = [...knownKeys].sort(
    (a, b) => (SEGMENT_METRIC_CONFIG[a]?.order ?? 99) - (SEGMENT_METRIC_CONFIG[b]?.order ?? 99),
  );
  // SEGMENT_METRIC_CONFIG est GLOBALE à toutes les disciplines (incline_pct
  // promue primary pour l'identité Marche inclinée, FC volontairement
  // secondary partout) — le voyage tapis ajuste donc LOCALEMENT, sans
  // toucher la table : la FC entre dans le récit du kilomètre (héros +
  // résumé "✓ Km 1"), l'inclinaison redescend en réglage secondaire.
  const promoted = flavor === "tapis" ? ["heart_rate_bpm"] : [];
  const demoted = flavor === "tapis" ? ["incline_pct"] : [];
  const primaryKeys = orderedKeys.filter(
    (k) =>
      !demoted.includes(k) &&
      (promoted.includes(k) || SEGMENT_METRIC_CONFIG[k]?.importance === "primary"),
  );
  const secondaryKeys = orderedKeys.filter((k) => !primaryKeys.includes(k));

  const summaryFor = (segment: ActiveGenericSegment) =>
    primaryKeys
      .map((k) => {
        const v = segment.metrics[k];
        return typeof v === "number" ? SEGMENT_METRIC_CONFIG[k].format(v) : null;
      })
      .filter((s): s is string => s !== null)
      .join(" · ");

  const handleValidate = (segment: ActiveGenericSegment, index: number) => {
    onUpdateRep(segment, { completed: true });
    setFocusedId(null);
    // La récompense : chaque kilomètre validé fait avancer l'histoire.
    toast.success(`Km ${index} terminé 💪`, {
      description: `${doneCount + 1} km au compteur — le Km ${instances.length === index ? index + 1 : index + 1} t'attend.`,
    });
  };

  return (
    <div className="relative">
      {/* Rail de progression — le chemin parcouru relie les kilomètres. */}
      <div
        aria-hidden
        className="absolute bottom-16 left-[13px] top-2 w-[2px] rounded-full bg-white/[0.07]"
      />

      <ol className="flex flex-col gap-1.5">
        {instances.map((segment, i) => {
          const isCurrent = i === firstOpenIdx;
          const isFocused = focusedId ? focusedId === segment.id : isCurrent;

          if (isFocused) {
            return (
              <KmHeroCard
                key={segment.id}
                segment={segment}
                index={i + 1}
                dismissable={!isCurrent}
                lastMetrics={lastReps[i]?.metrics ?? null}
                primaryKeys={primaryKeys}
                secondaryKeys={secondaryKeys}
                isFirst={i === 0}
                isLast={i === instances.length - 1}
                onUpdate={(fields) => onUpdateRep(segment, fields)}
                onValidate={() => handleValidate(segment, i + 1)}
                onDelete={() => {
                  setFocusedId(null);
                  onDeleteRep(segment);
                }}
                onMoveUp={() => onMoveUp(segment)}
                onMoveDown={() => onMoveDown(segment)}
                onClose={() => setFocusedId(null)}
              />
            );
          }

          if (segment.completed) {
            const summary = summaryFor(segment);
            return (
              <li
                key={segment.id}
                className="animate-in fade-in slide-in-from-bottom-1 duration-300"
              >
                <button
                  type="button"
                  onClick={() => setFocusedId(segment.id)}
                  className="group/km flex w-full items-center gap-3 rounded-2xl py-2 pl-0.5 pr-2 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span className="z-[1] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-success text-success-foreground shadow-[0_0_0_4px_rgba(34,197,94,0.14)] animate-in zoom-in-50 duration-300">
                    <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[13px] font-bold">Km {i + 1}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-success/90">
                        terminé
                      </span>
                    </span>
                    {summary && (
                      <span className="block truncate text-[12px] tabular-nums text-muted-foreground">
                        {summary}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-transform group-hover/km:translate-x-0.5" />
                </button>
              </li>
            );
          }

          return (
            <li key={segment.id} className="animate-in fade-in duration-300">
              <button
                type="button"
                onClick={() => setFocusedId(segment.id)}
                className="flex w-full items-center gap-3 rounded-2xl py-2 pl-0.5 pr-2 text-left opacity-55 transition-opacity hover:opacity-100"
              >
                <span className="z-[1] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 border-dashed border-white/20 bg-surface text-[11px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-[13px] font-semibold text-muted-foreground">
                  Km {i + 1} · à venir
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Le prochain kilomètre — CTA principal quand tout est validé
          (l'invitation à continuer), discret sinon. Reprend automatiquement
          les valeurs du kilomètre précédent (voir handleAddRep). */}
      <button
        type="button"
        onClick={onAddKm}
        disabled={addPending}
        className={
          allDone
            ? "mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3.5 text-sm font-bold text-primary-foreground shadow-glow transition-transform active:scale-[0.98] disabled:opacity-50"
            : "mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
        }
      >
        {addPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : allDone ? (
          <>
            Commencer le Km {instances.length + 1}
            <ArrowRight className="h-4 w-4" />
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Préparer le Km {instances.length + 1}
          </>
        )}
      </button>
    </div>
  );
}

function KmHeroCard({
  segment,
  index,
  dismissable,
  lastMetrics,
  primaryKeys,
  secondaryKeys,
  isFirst,
  isLast,
  onUpdate,
  onValidate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onClose,
}: {
  segment: ActiveGenericSegment;
  index: number;
  dismissable: boolean;
  lastMetrics: Record<string, number | string> | null;
  primaryKeys: string[];
  secondaryKeys: string[];
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (fields: { metrics?: Record<string, number | string>; completed?: boolean }) => void;
  onValidate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onClose: () => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of [...primaryKeys, ...secondaryKeys]) {
      initial[key] = toDisplayString(key, segment.metrics[key]);
    }
    return initial;
  });
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    setInputs((prev) => {
      const next = { ...prev };
      for (const key of [...primaryKeys, ...secondaryKeys]) {
        next[key] = toDisplayString(key, segment.metrics[key]);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment.metrics]);

  const commit = (key: string, raw: string) => {
    const stored = parseMetricInput(key, raw);
    if (stored === null) return;
    onUpdate({ metrics: { ...segment.metrics, [key]: stored } });
  };

  return (
    <li className="relative animate-in fade-in zoom-in-95 duration-300">
      {/* Nœud du rail — pulse tant que le kilomètre est en cours. */}
      <span className="absolute left-0 top-6 z-[1] flex h-[26px] w-[26px] items-center justify-center">
        {!segment.completed && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-25" />
        )}
        <span
          className={`relative flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-extrabold ${
            segment.completed
              ? "bg-success text-success-foreground"
              : "bg-primary text-primary-foreground shadow-glow"
          }`}
        >
          {segment.completed ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : index}
        </span>
      </span>

      <div className="ml-9 rounded-3xl border border-primary/20 bg-gradient-to-b from-primary/[0.09] to-primary/[0.02] p-4 shadow-[0_10px_36px_-16px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-extrabold tracking-tight">Km {index}</span>
            {segment.completed ? (
              <span className="text-[9px] font-bold uppercase tracking-widest text-success">
                terminé
              </span>
            ) : (
              <span className="text-[9px] font-bold uppercase tracking-widest text-primary">
                en cours
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 text-muted-foreground/40">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              aria-label="Monter"
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-foreground disabled:opacity-25"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              aria-label="Descendre"
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-foreground disabled:opacity-25"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              aria-label="Supprimer ce kilomètre"
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {dismissable && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Refermer"
                className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {confirmDel ? (
          <div className="mt-3 rounded-2xl bg-destructive/10 p-3 animate-in fade-in zoom-in-95 duration-150">
            <p className="text-xs font-semibold text-destructive">Supprimer le Km {index} ?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDel(false)}
                className="flex-1 rounded-xl border border-border py-1.5 text-xs font-medium"
              >
                Garder
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex-1 rounded-xl bg-destructive/20 py-1.5 text-xs font-bold text-destructive"
              >
                Supprimer
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Les grands cadrans — une saisie, pas un formulaire. */}
            <div className="mt-3 flex gap-2">
              {primaryKeys.map((key) => (
                <label
                  key={key}
                  className="flex h-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl bg-black/25 ring-1 ring-white/10 transition-all focus-within:bg-primary/10 focus-within:ring-primary/50"
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={inputs[key] ?? ""}
                    placeholder={toDisplayString(key, lastMetrics?.[key]) || "—"}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                    onBlur={() => commit(key, inputs[key] ?? "")}
                    className="w-full bg-transparent text-center text-[26px] font-extrabold leading-none tabular-nums outline-none placeholder:text-muted-foreground/20"
                  />
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/55">
                    {metricLabel(key)} · {inputUnit(key)}
                  </span>
                </label>
              ))}
            </div>

            {secondaryKeys.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {secondaryKeys.map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70"
                  >
                    {metricLabel(key)}
                    <input
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={inputs[key] ?? ""}
                      placeholder={toDisplayString(key, lastMetrics?.[key])}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                      onBlur={() => commit(key, inputs[key] ?? "")}
                      className="w-14 rounded-lg border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/30 focus:border-primary"
                    />
                  </label>
                ))}
              </div>
            )}

            {segment.completed ? (
              <button
                type="button"
                onClick={() => onUpdate({ completed: false })}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-success/15 text-[13px] font-bold text-success transition-transform active:scale-[0.98]"
              >
                <Check className="h-4 w-4" strokeWidth={3} />
                Kilomètre validé — appuyer pour annuler
              </button>
            ) : (
              <button
                type="button"
                onClick={onValidate}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary text-sm font-bold text-primary-foreground shadow-glow transition-transform active:scale-[0.98]"
              >
                <Check className="h-5 w-5" strokeWidth={3} />
                Valider le kilomètre
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
