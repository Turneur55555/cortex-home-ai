import { useMemo, useState } from "react";
import {
  DoneSessionSheet,
  type LoggedDoneSession,
} from "@/components/fitness/session/DoneSessionSheet";
import { SessionRecapScreen } from "@/components/fitness/session/SessionRecapScreen";
import { SessionRewardScreen } from "@/components/fitness/session/SessionRewardScreen";
import { useWorkouts } from "@/hooks/use-fitness";
import { computeRecordsBySession } from "@/lib/fitness/chronicles";
import type { DoneSessionTarget } from "@/lib/fitness/doneSession";
import { buildSessionRecap } from "@/lib/fitness/rpg/sessionRecap";

/**
 * « Je l'ai faite », de bout en bout, depuis l'Accueil : la feuille de confirmation, puis
 * l'écran de récompense et la carte récap — LES MÊMES qu'à la clôture d'une séance en direct
 * (`SeancesTab`). Une séance saisie après coup méritait jusqu'ici un simple toast : c'était le
 * cas de six séances sur sept, et ce sera celui de la prochaine montée de grade.
 *
 * Les records de la carte récap viennent du système existant (`computeRecordsBySession`) —
 * jamais d'une nouvelle détection.
 */
export function DoneSessionFlow({
  target,
  onClose,
}: {
  target: DoneSessionTarget;
  onClose: () => void;
}) {
  const [logged, setLogged] = useState<LoggedDoneSession | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const { data: workouts } = useWorkouts();

  const prCount = useMemo(() => {
    if (!logged) return 0;
    const muscu = (workouts ?? []).filter(
      (w) => ((w.discipline as string | undefined) ?? "muscu") === "muscu",
    );
    return (computeRecordsBySession(muscu).get(logged.workoutId) ?? []).filter((r) => !r.isNew)
      .length;
  }, [logged, workouts]);

  if (!logged) {
    return <DoneSessionSheet target={target} onClose={onClose} onLogged={setLogged} />;
  }

  if (recapOpen) {
    const recap = buildSessionRecap(
      logged.payload.exercises.map((e, index) => ({
        id: `${logged.workoutId}-${index}`,
        name: e.name,
        image_path: e.imagePath,
        exercise_sets: e.sets,
      })),
    );
    return (
      <SessionRecapScreen
        recap={recap}
        date={new Date(`${logged.payload.date}T12:00:00`)}
        prCount={prCount}
        onFinish={onClose}
      />
    );
  }

  return (
    <SessionRewardScreen
      workoutId={logged.workoutId}
      title={logged.payload.name}
      onContinue={() => setRecapOpen(true)}
    />
  );
}
