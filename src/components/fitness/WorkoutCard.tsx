import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  BarChart3,
  Clock,
  Dumbbell,
  Flame,
  Layers,
  Loader2,
  Plus,
  Repeat,
  Trash2,
  Trophy,
  TrendingUp,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  useDeleteExercise,
  useDeleteWorkout,
  useAddExerciseToWorkout,
  useUpdateExercise,
  useUpdateWorkoutName,
  useWorkouts,
} from "@/hooks/use-fitness";
import { EditableText } from "./EditableText";
import { SwipeableExerciseRow } from "./SwipeableExerciseRow";
import { PhotoModal } from "./PhotoModal";
import { WorkoutDeleteDialog } from "./WorkoutDeleteDialog";
import { ExerciseStatsSheet } from "./ExerciseStatsSheet";
import {
  ExercisePickerSheet,
  type PickedExercise,
  type RecentExercise,
} from "./ExercisePickerSheet";
import { normalize } from "@/lib/fitness/exerciseCatalog";

export type WorkoutRow = NonNullable<ReturnType<typeof useWorkouts>["data"]>[number];

export function WorkoutCard({
  w,
  prByName,
  histByName,
  volByName,
  imageUrls,
  latestDate,
  onOpenFromTemplate,
}: {
  w: WorkoutRow;
  prByName: Map<string, number>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  imageUrls: Map<string, string> | undefined;
  latestDate: string;
  onOpenFromTemplate: (w: WorkoutRow) => void;
}) {
  const updateName = useUpdateWorkoutName();
  const updateEx = useUpdateExercise();
  const deleteEx = useDeleteExercise();
  const deleteWorkout = useDeleteWorkout();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statsKey, setStatsKey] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<{ url: string; exId: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploadingExId, setUploadingExId] = useState<string | null>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const modifyExIdRef = useRef<string>("");

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

  // ─── Stats agrégées de la séance ───────────────────────────────────────────
  const stats = useMemo(() => {
    const exs = w.exercises ?? [];
    let volume = 0;
    for (const ex of exs) {
      if (ex.weight != null) {
        volume += (ex.sets ?? 1) * (ex.reps ?? 1) * ex.weight;
      }
    }
    const duration = w.duration_minutes ?? 0;
    // Estimation ~6 kcal/min en musculation modérée
    const calories = duration > 0 ? Math.round(duration * 6) : null;
    return { volume: Math.round(volume), duration, calories, count: exs.length };
  }, [w]);

  const dateLabel = format(parseISO(w.date), "EEEE d MMMM • HH'h'mm", { locale: fr });

  return (
    <li className="overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {/* ─── En-tête immersif ───────────────────────────────────────────────── */}
      <div className="relative px-5 pb-4 pt-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 to-transparent"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
              {dateLabel}
            </p>
            <EditableText
              value={w.name}
              onSave={(name) => updateName.mutate({ id: w.id, name })}
              className="mt-1 text-xl font-bold leading-tight tracking-tight"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenFromTemplate(w)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-primary/15 hover:text-primary"
              title="Refaire"
            >
              <Repeat className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-destructive/15 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ─── Tuiles de stats ──────────────────────────────────────────────── */}
        <div className="relative mt-4 grid grid-cols-4 gap-2">
          <StatTile
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Durée"
            value={stats.duration > 0 ? `${stats.duration}` : "—"}
            unit={stats.duration > 0 ? "min" : undefined}
          />
          <StatTile
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Volume"
            value={stats.volume > 0 ? formatVolume(stats.volume) : "—"}
            unit={stats.volume > 0 ? "kg" : undefined}
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
            value={`${stats.count}`}
          />
        </div>
      </div>

      {/* ─── Liste exercices premium (groupés par nom) ──────────────────────── */}
      {groupedExercises.length > 0 && (
        <ul className="space-y-2 px-3 pb-3">
          {groupedExercises.map((group) => {
            const isOpen = openGroupKey === group.key;
            const firstEx = group.sets[0];
            const imgPath = group.sets.find((s) => s.image_path)?.image_path ?? null;
            const imgUrl = imgPath ? (imageUrls?.get(imgPath) ?? null) : null;
            const isPR =
              group.maxWeight != null && prByName.get(group.key) === group.maxWeight;
            const isLatestPR = isPR && w.date === latestDate;

            const repsRange =
              group.minReps != null && group.maxReps != null
                ? group.minReps === group.maxReps
                  ? `${group.minReps} reps`
                  : `${group.minReps}-${group.maxReps} reps`
                : null;
            const meta = [
              `${group.totalSets} ${group.totalSets > 1 ? "séries" : "série"}`,
              repsRange,
              group.maxWeight != null ? `max ${group.maxWeight} kg` : null,
            ]
              .filter(Boolean)
              .join(" • ");

            return (
              <li
                key={group.key}
                className="overflow-hidden rounded-2xl bg-white/[0.03] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenGroupKey(isOpen ? null : group.key)}
                  className="flex w-full items-center gap-3 p-2.5 text-left transition-all active:scale-[0.98] active:bg-white/[0.06]"
                >
                  {/* Miniature */}
                  {imgUrl ? (
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/5">
                      <img
                        src={imgUrl}
                        alt={firstEx.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : imgPath ? (
                    <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-muted" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary/70">
                      <Dumbbell className="h-5 w-5" />
                    </div>
                  )}

                  {/* Contenu */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-semibold leading-tight">
                        {firstEx.name}
                      </span>
                      {isPR && (
                        <Trophy
                          className={`h-3.5 w-3.5 shrink-0 text-warning ${isLatestPR ? "animate-pulse" : ""}`}
                          aria-label={isLatestPR ? "Nouveau record !" : "Record personnel"}
                        />
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
                  </div>

                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Contenu déplié */}
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-2 border-t border-white/5 px-3 pb-3 pt-3">
                      {/* Liste des séries */}
                      <ul className="space-y-1.5">
                        {group.sets.map((ex, idx) => (
                          <SwipeableExerciseRow
                            key={ex.id}
                            onDelete={() => deleteEx.mutate(ex.id)}
                          >
                            <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                                {idx + 1}
                              </span>
                              <div className="flex-1 text-sm font-medium tabular-nums">
                                {ex.reps != null ? `${ex.reps} reps` : "—"}
                                <span className="mx-1.5 text-muted-foreground/50">•</span>
                                {ex.weight != null ? `${ex.weight} kg` : "—"}
                              </div>
                              {ex.weight != null &&
                                ex.weight === group.maxWeight &&
                                isPR && (
                                  <Trophy className="h-3.5 w-3.5 shrink-0 text-warning" />
                                )}
                            </div>
                          </SwipeableExerciseRow>
                        ))}
                      </ul>

                      {/* Récap & stats */}
                      <div className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2 text-xs">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Volume total
                          </span>
                          <span className="font-bold tabular-nums">
                            {group.volume > 0 ? `${formatVolume(group.volume)} kg` : "—"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Total reps
                          </span>
                          <span className="font-bold tabular-nums">{group.totalReps}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStatsKey(group.key);
                          }}
                          className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all active:scale-95"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          Stats
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}


      {/* ─── Ajouter un exercice ────────────────────────────────────────────── */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-2.5 text-xs font-medium text-muted-foreground transition-all active:scale-[0.99] hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
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


      {/* Input caché pour modifier une photo */}
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

      {showAddModal && (
        <AddExerciseModal
          workoutId={w.id}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </li>
  );
}

// ─── Tuile de stat premium ──────────────────────────────────────────────────
function StatTile({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-white/[0.04] px-2 py-2.5 ring-1 ring-white/5">
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

function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `${v}`;
}

// ─── 2-step modal: picker → form ──────────────────────────────────────────────

function AddExerciseModal({
  workoutId,
  onClose,
}: {
  workoutId: string;
  onClose: () => void;
}) {
  const { data: workouts } = useWorkouts(); // cache hit — already fetched by SeancesTab
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
        {/* Handle */}
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
