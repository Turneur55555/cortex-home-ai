import { useMemo, useState } from "react";
import { Dumbbell, Loader2, Sparkles } from "lucide-react";
import { BodyMap } from "@/components/fitness/BodyMap";
import { WorkoutCard, type WorkoutRow } from "@/components/fitness/WorkoutCard";
import { WorkoutSheet } from "@/components/fitness/WorkoutSheet";
import { WorkoutProgressCharts } from "@/components/fitness/WorkoutProgressCharts";
import { useExerciseImageUrls, useWorkouts } from "@/hooks/use-fitness";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { FabAdd } from "@/components/shared/FormComponents";
import { CoachSheet, type WorkoutTemplate } from "./CoachSheet";
import { computePRs } from "@/utils/fitness/exercise-stats";

export function SeancesTab() {
  const { data, isLoading } = useWorkouts();
  const recoveryMap = useRecoveryMap(data);
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInitialMuscles, setCoachInitialMuscles] = useState<string[] | null>(null);

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

  const openFromTemplate = (w: WorkoutRow) => {
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

  const handleCoachResult = (tpl: WorkoutTemplate) => {
    setCoachOpen(false);
    setTemplate(tpl);
    setOpen(true);
  };

  const openCoach = (initial?: string[]) => {
    setCoachInitialMuscles(initial?.length ? initial : null);
    setCoachOpen(true);
  };

  return (
    <section className="flex flex-col gap-4">
      <BodyMap mode="recovery" recoveryMap={recoveryMap} />

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

      <WorkoutProgressCharts
        topExercises={topExercises}
        histByName={histByName}
        prByName={prByName}
      />

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
