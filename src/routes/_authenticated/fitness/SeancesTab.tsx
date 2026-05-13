import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import {
  BarChart3,
  Calendar,
  Camera,
  Clock,
  Dumbbell,
  Loader2,
  Repeat,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { MuscleMap } from "@/components/fitness/MuscleMap";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  useAddWorkout,
  useDeleteWorkout,
  useExerciseImageUrls,
  useWorkouts,
} from "@/hooks/use-fitness";
import { FabAdd, Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { CoachSheet, type WorkoutTemplate } from "./CoachSheet";

function computePRs(workouts: ReturnType<typeof useWorkouts>["data"]) {
  const prByName = new Map<string, number>();
  const histByName = new Map<string, Array<{ date: string; weight: number }>>();
  const freq = new Map<string, number>();

  if (!workouts) return { prByName, histByName, topExercises: [] as string[] };

  for (const w of workouts) {
    const sessionMax = new Map<string, number>();
    for (const ex of w.exercises ?? []) {
      const key = ex.name.trim().toLowerCase();
      if (!key) continue;
      freq.set(key, (freq.get(key) ?? 0) + 1);
      if (ex.weight != null) {
        if (!sessionMax.has(key) || ex.weight > sessionMax.get(key)!) {
          sessionMax.set(key, ex.weight);
        }
        if (!prByName.has(key) || ex.weight > prByName.get(key)!) {
          prByName.set(key, ex.weight);
        }
      }
    }
    for (const [k, v] of sessionMax) {
      if (!histByName.has(k)) histByName.set(k, []);
      histByName.get(k)!.push({ date: w.date, weight: v });
    }
  }

  for (const arr of histByName.values()) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
  }

  const cleanTop = Array.from(freq.entries())
    .filter(([k, n]) => n >= 2 && (histByName.get(k)?.length ?? 0) >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return { prByName, histByName, topExercises: cleanTop };
}

export function SeancesTab() {
  const { data, isLoading } = useWorkouts();
  const del = useDeleteWorkout();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);

  const { prByName, histByName, topExercises } = useMemo(() => computePRs(data), [data]);

  const allImagePaths = useMemo(
    () => (data ?? []).flatMap((w) => (w.exercises ?? []).map((ex) => ex.image_path)),
    [data],
  );
  const { data: listImageUrls } = useExerciseImageUrls(allImagePaths);

  const openNew = () => {
    setTemplate(null);
    setOpen(true);
  };

  const openFromTemplate = (w: NonNullable<typeof data>[number]) => {
    setTemplate({
      name: w.name,
      exercises: (w.exercises ?? []).map((ex) => ({
        name: ex.name,
        sets: ex.sets != null ? String(ex.sets) : "",
        reps: ex.reps != null ? String(ex.reps) : "",
        weight: ex.weight != null ? String(ex.weight) : "",
        image_path: ex.image_path ?? null,
      })),
    });
    setOpen(true);
  };

  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInitialMuscles, setCoachInitialMuscles] = useState<string[] | null>(null);

  const handleCoachResult = (tpl: WorkoutTemplate) => {
    setCoachOpen(false);
    setTemplate(tpl);
    setOpen(true);
  };

  const openCoach = (initial?: string[]) => {
    setCoachInitialMuscles(initial && initial.length > 0 ? initial : null);
    setCoachOpen(true);
  };

  return (
    <section className="flex flex-col gap-4">
      {/* Carte récupération musculaire — calcul local, pas d'appel Edge Function */}
      <MuscleMap />

      <button
        type="button"
        onClick={() => openCoach()}
        className="group flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-4 text-left shadow-card transition-all active:scale-[0.99]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
          <Sparkles className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">Coach IA — Génère ma séance</span>
          <span className="block text-[11px] text-muted-foreground">
            Choisis muscles, durée, niveau. L'IA crée ta séance.
          </span>
        </span>
      </button>

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {topExercises.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Progression — top exercices</h3>
          </div>
          <div className="space-y-4">
            {topExercises.map((key) => {
              const hist = histByName.get(key) ?? [];
              const chart = hist.map((p) => ({
                date: format(parseISO(p.date), "d MMM", { locale: fr }),
                weight: p.weight,
              }));
              const pr = prByName.get(key);
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-semibold capitalize">{key}</p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning">
                      <Trophy className="h-3 w-3" />
                      PR {pr} kg
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={chart} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid
                        stroke="var(--color-border)"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        domain={["dataMin - 2", "dataMax + 2"]}
                        width={32}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune séance</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lancez-vous, votre première séance vous attend.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((w) => (
            <li key={w.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{w.name}</p>
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
                    onClick={() => openFromTemplate(w)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    aria-label="Refaire cette séance"
                    title="Refaire"
                  >
                    <Repeat className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => del.mutate(w.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {w.exercises && w.exercises.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-border pt-3">
                  {w.exercises.map((ex) => {
                    const key = ex.name.trim().toLowerCase();
                    const isPR = ex.weight != null && prByName.get(key) === ex.weight;
                    const imgUrl = ex.image_path ? listImageUrls?.get(ex.image_path) : null;
                    return (
                      <li key={ex.id} className="flex items-center gap-2.5 text-xs">
                        {ex.image_path ? (
                          imgUrl ? (
                            <img
                              src={imgUrl}
                              alt={ex.name}
                              className="h-9 w-9 shrink-0 rounded-lg object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
                          )
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground/50">
                            <Dumbbell className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <span className="inline-flex flex-1 items-center gap-1 font-medium">
                          {ex.name}
                          {isPR && (
                            <Trophy
                              className="h-3 w-3 text-warning"
                              aria-label="Record personnel"
                            />
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          {[
                            ex.sets != null && `${ex.sets}×${ex.reps ?? "?"}`,
                            ex.weight != null && `${ex.weight} kg`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {w.notes && (
                <p className="mt-3 border-t border-border pt-3 text-xs italic text-muted-foreground">
                  {w.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <FabAdd onClick={openNew} label="Nouvelle séance" />
      {open && (
        <WorkoutSheet template={template} priorPRs={prByName} onClose={() => setOpen(false)} />
      )}
      {coachOpen && (
        <CoachSheet
          onClose={() => setCoachOpen(false)}
          onResult={handleCoachResult}
          initialMuscles={coachInitialMuscles ?? undefined}
        />
      )}
    </section>
  );
}

function WorkoutSheet({
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

  const updateEx = (
    i: number,
    k: keyof (typeof exercises)[number],
    v: string | null,
  ) => {
    setExercises((arr) => arr.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)));
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

    if (priorPRs) {
      const newPRs: Array<{ name: string; weight: number; prev: number | null }> = [];
      for (const ex of payloadExercises) {
        if (ex.weight == null) continue;
        const key = ex.name.toLowerCase();
        const prev = priorPRs.get(key) ?? null;
        if (prev == null || ex.weight > prev) {
          newPRs.push({ name: ex.name, weight: ex.weight, prev });
        }
      }
      for (const pr of newPRs) {
        toast.success(
          `🏆 Nouveau PR — ${pr.name} : ${pr.weight} kg${pr.prev != null ? ` (avant ${pr.prev} kg)` : ""}`,
          { duration: 5000 },
        );
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
                        aria-label="Retirer"
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
