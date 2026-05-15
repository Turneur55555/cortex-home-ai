import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Calendar,
  Clock,
  Dumbbell,
  Loader2,
  Plus,
  Repeat,
  Trash2,
  Trophy,
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

  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-card">
      {/* En-tête séance */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <EditableText
            value={w.name}
            onSave={(name) => updateName.mutate({ id: w.id, name })}
            className="font-semibold leading-tight"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(parseISO(w.date), "d MMM yyyy", { locale: fr })}
            </span>
            {w.duration_minutes != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {w.duration_minutes} min
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenFromTemplate(w)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
            title="Refaire"
          >
            <Repeat className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Liste exercices */}
      {w.exercises && w.exercises.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-t border-border pt-3">
          {w.exercises.map((ex) => {
            const key = ex.name.trim().toLowerCase();
            const isPR = ex.weight != null && prByName.get(key) === ex.weight;
            const isLatestPR = isPR && w.date === latestDate;
            const imgUrl = ex.image_path ? (imageUrls?.get(ex.image_path) ?? null) : null;
            return (
              <SwipeableExerciseRow
                key={ex.id}
                onDelete={() => deleteEx.mutate(ex.id)}
              >
                <div className="flex items-center gap-2.5 py-1.5 text-xs">
                  {/* Thumbnail photo */}
                  {imgUrl ? (
                    uploadingExId === ex.id ? (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPhotoModal({ url: imgUrl, exId: ex.id })}
                        className="h-9 w-9 shrink-0 overflow-hidden rounded-lg"
                      >
                        <img src={imgUrl} alt={ex.name} className="h-full w-full object-cover" loading="lazy" />
                      </button>
                    )
                  ) : ex.image_path ? (
                    <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground/40">
                      <Dumbbell className="h-3.5 w-3.5" />
                    </div>
                  )}

                  {/* Nom (éditable) */}
                  <EditableText
                    value={ex.name}
                    onSave={(name) => updateEx.mutate({ id: ex.id, name })}
                    className="flex-1 font-medium"
                  />

                  {/* Badge PR */}
                  {isPR && (
                    <Trophy
                      className={`h-3 w-3 shrink-0 text-warning ${isLatestPR ? "animate-pulse" : ""}`}
                      aria-label={isLatestPR ? "Nouveau record !" : "Record personnel"}
                    />
                  )}

                  {/* Bouton stats */}
                  <button
                    type="button"
                    onClick={() => setStatsKey(key)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:text-primary"
                    title="Statistiques"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                  </button>

                  {/* Séries/reps/poids */}
                  <span className="shrink-0 text-muted-foreground">
                    {[
                      ex.sets != null && `${ex.sets}×${ex.reps ?? "?"}`,
                      ex.weight != null && `${ex.weight} kg`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </SwipeableExerciseRow>
            );
          })}
        </ul>
      )}

      {/* Ajouter un exercice */}
      <div className="mt-2 border-t border-border pt-2">
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1 text-xs font-medium text-primary/60 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          Exercice
        </button>
      </div>

      {w.notes && (
        <p className="mt-2 border-t border-border pt-2 text-xs italic text-muted-foreground">
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
          ).map(({ key, label, step }) => (
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
          ))}
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
