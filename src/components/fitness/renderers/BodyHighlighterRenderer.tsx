// Thin wrapper kept for import compatibility — all logic lives in BodyMap.
import { BodyMap } from "@/components/fitness/BodyMap";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";

interface Props {
  recoveryMap: Map<MuscleId, MuscleRecovery>;
  onMuscleClick?: (muscle: MuscleId) => void;
}

export function BodyHighlighterRenderer({ recoveryMap, onMuscleClick }: Props) {
  return <BodyMap mode="recovery" recoveryMap={recoveryMap} onMuscleClick={onMuscleClick} />;
}
