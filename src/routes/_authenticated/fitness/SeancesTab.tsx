import { useRef, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Calendar,
  Camera,
  Clock,
  Dumbbell,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { MuscleBodyMap } from "@/components/fitness/MuscleBodyMap";
import { ExerciseStatsSheet } from "@/components/fitness/ExerciseStatsSheet";
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
  useAddExerciseToWorkout,
  useAddWorkout,
  useDeleteExercise,
  useDeleteWorkout,
  useExerciseImageUrls,
  useUpdateExercise,
  useUpdateWorkoutName,
  useWorkouts,
} from "@/hooks/use-fitness";
import { FabAdd, Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { CoachSheet, type WorkoutTemplate } from "./CoachSheet";

// ─── Calcul PRs + historique poids + volume ───────────────────────────────────

function computePRs(workouts: ReturnType<typeof useWorkouts>["data"]) {
  const prByName = new Map<string, number>();
  const histByName = new Map<string, Array<{ date: string; weight: number }>>();
  const volByName = new Map<string, Array<{ date: string; volume: number }>>();
  const freq = new Map<string, number>();

  if (!workouts) return { prByName, histByName, volByName, topExercises: [] as string[] };

  for (const w of workouts) {
    const sessionMax = new Map<string, number>();
    const sessionVol = new Map<string, number>();

    for (const ex of w.exercises ?? []) {
      const key = ex.name.trim().toLowerCase();
      if (!key) continue;
      freq.set(key, (freq.get(key) ?? 0) + 1);
      if (ex.weight != null) {
        if (!sessionMax.has(key) || ex.weight > sessionMax.get(key)!) sessionMax.set(key, ex.weight);
        if (!prByName.has(key) || ex.weight > prByName.get(key)!) prByName.set(key, ex.weight);
        const vol = (ex.sets ?? 1) * (ex.reps ?? 1) * ex.weight;
        sessionVol.set(key, (sessionVol.get(key) ?? 0) + vol);
      }
    }

    for (const [k, v] of sessionMax) {
      if (!histByName.has(k)) histByName.set(k, []);
      histByName.get(k)!.push({ date: w.date, weight: v });
    }
    for (const [k, v] of sessionVol) {
      if (!volByName.has(k)) volByName.set(k, []);
      volByName.get(k)!.push({ date: w.date, volume: v });
    }
  }

  for (const arr of histByName.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  for (const arr of volByName.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  const topExercises = Array.from(freq.entries())
    .filter(([k, n]) => n >= 2 && (histByName.get(k)?.length ?? 0) >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return { prByName, histByName, volByName, topExercises };
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function SeancesTab() {
  const { data, isLoading } = useWorkouts();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);

  const { prByName, histByName, volByName, topExercises } = useMemo(
    () => computePRs(data),
    [data],
  );

  const allImagePaths = useMemo(
    () => (data ?? []).flatMap((w) => (w.exercises ?? []).map((ex) => ex.image_path)),
    [data],
  );
  const { data: listImageUrls } = useExerciseImageUrls(allImagePaths);

  const latestDate = data?.[0]?.date ?? "";

  const openNew = () => { setTemplate(null); setOpen(true); };

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
  const handleCoachResult = (tpl: WorkoutTemplate) => { setCoachOpen(false); setTemplate(tpl); setOpen(true); };
  const openCoach = (initial?: string[]) => { setCoachInitialMuscles(initial?.length ? initial : null); setCoachOpen(true); };

  return (
    <section className="flex flex-col gap-4">
      <MuscleBodyMap />

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

      {/* Graphiques top exercices */}
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
                      <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} domain={["dataMin - 2", "dataMax + 2"]} width={32} />
                      <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
                      <Line type="monotone" dataKey="weight" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 2.5 }} />
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
            <WorkoutCard
              key={w.id}
              w={w}
              prByName={prByName}
              histByName={histByName}
              volByName={volByName}
              imageUrls={listImageUrls}
              latestDate={latestDate}
              onOpenFromTemplate={openFromTemplate}
            />
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

// ─── WorkoutCard ──────────────────────────────────────────────────────────────

type WorkoutRow = NonNullable<ReturnType<typeof useWorkouts>["data"]>[number];

function WorkoutCard({
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
  const addEx = useAddExerciseToWorkout();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statsKey, setStatsKey] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<{ url: string; exId: string } | null>(null);
  const [addingEx, setAddingEx] = useState(false);
  const [newExName, setNewExName] = useState("");
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

  const handleAddExercise = () => {
    if (!newExName.trim()) { setAddingEx(false); return; }
    addEx.mutate({ workoutId: w.id, exercise: { name: newExName.trim() } });
    setNewExName("");
    setAddingEx(false);
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
        {addingEx ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newExName}
              onChange={(e) => setNewExName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddExercise();
                if (e.key === "Escape") setAddingEx(false);
              }}
              onBlur={handleAddExercise}
              placeholder="Nom de l'exercice…"
              className="flex-1 rounded-lg border border-primary bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground/50"
            />
            <button
              type="button"
              onClick={() => setAddingEx(false)}
              className="text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingEx(true)}
            className="flex items-center gap-1 text-xs font-medium text-primary/60 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Exercice
          </button>
        )}
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

      {/* Modal photo */}
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

      {/* Fiche stats exercice */}
      {statsKey && (
        <ExerciseStatsSheet
          exerciseName={statsKey}
          weightHistory={histByName.get(statsKey) ?? []}
          volumeHistory={volByName.get(statsKey) ?? []}
          pr={prByName.get(statsKey)}
          onClose={() => setStatsKey(null)}
        />
      )}

      {/* Confirmation suppression séance */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="mb-20 w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-sm font-semibold">Supprimer « {w.name} » ?</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Cette action est irréversible. Tous les exercices seront supprimés.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={() => { deleteWorkout.mutate(w.id); setConfirmDelete(false); }}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

// ─── SwipeableExerciseRow ─────────────────────────────────────────────────────

function SwipeableExerciseRow({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentOffset = useRef(0);
  const dragging = useRef(false);
  const THRESHOLD = 72;

  const applyOffset = (offset: number, animate = false) => {
    if (!contentRef.current) return;
    contentRef.current.style.transition = animate ? "transform 0.18s ease" : "none";
    contentRef.current.style.transform = `translateX(${offset}px)`;
    currentOffset.current = offset;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    dragging.current = true;
    applyOffset(currentOffset.current, false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientX - startX.current + currentOffset.current;
    if (delta < 0) applyOffset(Math.max(delta, -(THRESHOLD + 6)), false);
  };

  const handleTouchEnd = () => {
    dragging.current = false;
    if (currentOffset.current <= -THRESHOLD / 2) {
      applyOffset(-THRESHOLD, true);
    } else {
      applyOffset(0, true);
    }
  };

  return (
    <li className="relative overflow-hidden rounded-lg list-none">
      {/* Bouton delete révélé par swipe */}
      <div className="absolute inset-y-0 right-0 flex w-[72px] items-center justify-center rounded-r-lg bg-destructive/90">
        <button
          type="button"
          onClick={() => { applyOffset(0, true); onDelete(); }}
          className="flex h-9 w-9 items-center justify-center text-white"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {/* Contenu swipeable */}
      <div
        ref={contentRef}
        className="relative bg-card"
        style={{ transform: "translateX(0px)", zIndex: 1 }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </li>
  );
}

// ─── EditableText ─────────────────────────────────────────────────────────────

function EditableText({
  value,
  onSave,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`bg-transparent outline-none border-b border-primary ${className}`}
        style={{ minWidth: 60 }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`group inline-flex items-center gap-1.5 text-left ${className}`}
    >
      <span>{value}</span>
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-primary/60" />
    </button>
  );
}

// ─── PhotoModal ───────────────────────────────────────────────────────────────

function PhotoModal({
  url,
  onClose,
  onDelete,
  onModify,
}: {
  url: string;
  onClose: () => void;
  onDelete: () => void;
  onModify: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <img src={url} alt="Exercice" className="w-full rounded-2xl object-contain" />
        <div className="mt-4 flex gap-3">
          <button
            onClick={onModify}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2.5 text-sm font-semibold text-white"
          >
            <Camera className="h-4 w-4" />
            Modifier
          </button>
          <button
            onClick={onDelete}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive/80 py-2.5 text-sm font-semibold text-white"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WorkoutSheet ─────────────────────────────────────────────────────────────

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
        <Field label="Nom" placeholder="Push, Jambes, Cardio…" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
          <Field label="Durée (min)" type="number" value={form.duration_minutes} onChange={(v) => setForm({ ...form, duration_minutes: v })} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Exercices
            </label>
            <button
              type="button"
              onClick={() => setExercises((a) => [...a, { name: "", sets: "", reps: "", weight: "", image_path: null }])}
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
                        <img src={imgUrl} alt={ex.name || "Exercice"} className="h-full w-full object-cover" />
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
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(i, f); e.target.value = ""; }}
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
                    <input type="number" value={ex.sets} onChange={(e) => updateEx(i, "sets", e.target.value)} placeholder="Séries" className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary" />
                    <input type="number" value={ex.reps} onChange={(e) => updateEx(i, "reps", e.target.value)} placeholder="Reps" className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary" />
                    <input type="number" step="0.5" value={ex.weight} onChange={(e) => updateEx(i, "weight", e.target.value)} placeholder="Kg" className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Field label="Notes" textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        <SubmitButton pending={add.isPending}>Enregistrer la séance</SubmitButton>
      </form>
    </Sheet>
  );
}
