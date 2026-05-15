import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, ChevronDown, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAddWorkout, useExerciseImageUrls, useWorkouts } from "@/hooks/use-fitness";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import type { WorkoutTemplate } from "@/routes/_authenticated/fitness/CoachSheet";
import {
  ExercisePickerSheet,
  type PickedExercise,
  type RecentExercise,
} from "./ExercisePickerSheet";
import { normalize } from "@/lib/fitness/exerciseCatalog";

export function WorkoutSheet({
  onClose,
  template,
  priorPRs,
}: {
  onClose: () => void;
  template?: WorkoutTemplate | null;
  priorPRs?: Map<string, number>;
}) {
  const add = useAddWorkout();
  const { data: workouts } = useWorkouts(); // cache hit — no extra request

  const [form, setForm] = useState({
    name: template?.name ?? "",
    date: format(new Date(), "yyyy-MM-dd"),
    duration_minutes: "",
    notes: template?.notes ?? "",
  });

  const [exercises, setExercises] = useState<
    Array<{ name: string; sets: string; reps: string; weight: string; image_path: string | null }>
  >(
    template?.exercises && template.exercises.length > 0
      ? template.exercises
      : [{ name: "", sets: "", reps: "", weight: "", image_path: null }],
  );

  const [uploading, setUploading] = useState<number | null>(null);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  // Derive recent exercises from cached workouts (most recent first, deduplicated)
  const recentExercises = useMemo<RecentExercise[]>(() => {
    if (!workouts) return [];
    const seen = new Map<
      string,
      { name: string; lastSets: number | null; lastReps: number | null; lastWeight: number | null }
    >();
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

  const updateEx = (
    i: number,
    k: keyof (typeof exercises)[number],
    v: string | null,
  ) => {
    setExercises((arr) => arr.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)));
  };

  const openPicker = (i: number) => {
    setPickerIndex(i);
  };

  const handlePickerSelect = (picked: PickedExercise) => {
    if (pickerIndex === null) return;
    setExercises((arr) =>
      arr.map((e, i) =>
        i === pickerIndex
          ? {
              ...e,
              name: picked.name,
              sets: picked.sets || e.sets,
              reps: picked.reps || e.reps,
              weight: picked.weight || e.weight,
            }
          : e,
      ),
    );
    setPickerIndex(null);
  };

  const addExercise = () => {
    const newIdx = exercises.length;
    setExercises((a) => [
      ...a,
      { name: "", sets: "", reps: "", weight: "", image_path: null },
    ]);
    setPickerIndex(newIdx);
  };

  const uploadImage = async (i: number, file: File) => {
    try {
      setUploading(i);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("exercise-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      updateEx(i, "image_path", path);
      toast.success("Photo ajoutée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec upload");
    } finally {
      setUploading(null);
    }
  };

  const exImagePaths = exercises.map((e) => e.image_path);
  const { data: exImageUrls } = useExerciseImageUrls(exImagePaths);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payloadExercises = exercises
      .filter((ex) => ex.name.trim())
      .map((ex) => ({
        name: ex.name.trim(),
        sets: num(ex.sets),
        reps: num(ex.reps),
        weight: num(ex.weight),
        image_path: ex.image_path,
      }));

    await add.mutateAsync({
      name: form.name.trim(),
      date: form.date,
      duration_minutes: num(form.duration_minutes),
      notes: form.notes.trim() || null,
      exercises: payloadExercises,
    });

    // Fire-and-forget: upsert exercise history (silently fails if table absent)
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        for (const ex of payloadExercises) {
          if (!ex.name) continue;
          await supabase.from("exercise_history").upsert(
            {
              user_id: user.id,
              exercise_name: ex.name,
              last_weight: ex.weight,
              last_reps: ex.reps,
              last_sets: ex.sets,
              last_used_at: new Date().toISOString(),
            },
            { onConflict: "user_id,exercise_name" },
          );
        }
      } catch {
        // ignore — table may not exist yet
      }
    })();

    if (priorPRs) {
      for (const ex of payloadExercises) {
        if (ex.weight == null) continue;
        const key = ex.name.toLowerCase();
        const prev = priorPRs.get(key) ?? null;
        if (prev == null || ex.weight > prev) {
          toast.success(
            `🏆 Nouveau PR — ${ex.name} : ${ex.weight} kg${prev != null ? ` (avant ${prev} kg)` : ""}`,
            { duration: 5000 },
          );
        }
      }
    }

    onClose();
  };

  return (
    <>
      <Sheet title={template ? "Refaire la séance" : "Nouvelle séance"} onClose={onClose}>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Nom"
            placeholder="Push, Jambes, Cardio…"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Date"
              type="date"
              value={form.date}
              onChange={(v) => setForm({ ...form, date: v })}
              required
            />
            <Field
              label="Durée (min)"
              type="number"
              value={form.duration_minutes}
              onChange={(v) => setForm({ ...form, duration_minutes: v })}
            />
          </div>

          {/* Exercises */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Exercices
              </label>
              <button
                type="button"
                onClick={addExercise}
                className="text-xs font-semibold text-primary"
              >
                + Ajouter
              </button>
            </div>

            <div className="space-y-3">
              {exercises.map((ex, i) => {
                const imgUrl = ex.image_path ? exImageUrls?.get(ex.image_path) : null;
                const recent = ex.name
                  ? recentExercises.find((r) => normalize(r.name) === normalize(ex.name))
                  : null;
                const hasHint =
                  recent &&
                  (recent.lastSets || recent.lastReps || recent.lastWeight);

                return (
                  <div
                    key={i}
                    className="rounded-2xl border border-border bg-surface p-3"
                  >
                    {/* Top row: photo + name picker + delete */}
                    <div className="flex gap-2">
                      <label
                        className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
                        aria-label="Photo exercice"
                      >
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={ex.name || "Exercice"}
                            className="h-full w-full object-cover"
                          />
                        ) : ex.image_path || uploading === i ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4" />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading !== null}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadImage(i, f);
                            e.target.value = "";
                          }}
                        />
                      </label>

                      {/* Exercise name — opens picker */}
                      <button
                        type="button"
                        onClick={() => openPicker(i)}
                        className="flex flex-1 items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-left"
                      >
                        <span
                          className={
                            ex.name
                              ? "text-sm font-medium text-foreground"
                              : "text-sm text-muted-foreground"
                          }
                        >
                          {ex.name || "Choisir un exercice"}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>

                      {exercises.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExercises((a) => a.filter((_, idx) => idx !== i))
                          }
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Last session hint */}
                    {hasHint && (
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Dernière séance :{" "}
                        <span className="font-medium text-foreground/70">
                          {[
                            recent.lastSets && recent.lastReps
                              ? `${recent.lastSets}×${recent.lastReps}`
                              : null,
                            recent.lastWeight ? `${recent.lastWeight} kg` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </p>
                    )}

                    {ex.image_path && (
                      <button
                        type="button"
                        onClick={() => updateEx(i, "image_path", null)}
                        className="mt-1 text-[10px] font-medium text-muted-foreground hover:text-destructive"
                      >
                        Retirer la photo
                      </button>
                    )}

                    {/* Sets / Reps / Weight */}
                    <div className="mt-2.5 grid grid-cols-3 gap-2">
                      {(
                        [
                          { key: "sets", placeholder: "Séries", label: "séries" },
                          { key: "reps", placeholder: "Reps", label: "reps" },
                          { key: "weight", placeholder: "Kg", label: "kg", step: "0.5" },
                        ] as const
                      ).map(({ key, placeholder, label, step }) => (
                        <div key={key} className="flex flex-col gap-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            step={step}
                            value={ex[key]}
                            onChange={(e) => updateEx(i, key, e.target.value)}
                            placeholder={placeholder}
                            className="rounded-xl border border-border bg-card px-2 py-2.5 text-center text-sm outline-none focus:border-primary"
                          />
                          <span className="text-center text-[9px] uppercase tracking-wider text-muted-foreground/60">
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Field
            label="Notes"
            textarea
            value={form.notes}
            onChange={(v) => setForm({ ...form, notes: v })}
          />
          <SubmitButton pending={add.isPending}>Enregistrer la séance</SubmitButton>
        </form>
      </Sheet>

      {pickerIndex !== null && (
        <ExercisePickerSheet
          recentExercises={recentExercises}
          onSelect={handlePickerSelect}
          onClose={() => setPickerIndex(null)}
          initialQuery={exercises[pickerIndex]?.name ?? ""}
        />
      )}
    </>
  );
}
