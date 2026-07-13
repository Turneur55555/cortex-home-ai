import { useState } from "react";
import { motion } from "framer-motion";
import { ExerciseRankBadge } from "./ExerciseRankBadge";
import { ExerciseAnalysisSheet } from "./ExerciseAnalysisSheet";
import { useExerciseProgression } from "@/hooks/useExerciseProgression";

function MiniRankTile({
  exerciseKey,
  exerciseName,
  displayName,
  onOpen,
  histByName,
  volByName,
  prByName,
  fixedWidth,
}: {
  /** Clé identityKey (id-priority) — utilisée pour retrouver hist/vol/PR,
   *  jamais reconstruite par re-normalisation du nom affiché (Étape 4.6). */
  exerciseKey: string;
  exerciseName: string;
  displayName: string;
  onOpen: (key: string) => void;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
  fixedWidth: boolean;
}) {
  const { rank, sessionCount } = useExerciseProgression(exerciseName);
  const { colors } = rank.rank;
  void histByName;
  void volByName;
  void prByName;

  return (
    <button
      onClick={() => onOpen(exerciseKey)}
      className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-left transition-transform hover:scale-[1.02] ${
        fixedWidth ? "w-[150px] shrink-0" : "w-full"
      }`}
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
  layout = "carousel",
}: {
  topExercises: string[]; // clés normalisées
  nameByKey: Map<string, string>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
  /** "carousel" (défaut, historique) : rangée qui défile horizontalement.
   *  "grid" : grille pleine largeur — pour un écran dédié qui liste des
   *  dizaines/centaines de maîtrises sans logique de swipe. */
  layout?: "carousel" | "grid";
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (topExercises.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 shadow-card backdrop-blur-xl">
      <div
        className={
          layout === "grid"
            ? "grid grid-cols-2 gap-2 sm:grid-cols-3"
            : "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        }
      >
        {topExercises.map((key) => {
          const display = nameByKey.get(key) ?? key;
          return (
            <MiniRankTile
              key={key}
              exerciseKey={key}
              exerciseName={display}
              displayName={display}
              onOpen={setOpenKey}
              histByName={histByName}
              volByName={volByName}
              prByName={prByName}
              fixedWidth={layout === "carousel"}
            />
          );
        })}
      </div>

      {openKey && (
        <ExerciseAnalysisSheet
          exerciseName={nameByKey.get(openKey) ?? openKey}
          weightHistory={histByName.get(openKey) ?? []}
          volumeHistory={volByName.get(openKey) ?? []}
          pr={prByName.get(openKey)}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}
