// Adapter between domain MuscleId slugs and react-body-highlighter muscle slugs.
//
// RULE: this is the ONLY file where lib slugs appear in the codebase.
// Never in components, never in the domain.
// The domain has zero dependency on this file or on the lib.

import type { MuscleId } from "../muscleMapping";
import type { MuscleRecovery, RecoveryStatus } from "../recovery";

// String alias — keeps this file independent of the renderer lib.
type LibMuscleSlug = string;

// ─── Slug mapping ─────────────────────────────────────────────────────────────

// Covers all 14 MuscleId values — TypeScript enforces complete coverage.
// If a new MuscleId is added to muscleMapping.ts without being added here,
// the build fails.
export const MUSCLE_TO_LIB_SLUG: Record<MuscleId, LibMuscleSlug | LibMuscleSlug[]> = {
  pectoraux:   "chest",
  dos:         "upper-back",
  epaules:     ["front-deltoids", "back-deltoids"],
  biceps:      "biceps",
  triceps:     "triceps",
  abdos:       "abs",
  obliques:    "obliques",
  quadriceps:  "quadriceps",
  ischio:      "hamstring",
  fessiers:    "gluteal",
  mollets:     "calves",
  trapeze:     "trapezius",
  "avant-bras":"forearm",
  lombaires:   "lower-back",
};

// Inverse — lib slug → MuscleId (partial: the lib has muscles not in our domain).
// Used to translate onClick callbacks back to domain types.
export const LIB_SLUG_TO_MUSCLE: Partial<Record<LibMuscleSlug, MuscleId>> =
  (Object.entries(MUSCLE_TO_LIB_SLUG) as Array<[MuscleId, LibMuscleSlug | LibMuscleSlug[]]>)
    .reduce((acc, [muscleId, slugs]) => {
      const list = Array.isArray(slugs) ? slugs : [slugs];
      for (const slug of list) acc[slug] = muscleId;
      return acc;
    }, {} as Record<LibMuscleSlug, MuscleId>);

// ─── Recovery → lib data ──────────────────────────────────────────────────────

// The lib colors a muscle by highlightedColors[frequency - 1].
// Map recovery status to the frequency index that represents it visually:
//   frequency 1 → highlightedColors[0] → ready   (green)
//   frequency 2 → highlightedColors[1] → recovering (orange)
//   frequency 3 → highlightedColors[2] → fatigued (red)
//   null → muscle omitted → shows default body color (unknown)
const STATUS_TO_FREQUENCY: Record<RecoveryStatus, number | null> = {
  ready:      1,
  recovering: 2,
  fatigued:   3,
  unknown:    null,
};

export type LibExerciseData = {
  name: string;
  muscles: LibMuscleSlug[];
  frequency: number;
};

// Transforms the domain Map<MuscleId, MuscleRecovery> into the array format
// expected by the react-body-highlighter <Model data={...} /> prop.
export function recoveryMapToLibData(
  recoveryMap: Map<MuscleId, MuscleRecovery>,
): LibExerciseData[] {
  const result: LibExerciseData[] = [];

  for (const [muscleId, recovery] of recoveryMap) {
    const frequency = STATUS_TO_FREQUENCY[recovery.status];
    if (frequency === null) continue; // show default body color for unknown muscles

    const raw = MUSCLE_TO_LIB_SLUG[muscleId];
    const muscles = Array.isArray(raw) ? raw : [raw];

    result.push({ name: muscleId, muscles, frequency });
  }

  return result;
}
