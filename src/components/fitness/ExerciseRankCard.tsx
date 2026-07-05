import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Trophy } from "lucide-react";
import { ExerciseRankBadge } from "./ExerciseRankBadge";
import { RankUpOverlay } from "./RankUpOverlay";
import { useAuth } from "@/hooks/use-auth";
import { useExerciseProgression } from "@/hooks/useExerciseProgression";
import type { RankState } from "@/lib/fitness/exerciseRanks";

const STORAGE_PREFIX = "exrank:seen:";

function loadSeen(userId: string, exerciseName: string): number | null {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + userId + ":" + exerciseName);
    return v == null ? null : parseInt(v, 10);
  } catch { return null; }
}
function saveSeen(userId: string, exerciseName: string, tierIndex: number) {
  try { localStorage.setItem(STORAGE_PREFIX + userId + ":" + exerciseName, String(tierIndex)); }
  catch { /* noop */ }
}

export function ExerciseRankCard({ exerciseName }: { exerciseName: string }) {
  const { user } = useAuth();
  const { rank, masteryPercent, nextRankHint, best, sessionCount, bodyweightKnown, isLoading } =
    useExerciseProgression(exerciseName);
  const [rankUp, setRankUp] = useState<RankState | null>(null);
  const initialisedRef = useRef(false);

  // Détection level-up sur la vie de la carte
  useEffect(() => {
    if (isLoading || sessionCount === 0 || !user) return;
    const seen = loadSeen(user.id, exerciseName);
    if (!initialisedRef.current) {
      initialisedRef.current = true;
      if (seen == null) {
        saveSeen(user.id, exerciseName, rank.tierIndex);
        return;
      }
    }
    if (seen != null && rank.tierIndex > seen) {
      setRankUp(rank);
      saveSeen(user.id, exerciseName, rank.tierIndex);
    }
  }, [rank.tierIndex, isLoading, sessionCount, exerciseName, rank, user]);

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
              {sessionCount} séance{sessionCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Barre de Maîtrise */}
        <div className="relative mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold">
            <span className="text-white/70">Maîtrise</span>
            <span style={{ color: colors.secondary }}>
              {rank.isMax ? "Rang maximum" : `${masteryPercent} %`}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${masteryPercent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: colors.gradient, boxShadow: `0 0 12px ${colors.glow}` }}
            />
          </div>
        </div>

        {/* Message vers le rang suivant */}
        {!rank.isMax && nextRankHint && (
          <div className="relative mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
            <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: colors.primary }} />
            <span className="text-[11px] text-white/85">{nextRankHint}</span>
          </div>
        )}

        {!bodyweightKnown && (
          <p className="relative mt-3 text-[10px] text-white/40">
            Renseigne ton poids de corps dans Corps pour un rang précis.
          </p>
        )}

        {/* Records rapides */}
        {best.weight > 0 && (
          <div className="relative mt-3 flex items-center justify-between text-[10px] text-white/60">
            <span className="flex items-center gap-1">
              <Trophy className="h-3 w-3" style={{ color: colors.secondary }} />
              PR {best.weight} kg × {best.reps}
            </span>
            {best.oneRM > 0 && <span>1RM {Math.round(best.oneRM)} kg</span>}
            {best.tonnage > 0 && <span>Vol. {Math.round(best.tonnage)} kg</span>}
          </div>
        )}
      </div>

      <RankUpOverlay rank={rankUp} onDone={() => setRankUp(null)} />
    </>
  );
}
