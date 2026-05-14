// Domain facade — single entry point for all fitness domain exports.
// Consumers may import from here or from the individual files directly.

export type { MuscleId } from "./muscleMapping";
export { MUSCLE_META, exerciseToMuscles } from "./muscleMapping";

export type { RecoveryStatus, MuscleRecovery, Workout } from "./recovery";
export {
  computeRecovery,
  RECOVERY_COLORS,
  RECOVERY_LABELS,
  RECOVERY_LEGEND,
} from "./recovery";
