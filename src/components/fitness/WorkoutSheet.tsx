import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, ChevronDown, Loader2, Minus, Plus, SlidersHorizontal, X } from "lucide-react";
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
import { identityKey } from "@/lib/fitness/recentExercises";
import { resolveExerciseIdsByLabel } from "@/services/exerciseResolution";
import { summarizeSets, type WorkingSet } from "@/lib/fitness/sets";
import { formatTonnage } from "@/lib/fitness/strength";
import { GYMS } from "@/lib/fitness/config";

type SetRow = { reps: string; weight: string };

type ExerciseDraft = {
  name: string;
  sets: string;
  reps: string;
  weight: string;
  image_path: string | null;
  detailed: boolean;
  setRows: SetRow[];
};

const emptySetRow = (): SetRow => ({ reps: "", weight: "" });

const emptyExercise = (): ExerciseDraft => ({
  name: "",
  sets: "",
  reps: "",
  weight: "",
  image_path: null,
  detailed: false,
  setRows: [emptySetRow()],
});

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
    gym_location: "Keep Cool",
  });

  const [exercises, setExercises] = useState<ExerciseDraft[]>(
    template?.exercises && template.exercises.length > 0
      ? template.exercises.map((e) => ({
          name: e.name ?? "",
          sets: e.sets ?? "",
          reps: e.reps ?? "",
          weight: e.weight ?? "",
          image_path: e.image_path ?? null,
          detailed: false,
          setRows: [emptySetRow()],
        }))
      : [emptyExercise()],
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
    k: "name" | "sets" | "reps" | "weight" | "image_path",
    v: string | null,
  ) => {
    setExercises((arr) => arr.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)));
  };

  const toggleDetailed = (i: number) => {
    setExercises((arr) =>
      arr.map((e, idx) => {
        if (idx !== i) return e;
        const detailed = !e.detailed;
        // Au premier passage en mode détaillé, pré-remplir une série avec
        // les valeurs simples si elles existent.
        const setRows =
          detailed && e.setRows.length === 1 && !e.setRows[0].reps && !e.setRows[0].weight
            ? [{ reps: e.reps, weight: e.weight }]
            : e.setRows;
        return { ...e, detailed, setRows };
      }),
    );
  };

  const updateSetRow = (exIdx: number, setIdx: number, k: keyof SetRow, v: string) => {
    setExercises((arr) =>
      arr.map((e, idx) =>
        idx === exIdx
          ? {
              ...e,
              setRows: e.setRows.map((r, j) => (j === setIdx ? { ...r, [k]: v } : r)),
            }
          : e,
      ),
    );
  };

  const addSetRow = (exIdx: number) => {
    setExercises((arr) =>
      arr.map((e, idx) => (idx === exIdx ? { ...e, setRows: [...e.setRows, emptySetRow()] } : e)),
    );
  };

  const removeSetRow = (exIdx: number, setIdx: number) => {
    setExercises((arr) =>
      arr.map((e, idx) =>
        idx === exIdx ? { ...e, setRows: e.setRows.filter((_, j) => j !== setIdx) } : e,
      ),
    );
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
    setExercises((a) => [...a, emptyExercise()]);
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

  // Convertit les séries détaillées d'un exercice en WorkingSet[] pour le résumé.
  const toWorkingSets = (rows: SetRow[]): WorkingSet[] =>
    rows.map((r) => ({ reps: num(r.reps), weight: num(r.weight) }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payloadExercises = exercises
      .filter((ex) => ex.name.trim())
      .map((ex) => {
        const setDetails = ex.detailed
          ? toWorkingSets(ex.setRows)
              .filter((s) => s.reps != null && s.weight != null)
              .map((s) => ({ reps: s.reps ?? null, weight: s.weight ?? null }))
          : null;
        return {
          name: ex.name.trim(),
          sets: num(ex.sets),
          reps: num(ex.reps),
          weight: num(ex.weight),
          image_path: ex.image_path,
          setDetails: setDetails && setDetails.length > 0 ? setDetails : null,
        };
      });

    await add.mutateAsync({
      name: form.name.trim(),
      date: form.date,
      duration_minutes: num(form.duration_minutes),
      notes: form.notes.trim() || null,
      gym_location: form.gym_location,
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
          await (
            supabase as unknown as {
              from: (t: string) => {
                upsert: (v: unknown, o: unknown) => Promise<unknown>;
              };
            }
          )
            .from("exercise_history")
            .upsert(
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
      // Étape 4.6 : priorPRs (= prByName de computePRs) est maintenant keyé
      // par identityKey (id en priorité). On résout donc les mêmes ids que
      // useAddWorkout vient de résoudre pour l'insertion (même service,
      // idempotent — aucune nouvelle référence créée ici), pour comparer
      // dans le même espace de clé plutôt que par nom seul (qui ne
      // matcherait plus rien dès qu'un historique a déjà une référence).
      const idsByName = await resolveExerciseIdsByLabel(
        "muscu",
        payloadExercises.map((e) => e.name),
      );
      for (const ex of payloadExercises) {
        if (ex.weight == null) continue;
        const key = identityKey({ name: ex.name, exercise_reference_id: idsByName.get(ex.name) });
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

          {/* Salle */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Salle
            </label>
            <div className="grid grid-cols-2 gap-2">
              {GYMS.map((gym) => {
                const selected = form.gym_location === gym;
                return (
                  <button
                    key={gym}
                    type="button"
                    onClick={() => setForm({ ...form, gym_location: gym })}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      selected
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {gym}
                  </button>
                );
              })}
            </div>
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
                const hasHint = recent && (recent.lastSets || recent.lastReps || recent.lastWeight);
                const summary = ex.detailed ? summarizeSets(toWorkingSets(ex.setRows)) : null;

                return (
                  <div key={i} className="rounded-2xl border border-border bg-surface p-3">
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
                          onClick={() => setExercises((a) => a.filter((_, idx) => idx !== i))}
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

                    {/* Mode simple : Sets / Reps / Weight */}
                    {!ex.detailed && (
                      <div className="mt-2.5 grid grid-cols-3 gap-2">
                        {(
                          [
                            { key: "sets", placeholder: "Séries", label: "séries" },
                            { key: "reps", placeholder: "Reps", label: "reps" },
                            { key: "weight", placeholder: "Kg", label: "kg", step: "0.5" },
                          ] as const
                        ).map((item) => {
                          const { key, placeholder, label } = item;
                          const step = "step" in item ? item.step : undefined;
                          return (
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
                          );
                        })}
                      </div>
                    )}

                    {/* Mode détaillé : une ligne par série (reps / kg) */}
                    {ex.detailed && (
                      <div className="mt-2.5 space-y-2">
                        <div className="grid grid-cols-[1.5rem_1fr_1fr_1.75rem] items-center gap-1.5 px-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/60">
                          <span className="text-center">#</span>
                          <span className="text-center">reps</span>
                          <span className="text-center">kg</span>
                          <span />
                        </div>
                        {ex.setRows.map((row, j) => (
                          <div
                            key={j}
                            className="grid grid-cols-[1.5rem_1fr_1fr_1.75rem] items-center gap-1.5"
                          >
                            <span className="text-center text-xs font-semibold text-muted-foreground">
                              {j + 1}
                            </span>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={row.reps}
                              onChange={(e) => updateSetRow(i, j, "reps", e.target.value)}
                              placeholder="—"
                              className="rounded-lg border border-border bg-card px-1.5 py-2 text-center text-sm outline-none focus:border-primary"
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.5"
                              value={row.weight}
                              onChange={(e) => updateSetRow(i, j, "weight", e.target.value)}
                              placeholder="—"
                              className="rounded-lg border border-border bg-card px-1.5 py-2 text-center text-sm outline-none focus:border-primary"
                            />
                            <button
                              type="button"
                              onClick={() => removeSetRow(i, j)}
                              disabled={ex.setRows.length <= 1}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                              aria-label="Supprimer la série"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => addSetRow(i)}
                          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Ajouter une série
                        </button>

                        {summary && summary.setCount > 0 && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-card/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                            <span>
                              Tonnage{" "}
                              <span className="font-semibold text-foreground/80">
                                {formatTonnage(summary.tonnage)}
                              </span>
                            </span>
                            {summary.best1RM != null && (
                              <span>
                                1RM est.{" "}
                                <span className="font-semibold text-foreground/80">
                                  {summary.best1RM} kg
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Toggle mode détaillé */}
                    <button
                      type="button"
                      onClick={() => toggleDetailed(i)}
                      className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-all active:scale-[0.99] ${
                        ex.detailed
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-surface/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
                      }`}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      {ex.detailed ? "Mode simple" : "Détailler les séries"}
                    </button>
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
