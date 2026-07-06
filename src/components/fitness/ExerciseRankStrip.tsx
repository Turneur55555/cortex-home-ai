import { useState } from "react";
import { motion } from "framer-motion";
import { Swords } from "lucide-react";
import { ExerciseRankBadge } from "./ExerciseRankBadge";
import { ExerciseAnalysisSheet } from "./ExerciseAnalysisSheet";
import { useExerciseProgression } from "@/hooks/useExerciseProgression";
import { normalize } from "@/lib/fitness/exerciseCatalog";

function MiniRankTile({
  exerciseName,
  displayName,
  onOpen,
  histByName,
  volByName,
  prByName,
}: {
  exerciseName: string;
  displayName: string;
  onOpen: (name: string) => void;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
}) {
  const { rank, sessionCount } = useExerciseProgression(exerciseName);
  const { colors } = rank.rank;
  void histByName; void volByName; void prByName;

  return (
    <button
      onClick={() => onOpen(exerciseName)}
      className="flex w-[150px] shrink-0 flex-col items-center gap-2 rounded-2xl border p-3 text-left transition-transform hover:scale-[1.02]"
      style={{
        borderColor: colors.primary + "55",
        background: `linear-gradient(180deg, ${colors.primary}15 0%, transparent 60%), #0b0b0f`,
      }}
    >
      <ExerciseRankBadge rank={rank} size={64} />
      <div className="w-full text-center">
        <p className="truncate text-[10px] font-semibold text-white/70">{displayName}</p>
        <p className="mt-0.5 font-serif text-xs font-bold" style={{ color: colors.text }}>
          {rank.fullName}
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${rank.progress * 100}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: colors.gradient }}
          />
        </div>
        <p className="mt-1 text-[9px] text-white/40">
          {sessionCount} séance{sessionCount > 1 ? "s" : ""}
        </p>
      </div>
    </button>
  );
}

export function ExerciseRankStrip({
  topExercises,
  nameByKey,
  histByName,
  volByName,
  prByName,
}: {
  topExercises: string[]; // clés normalisées
  nameByKey: Map<string, string>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
}) {
  const [openExercise, setOpenExercise] = useState<string | null>(null);

  if (topExercises.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Swords className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Progression RPG</h3>
        <span className="text-[10px] text-muted-foreground">
          Chaque exercice a son propre rang
        </span>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {topExercises.map((key) => {
          const display = nameByKey.get(key) ?? key;
          return (
            <MiniRankTile
              key={key}
              exerciseName={display}
              displayName={display}
              onOpen={setOpenExercise}
              histByName={histByName}
              volByName={volByName}
              prByName={prByName}
            />
          );
        })}
      </div>

      {openExercise && (
        <ExerciseAnalysisSheet
          exerciseName={openExercise}
          weightHistory={histByName.get(normalize(openExercise)) ?? []}
          volumeHistory={volByName.get(normalize(openExercise)) ?? []}
          pr={prByName.get(normalize(openExercise))}
          onClose={() => setOpenExercise(null)}
        />
      )}
    </div>
  );
}
