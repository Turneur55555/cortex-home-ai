import { exerciseToMuscles, MUSCLE_META, type MuscleId } from "./muscleMapping";

export type RecoveryStatus = "fatigued" | "recovering" | "ready" | "unknown";

export type MuscleRecovery = {
  id: MuscleId;
  label: string;
  status: RecoveryStatus;
  lastTrained: Date | null;
  hoursSinceLast: number | null;
  recoveryWindowHours: number;
  hoursRemaining: number | null;
};

export type Workout = {
  date: string;
  exercises: Array<{ name: string }> | null;
};

export function computeRecovery(
  workouts: Workout[],
  now: Date = new Date(),
): Map<MuscleId, MuscleRecovery> {
  const lastTrainedMap = new Map<MuscleId, Date>();

  for (const w of workouts) {
    const wDate = new Date(w.date + "T12:00:00");
    for (const ex of w.exercises ?? []) {
      const muscles = exerciseToMuscles(ex.name);
      for (const m of muscles) {
        const prev = lastTrainedMap.get(m);
        if (!prev || wDate > prev) {
          lastTrainedMap.set(m, wDate);
        }
      }
    }
  }

  const result = new Map<MuscleId, MuscleRecovery>();

  for (const [id, meta] of Object.entries(MUSCLE_META) as Array<[MuscleId, typeof MUSCLE_META[MuscleId]]>) {
    const lastTrained = lastTrainedMap.get(id) ?? null;

    if (!lastTrained) {
      result.set(id, {
        id,
        label: meta.label,
        status: "unknown",
        lastTrained: null,
        hoursSinceLast: null,
        recoveryWindowHours: meta.recoveryHours,
        hoursRemaining: null,
      });
      continue;
    }

    const hoursSince = (now.getTime() - lastTrained.getTime()) / (1000 * 60 * 60);
    const hoursRemaining = Math.max(0, meta.recoveryHours - hoursSince);

    let status: RecoveryStatus;
    if (hoursSince < 48) {
      status = "fatigued";
    } else if (hoursSince < meta.recoveryHours) {
      status = "recovering";
    } else {
      status = "ready";
    }

    result.set(id, {
      id,
      label: meta.label,
      status,
      lastTrained,
      hoursSinceLast: Math.round(hoursSince),
      recoveryWindowHours: meta.recoveryHours,
      hoursRemaining: Math.round(hoursRemaining),
    });
  }

  return result;
}

export const RECOVERY_COLORS: Record<RecoveryStatus, {
  fill: string;    // with alpha — SVG muscle fill
  stroke: string;  // solid — SVG muscle outline + legend dot
}> = {
  fatigued:  { fill: "#EF444433", stroke: "#EF4444" },
  recovering:{ fill: "#F9731633", stroke: "#F97316" },
  ready:     { fill: "#22C55E33", stroke: "#22C55E" },
  unknown:   { fill: "#1F293700", stroke: "#374151" },
};

export const RECOVERY_LABELS: Record<RecoveryStatus, string> = {
  fatigued: "Fatigué",
  recovering: "En récup",
  ready: "Prêt",
  unknown: "Inconnu",
};
