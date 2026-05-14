import { useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAddWorkout, useExerciseImageUrls } from "@/hooks/use-fitness";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import type { WorkoutTemplate } from "@/routes/_authenticated/fitness/CoachSheet";

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

  const updateEx = (i: number, k: keyof (typeof exercises)[number], v: string | null) => {
    setExercises((arr) => arr.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)));
  };

  const uploadImage = async (i: number, file: File) => {
    try {
      setUploading(i);
      const { data: { user } } = await supabase.auth.getUser();
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

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Exercices
            </label>
            <button
              type="button"
              onClick={() =>
                setExercises((a) => [
                  ...a,
                  { name: "", sets: "", reps: "", weight: "", image_path: null },
                ])
              }
              className="text-xs font-semibold text-primary"
            >
              + Ajouter
            </button>
          </div>
          <div className="space-y-2">
            {exercises.map((ex, i) => {
              const imgUrl = ex.image_path ? exImageUrls?.get(ex.image_path) : null;
              return (
                <div key={i} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex gap-2">
                    <label
                      className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
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
                    <input
                      type="text"
                      value={ex.name}
                      onChange={(e) => updateEx(i, "name", e.target.value)}
                      placeholder="Exercice"
                      className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {exercises.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setExercises((a) => a.filter((_, idx) => idx !== i))}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {ex.image_path && (
                    <button
                      type="button"
                      onClick={() => updateEx(i, "image_path", null)}
                      className="mt-1 text-[10px] font-medium text-muted-foreground hover:text-destructive"
                    >
                      Retirer la photo
                    </button>
                  )}
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      value={ex.sets}
                      onChange={(e) => updateEx(i, "sets", e.target.value)}
                      placeholder="Séries"
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
                    />
                    <input
                      type="number"
                      value={ex.reps}
                      onChange={(e) => updateEx(i, "reps", e.target.value)}
                      placeholder="Reps"
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={ex.weight}
                      onChange={(e) => updateEx(i, "weight", e.target.value)}
                      placeholder="Kg"
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
                    />
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
  );
}
