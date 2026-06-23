import { useMemo, useRef, useState } from "react";
import { exerciseIllustration } from "@/lib/fitness/exerciseIllustrations";
import { toast } from "sonner";
import {
  BarChart3,
  ChevronRight,
  Clock,
  Dumbbell,
  Flame,
  Layers,
  Loader2,
  MoreVertical,
  Plus,
  Repeat,
  Trash2,
  Trophy,
  TrendingUp,
  AlertTriangle,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  useDeleteExercises,
  useDeleteWorkout,
  useAddExerciseToWorkout,
  useUpdateExercise,
  useUpdateWorkoutName,
  useWorkouts,
} from "@/hooks/use-fitness";
import { EditableText } from "./EditableText";
import { PhotoModal } from "./PhotoModal";
import { WorkoutDeleteDialog } from "./WorkoutDeleteDialog";
import { ExerciseStatsSheet } from "./ExerciseStatsSheet";
import {
  ExercisePickerSheet,
  type PickedExercise,
  type RecentExercise,
} from "./ExercisePickerSheet";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { estimate1RM, formatTonnage, workoutTonnage } from "@/lib/fitness/strength";
import { estimateWorkoutCalories } from "@/lib/fitness/calories";
import { useLatestBodyWeight } from "@/hooks/useLatestBodyWeight";

export type WorkoutRow = NonNullable<ReturnType<typeof useWorkouts>["data"]>[number];
type ExerciseRow = NonNullable<WorkoutRow["exercises"]>[number];

type SerieView = {
  index: number;
  reps: number | null;
  weight: number | null;
  sourceId: string;
};

type ExerciseGroup = {
  key: string;
  name: string;
  imagePath: string | null;
  series: SerieView[];
  totalSeries: number;
  totalReps: number;
  maxWeight: number | null;
  best1RM: number | null;
  volume: number;
  sourceIds: string[];
};

// 1 ligne `exercises` en base = 1 série affichée.
// Convention legacy : si `weight` est NULL, la colonne `sets` contient en réalité les reps
// et la colonne `reps` contient la charge (kg). On reste fidèle aux enregistrements bruts
// sans inventer de séries supplémentaires.
// Séries détaillées éventuelles (table `exercise_sets`). Source de vérité quand présentes.
type DetailedSetRow = {
  id: string;
  set_number: number | null;
  reps: number | null;
  weight: number | string | null;
};

function rowToSeries(r: ExerciseRow): SerieView[] {
  const detailed =
    ((r as unknown as { exercise_sets?: DetailedSetRow[] | null }).exercise_sets) ?? [];
  if (detailed.length > 0) {
    return [...detailed]
      .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
      .map((sset, i) => ({
        index: i + 1,
        reps: sset.reps,
        weight: sset.weight == null ? null : Number(sset.weight),
        sourceId: r.id,
      }));
  }
  // Legacy : 1 ligne `exercises` = 1 série. Si `weight` est NULL, la colonne `sets`
  // contient en réalité les reps et `reps` la charge (kg).
  const hasExplicitWeight = r.weight != null;
  const reps = hasExplicitWeight ? r.reps : (r.sets ?? r.reps);
  const weight = hasExplicitWeight ? r.weight : (r.sets != null ? r.reps : null);
  return [{ index: 1, reps, weight, sourceId: r.id }];
}

function expandToSeries(rows: ExerciseRow[]): SerieView[] {
  return rows.flatMap((r) => rowToSeries(r)).map((sset, i) => ({ ...sset, index: i + 1 }));
}


function buildGroups(rows: ExerciseRow[]): ExerciseGroup[] {
  const byKey = new Map<string, ExerciseRow[]>();
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  const groups: ExerciseGroup[] = [];
  for (const [key, list] of byKey) {
    const series = expandToSeries(list);
    let totalReps = 0;
    let volume = 0;
    let maxWeight: number | null = null;
    let best1RM: number | null = null;
    for (const s of series) {
      if (s.reps != null) totalReps += s.reps;
      if (s.weight != null) {
        maxWeight = maxWeight == null ? s.weight : Math.max(maxWeight, s.weight);
        if (s.reps != null) {
          volume += s.reps * s.weight;
          const rm = estimate1RM(s.weight, s.reps);
          if (rm != null && (best1RM == null || rm > best1RM)) best1RM = rm;
        }
      }
    }
    groups.push({
      key,
      name: list[0].name,
      imagePath: list.find((r) => r.image_path)?.image_path ?? null,
      series,
      totalSeries: series.length,
      totalReps,
      maxWeight,
      best1RM,
      volume,
      sourceIds: Array.from(new Set(list.map((r) => r.id))),
    });
  }
  return groups;
}

export function WorkoutCard({
  w,
  prByName,
  histByName,
  volByName,
  prByGym,
  histByGym,
  imageUrls,
  latestDate,
  onOpenFromTemplate,
}: {
  w: WorkoutRow;
  prByName: Map<string, number>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByGym: Map<string, Map<string, number>>;
  histByGym: Map<string, Map<string, Array<{ date: string; weight: number }>>>;
  imageUrls: Map<string, string> | undefined;
  latestDate: string;
  onOpenFromTemplate: (w: WorkoutRow) => void;
}) {
  const updateName = useUpdateWorkoutName();
  const updateEx = useUpdateExercise();
  const deleteExBatch = useDeleteExercises();
  const deleteWorkout = useDeleteWorkout();
  const { data: bodyWeightKg } = useLatestBodyWeight();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<ExerciseGroup | null>(null);
  const [statsKey, setStatsKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [photoModal, setPhotoModal] = useState<{ url: string; exId: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploadingExId, setUploadingExId] = useState<string | null>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const modifyExIdRef = useRef<string>("");

  const groups = useMemo(() => buildGroups(w.exercises ?? []), [w.exercises]);
  const gymLocation =
    ((w as unknown as { gym_location?: string | null }).gym_location ?? "Salle inconnue") ||
    "Salle inconnue";
  void histByGym;

  // Stats agrégées RÉELLES de la séance (basées sur séries expansées)
  const stats = useMemo(() => {
    let volume = 0;
    let totalSeries = 0;
    let totalReps = 0;
    for (const g of groups) {
      volume += g.volume;
      totalSeries += g.totalSeries;
      totalReps += g.totalReps;
    }

    // Contrôle d'intégrité : recalcul indépendant via le domaine pur
    // (priorise exercise_sets, fallback colonnes legacy).
    const rawVolume = workoutTonnage(w.exercises ?? []);
    const delta = Math.abs(rawVolume - volume);
    const volumeMismatch = delta > 0.5;
    if (volumeMismatch && typeof console !== "undefined") {
      console.warn("[WorkoutCard] Volume mismatch", {
        workoutId: w.id,
        computed: volume,
        rawFromSupabase: rawVolume,
        delta,
      });
    }
    // Fallback : on affiche la valeur brute Supabase si écart détecté.
    const safeVolume = volumeMismatch ? rawVolume : volume;

    const duration = w.duration_minutes ?? 0;
    // Estimation calorique réaliste basée sur la formule MET × poids × durée
    // (cf. src/lib/fitness/calories.ts). Conserve null si la durée est nulle.
    const calories = estimateWorkoutCalories({
      durationMinutes: duration,
      volumeKg: safeVolume,
      bodyWeightKg: bodyWeightKg ?? null,
    });
    return {
      volume: Math.round(safeVolume),
      volumeMismatch,
      duration,
      calories,
      exoCount: groups.length,
      totalSeries,
      totalReps,
    };
  }, [groups, w.duration_minutes, w.exercises, w.id, bodyWeightKg]);


  const handlePhotoUpload = async (exId: string, file: File) => {
    setUploadingExId(exId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("exercise-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      updateEx.mutate({ id: exId, image_path: path });
      toast.success("Photo modifiée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setUploadingExId(null);
      setPhotoModal(null);
    }
  };

  const deleteGroup = (g: ExerciseGroup) => {
    setConfirmDeleteGroup(g);
  };

  const confirmGroupDelete = () => {
    if (!confirmDeleteGroup) return;
    if (confirmDeleteGroup.sourceIds.length === 0) return;
    deleteExBatch.mutate(confirmDeleteGroup.sourceIds);
    setConfirmDeleteGroup(null);
  };

  const dateLabel = format(parseISO(w.date), "EEEE d MMMM • HH'h'mm", { locale: fr });

  return (
    <li className="overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {/* En-tête */}
      <div className="relative px-5 pb-4 pt-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 to-transparent"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
              {dateLabel}
              {gymLocation !== "Salle inconnue" && (
                <span className="ml-2 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-normal text-primary">
                  {gymLocation}
                </span>
              )}
            </p>
            <EditableText
              value={w.name}
              onSave={(name) => updateName.mutate({ id: w.id, name })}
              className="mt-1 text-xl font-bold leading-tight tracking-tight"
            />
          </div>
          <div className="relative flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenFromTemplate(w)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-primary/15 hover:text-primary"
              title="Refaire cette séance"
              aria-label="Refaire cette séance"
            >
              <Repeat className="h-4 w-4" />
            </button>
            {/* Menu 3 points — suppression séance accessible ici uniquement */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-white/10"
              aria-label="Options de la séance"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-20 min-w-[180px] overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onOpenFromTemplate(w); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5"
                >
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  Refaire cette séance
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                  className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer la séance
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tuiles de stats — calculs réels */}
        <div className="relative mt-4 grid grid-cols-4 gap-2">
          <StatTile
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Durée"
            value={stats.duration > 0 ? `${stats.duration}` : "—"}
            unit={stats.duration > 0 ? "min" : undefined}
          />
          <StatTile
            icon={
              stats.volumeMismatch ? (
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5" />
              )
            }
            label="Tonnage"
            value={stats.volume > 0 ? formatTonnage(stats.volume) : "—"}
            title={
              stats.volumeMismatch
                ? "Écart détecté — valeur recalculée depuis la base affichée"
                : undefined
            }
          />
          <StatTile
            icon={<Flame className="h-3.5 w-3.5" />}
            label="Calories"
            value={stats.calories != null ? `${stats.calories}` : "—"}
            unit={stats.calories != null ? "kcal" : undefined}
          />
          <StatTile
            icon={<Layers className="h-3.5 w-3.5" />}
            label="Exos"
            value={`${stats.exoCount}`}
          />
        </div>
      </div>

      {/* Liste exercices — format tableau toujours visible */}
      {groups.length > 0 && (
        <ul className="space-y-3 px-4 pb-3">
          {groups.map((g) => {
            const imgUrl = (g.imagePath ? imageUrls?.get(g.imagePath) : null) ?? exerciseIllustration(g.name);
            const gymPR = prByGym.get(gymLocation)?.get(g.key) ?? null;
            const isPR =
              g.maxWeight != null &&
              (gymPR != null
                ? g.maxWeight === gymPR
                : prByName.get(g.key) === g.maxWeight);
            const isLatestPR = isPR && w.date === latestDate;
            const isOpen = expandedKeys.has(g.key);
            return (
              <li
                key={g.key}
                className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03]"
              >
                {/* En-tête exercice — ligne cliquable entière */}
                <div
                  className="flex cursor-pointer select-none items-center gap-3 p-3"
                  onClick={() => {
                    setExpandedKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.key)) next.delete(g.key);
                      else next.add(g.key);
                      return next;
                    });
                  }}
                >
                  {imgUrl ? (
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10">
                      <img
                        src={imgUrl}
                        alt={g.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : g.imagePath ? (
                    <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-muted" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary/70">
                      <Dumbbell className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold leading-tight tracking-tight break-words">
                      {g.name}
                    </h3>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                      {g.totalSeries} {g.totalSeries > 1 ? "séries" : "série"}
                      {g.maxWeight != null && (
                        <>
                          <span className="mx-1.5 text-muted-foreground/40">·</span>
                          max {g.maxWeight} kg
                        </>
                      )}
                      {g.volume > 0 && (
                        <>
                          <span className="mx-1.5 text-muted-foreground/40">·</span>
                          <span className="text-muted-foreground/60">
                            {g.volume >= 1000 ? `${(g.volume / 1000).toFixed(1)}k` : g.volume} kg
                          </span>
                        </>
                      )}
                    </p>
                    {isPR && (
                      <span
                        className={`mt-1 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning ${isLatestPR ? "animate-pulse" : ""}`}
                      >
                        <Trophy className="h-3 w-3" />
                        {isLatestPR ? "Nouveau PR !" : "Record personnel"}
                      </span>
                    )}
                    {gymPR != null && gymLocation !== "Salle inconnue" && (
                      <p className="mt-0.5 text-[10px] font-medium text-primary/80">
                        Record {gymLocation} : {gymPR} kg
                      </p>
                    )}
                  </div>

                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-90" : ""}`}
                  />

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatsKey(g.key);
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-all active:scale-90"
                    aria-label="Statistiques"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteGroup(g);
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-destructive/15 hover:text-destructive"
                    aria-label="Supprimer l'exercice"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Tableau des séries — accordéon */}
                <div
                  className="overflow-hidden transition-all duration-300 ease-out"
                  style={{
                    maxHeight: isOpen ? "800px" : "0px",
                    opacity: isOpen ? 1 : 0,
                  }}
                >
                  <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-white/5 bg-black/20">
                    <div className="grid grid-cols-[56px_1fr_1fr] border-b border-white/5 bg-white/[0.02] py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      <div className="text-center">Série</div>
                      <div className="text-center">Reps</div>
                      <div className="text-center">Kg</div>
                    </div>
                    <ul className="divide-y divide-white/5">
                      {g.series.map((s) => {
                        const isMax = s.weight != null && s.weight === g.maxWeight && isPR;
                        return (
                          <li
                            key={`${s.sourceId}-${s.index}`}
                            className="grid grid-cols-[56px_1fr_1fr] items-center py-2.5 text-sm tabular-nums"
                          >
                            <div className="flex items-center justify-center">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                                {s.index}
                              </span>
                            </div>
                            <div className="text-center font-semibold">
                              {s.reps ?? "—"}
                            </div>
                            <div className="flex items-center justify-center gap-1 text-center font-semibold">
                              {s.weight ?? "—"}
                              {isMax && <Trophy className="h-3 w-3 text-warning" />}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {/* Récap tonnage */}
                    {g.volume > 0 && (
                      <div className="flex items-center justify-between border-t border-white/5 bg-white/[0.02] px-3 py-2 text-[11px]">
                        <span className="uppercase tracking-wider text-muted-foreground/70">
                          Tonnage
                        </span>
                        <span className="font-bold tabular-nums">
                          {formatTonnage(g.volume)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Ajouter un exercice */}
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-3 text-xs font-medium text-muted-foreground transition-all active:scale-[0.99] hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un exercice
        </button>
      </div>

      {w.notes && (
        <p className="mx-5 mb-4 rounded-2xl bg-white/[0.03] px-4 py-3 text-xs italic leading-relaxed text-muted-foreground">
          {w.notes}
        </p>
      )}

      <input
        ref={photoFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && modifyExIdRef.current) handlePhotoUpload(modifyExIdRef.current, f);
          e.target.value = "";
        }}
      />

      {photoModal && (
        <PhotoModal
          url={photoModal.url}
          onClose={() => setPhotoModal(null)}
          onDelete={() => {
            updateEx.mutate({ id: photoModal.exId, image_path: null });
            setPhotoModal(null);
            toast.success("Photo supprimée");
          }}
          onModify={() => {
            modifyExIdRef.current = photoModal.exId;
            photoFileRef.current?.click();
          }}
        />
      )}

      {statsKey && (
        <ExerciseStatsSheet
          exerciseName={statsKey}
          weightHistory={histByName.get(statsKey) ?? []}
          volumeHistory={volByName.get(statsKey) ?? []}
          pr={prByName.get(statsKey)}
          onClose={() => setStatsKey(null)}
        />
      )}

      {confirmDelete && (
        <WorkoutDeleteDialog
          workoutName={w.name}
          onConfirm={() => { deleteWorkout.mutate(w.id); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {/* Confirmation suppression exercice */}
      {confirmDeleteGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg">
            <h3 className="text-base font-bold">
              Supprimer « {confirmDeleteGroup.name} » ?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {confirmDeleteGroup.totalSeries} série
              {confirmDeleteGroup.totalSeries > 1 ? "s" : ""} supprimée
              {confirmDeleteGroup.totalSeries > 1 ? "s" : ""}.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteGroup(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmGroupDelete}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddExerciseModal
          workoutId={w.id}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {uploadingExId && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center">
          <div className="rounded-full bg-card/90 px-4 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur">
            <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />
            Upload en cours…
          </div>
        </div>
      )}
    </li>
  );
}

function StatTile({
  icon,
  label,
  value,
  unit,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-white/[0.04] px-2 py-2.5 ring-1 ring-white/5"
    >
      <span className="text-muted-foreground/70">{icon}</span>
      <span className="mt-0.5 flex items-baseline gap-0.5">
        <span className="text-base font-bold leading-none tracking-tight">{value}</span>
        {unit && <span className="text-[9px] font-medium text-muted-foreground">{unit}</span>}
      </span>
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
    </div>
  );
}

// ─── 2-step modal: picker → form ──────────────────────────────────────────────

function AddExerciseModal({
  workoutId,
  onClose,
}: {
  workoutId: string;
  onClose: () => void;
}) {
  const { data: workouts } = useWorkouts();
  const addEx = useAddExerciseToWorkout();
  const [step, setStep] = useState<"pick" | "fill">("pick");
  const [picked, setPicked] = useState<PickedExercise | null>(null);
  const [form, setForm] = useState({ sets: "", reps: "", weight: "" });

  const recentExercises = useMemo<RecentExercise[]>(() => {
    if (!workouts) return [];
    const seen = new Map<string, RecentExercise>();
    for (const w of workouts) {
      for (const ex of w.exercises ?? []) {
        if (!ex.name.trim()) continue;
        const key = normalize(ex.name);
        if (!seen.has(key)) {
          seen.set(key, {
            name: ex.name,
            lastSets: ex.sets ?? null,
            lastReps: ex.reps ?? null,
            lastWeight: ex.weight ?? null,
          });
        }
      }
    }
    return Array.from(seen.values()).slice(0, 25);
  }, [workouts]);

  const handlePick = (ex: PickedExercise) => {
    setPicked(ex);
    setForm({ sets: ex.sets, reps: ex.reps, weight: ex.weight });
    setStep("fill");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    await addEx.mutateAsync({
      workoutId,
      exercise: {
        name: picked.name,
        sets: num(form.sets),
        reps: num(form.reps),
        weight: num(form.weight),
      },
    });
    onClose();
  };

  if (step === "pick") {
    return (
      <ExercisePickerSheet
        recentExercises={recentExercises}
        onSelect={handlePick}
        onClose={onClose}
      />
    );
  }

  const inputCls =
    "w-full rounded-xl border border-border bg-surface px-2 py-3 text-center text-sm font-medium outline-none focus:border-primary";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form
        className="relative w-full max-w-[430px] rounded-t-3xl border-t border-border bg-card p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Ajouter à la séance</p>
            <h3 className="text-base font-bold leading-tight">{picked?.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted-foreground"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-3">
          {(
            [
              { key: "sets", label: "Séries" },
              { key: "reps", label: "Reps" },
              { key: "weight", label: "Poids (kg)", step: "0.5" },
            ] as const
          ).map((item) => {
            const { key, label } = item;
            const step = "step" in item ? item.step : undefined;
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <label className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step={step}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder="—"
                  className={inputCls}
                />
              </div>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={addEx.isPending}
          className="mb-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
        >
          {addEx.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Ajouter l'exercice
        </button>

        <button
          type="button"
          onClick={() => setStep("pick")}
          className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          ← Changer d'exercice
        </button>
      </form>
    </div>
  );
}
