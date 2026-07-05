import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Target, Trophy } from "lucide-react";
import { ExerciseRankBadge } from "./ExerciseRankBadge";
import { RankUpOverlay } from "./RankUpOverlay";
import { useExerciseProgression } from "@/hooks/useExerciseProgression";
import type { RankState } from "@/lib/fitness/exerciseRanks";

const STORAGE_PREFIX = "exrank:seen:";

function loadSeen(exerciseName: string): number | null {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + exerciseName);
    return v == null ? null : parseInt(v, 10);
  } catch { return null; }
}
function saveSeen(exerciseName: string, tierIndex: number) {
  try { localStorage.setItem(STORAGE_PREFIX + exerciseName, String(tierIndex)); }
  catch { /* noop */ }
}

export function ExerciseRankCard({ exerciseName }: { exerciseName: string }) {
  const { rank, objectives, sessionCount, progression, isLoading } =
    useExerciseProgression(exerciseName);
  const [rankUp, setRankUp] = useState<RankState | null>(null);
  const initialisedRef = useRef(false);

  // Détection level-up sur la vie de la carte
  useEffect(() => {
    if (isLoading || sessionCount === 0) return;
    const seen = loadSeen(exerciseName);
    if (!initialisedRef.current) {
      initialisedRef.current = true;
      if (seen == null) {
        saveSeen(exerciseName, rank.tierIndex);
        return;
      }
    }
    if (seen != null && rank.tierIndex > seen) {
      setRankUp(rank);
      saveSeen(exerciseName, rank.tierIndex);
    }
  }, [rank.tierIndex, isLoading, sessionCount, exerciseName, rank]);

  const { colors } = rank.rank;

  if (sessionCount === 0 && !isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-surface/60 p-4 text-center text-xs text-muted-foreground">
        Enregistre ta première série pour démarrer la progression RPG.
      </div>
    );
  }

  return (
    <>
      <div
        className="relative overflow-hidden rounded-2xl border p-4"
        style={{
          borderColor: colors.primary + "55",
          background: `radial-gradient(circle at 15% 20%, ${colors.primary}22, transparent 65%), linear-gradient(180deg, #0b0b0f 0%, #050507 100%)`,
        }}
      >
        {/* motifs de fond subtils */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 90% 10%, ${colors.secondary}55, transparent 40%)`,
          }}
        />

        <div className="relative flex items-center gap-4">
          <ExerciseRankBadge rank={rank} size={78} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: colors.secondary }}>
              Rang · {rank.rank.label}
            </p>
            <h3 className="mt-0.5 font-serif text-xl font-bold" style={{ color: colors.text }}>
              {rank.fullName}
            </h3>
            <p className="mt-0.5 text-[11px] text-white/60">
              {rank.xp.toLocaleString("fr-FR")} XP · {sessionCount} séance{sessionCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Barre de progression */}
        <div className="relative mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold">
            <span className="text-white/70">
              {rank.currentTierXp} / {rank.nextTierXp} XP
            </span>
            <span style={{ color: colors.secondary }}>
              {rank.isMax ? "Rang maximum" : `${Math.round(rank.progress * 100)} %`}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${rank.progress * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: colors.gradient, boxShadow: `0 0 12px ${colors.glow}` }}
            />
          </div>
          {!rank.isMax && (
            <p className="mt-1.5 text-[10px] text-white/50">
              Encore {rank.xpToNext.toLocaleString("fr-FR")} XP jusqu'au prochain palier
            </p>
          )}
        </div>

        {/* Objectifs pour le niveau suivant */}
        {!rank.isMax && objectives.length > 0 && (
          <div className="relative mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" style={{ color: colors.secondary }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.secondary }}>
                Pour atteindre le prochain palier
              </span>
            </div>
            <ul className="space-y-1">
              {objectives.map((o, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px] text-white/85">
                  <Sparkles className="h-3 w-3 shrink-0" style={{ color: colors.primary }} />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Records rapides */}
        {progression && progression.best.weight > 0 && (
          <div className="relative mt-3 flex items-center justify-between text-[10px] text-white/60">
            <span className="flex items-center gap-1">
              <Trophy className="h-3 w-3" style={{ color: colors.secondary }} />
              PR {progression.best.weight} kg × {progression.best.reps}
            </span>
            {progression.best.oneRM > 0 && (
              <span>1RM {Math.round(progression.best.oneRM)} kg</span>
            )}
            {progression.best.tonnage > 0 && (
              <span>Vol. {Math.round(progression.best.tonnage)} kg</span>
            )}
          </div>
        )}
      </div>

      <RankUpOverlay rank={rankUp} onDone={() => setRankUp(null)} />
    </>
  );
}
