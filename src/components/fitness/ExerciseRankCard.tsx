import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Share2 } from "lucide-react";
import { ExerciseRankBadge } from "./ExerciseRankBadge";
import { RankAmbientParticles } from "./RankAmbientParticles";
import { MasteryBar } from "./MasteryBar";
import { RankUpOverlay } from "./RankUpOverlay";
import { ExerciseRankShareSheet } from "./ExerciseRankShareSheet";
import { useAuth } from "@/hooks/use-auth";
import { useExerciseProgression } from "@/hooks/useExerciseProgression";
import { useAwardExerciseRankUp } from "@/hooks/useAwardExerciseRankUp";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
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

/**
 * Tuile "trophée" — un chiffre monumental + unité + label.
 * Verre subtil, liseré couleur du rang optionnel.
 */
function TrophyTile({
  value,
  unit,
  label,
  colors,
  featured = false,
}: {
  value: string | number;
  unit: string;
  label: string;
  colors: { primary: string; secondary: string; glow: string };
  featured?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-2.5 text-center"
      style={{
        background:
          "linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)",
        boxShadow: featured
          ? `inset 0 0 0 1px ${colors.primary}55, 0 6px 20px -8px ${colors.glow}`
          : "inset 0 0 0 1px rgba(255,255,255,0.06)",
        backdropFilter: "blur(6px)",
      }}
    >
      {featured && (
        <div
          className="pointer-events-none absolute -inset-px rounded-xl"
          style={{
            background: `linear-gradient(140deg, ${colors.primary}20, transparent 60%)`,
          }}
        />
      )}
      <div
        className="relative font-serif text-2xl leading-none font-bold tracking-tight"
        style={{ color: featured ? colors.secondary : "#f5f5f4" }}
      >
        {value}
      </div>
      <div className="relative mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white/55">
        {unit}
      </div>
      <div className="relative mt-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
    </div>
  );
}

export function ExerciseRankCard({ exerciseName }: { exerciseName: string }) {
  const { user } = useAuth();
  const { rank, masteryPercent, nextRankHint, best, sessionCount, bodyweightKnown, isLoading } =
    useExerciseProgression(exerciseName);
  const [rankUp, setRankUp] = useState<RankState | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const initialisedRef = useRef(false);
  const awardRankUp = useAwardExerciseRankUp();

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
      awardRankUp.mutate({ titreKey: rank.rank.key, exerciseName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rank.tierIndex, isLoading, sessionCount, exerciseName, rank, user]);

  const { colors } = rank.rank;
  const visual = getRankVisual(rank.rank.key);

  if (sessionCount === 0 && !isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-surface/60 p-4 text-center text-xs text-muted-foreground">
        Enregistre ta première série pour démarrer la progression RPG.
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: visual.atmosphere,
          boxShadow: `inset 0 0 0 1px ${visual.vignette}, 0 10px 40px -20px ${colors.glow}`,
        }}
      >
        {/* Particules ambiantes */}
        <RankAmbientParticles rankKey={rank.rank.key} />

        {/* Vignettage haut/bas pour la profondeur */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 60% at 50% 100%, rgba(0,0,0,0.55) 0%, transparent 70%)",
          }}
        />

        {/* Contenu */}
        <div className="relative p-5">
          {/* Badge + titre */}
          <div className="flex flex-col items-center pt-2">
            <ExerciseRankBadge rank={rank} size={104} />

            <div className="mt-4 text-center">
              <p
                className="text-[9px] font-bold uppercase tracking-[0.4em]"
                style={{ color: colors.secondary, opacity: 0.85 }}
              >
                Rang
              </p>
              <h3
                className="mt-1 font-serif text-[26px] font-bold uppercase leading-none tracking-[0.18em]"
                style={{
                  color: colors.text,
                  textShadow: `0 0 18px ${colors.glow}, 0 1px 0 rgba(0,0,0,0.4)`,
                }}
              >
                {rank.rank.label}{" "}
                <span style={{ color: colors.secondary }}>{rank.romanLevel}</span>
              </h3>
              <div
                className="mx-auto mt-2 h-px w-24"
                style={{
                  background: `linear-gradient(90deg, transparent, ${colors.secondary}aa, transparent)`,
                }}
              />
              <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-white/50">
                {sessionCount} séance{sessionCount > 1 ? "s" : ""} · {visual.ambiance}
              </p>
            </div>
          </div>

          {/* Barre de Maîtrise */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em]">
              <span className="text-white/60">Maîtrise</span>
              <span style={{ color: colors.secondary }}>
                {rank.isMax ? "Rang max" : `${Math.round(masteryPercent)}%`}
              </span>
            </div>
            <MasteryBar
              percent={masteryPercent}
              colors={{
                gradient: colors.gradient,
                primary: colors.primary,
                secondary: colors.secondary,
                glow: colors.glow,
              }}
            />
          </div>

          {/* Trophy block */}
          {best.weight > 0 && (
            <div className="mt-6 grid grid-cols-3 gap-2">
              <TrophyTile
                value={best.weight}
                unit="kg"
                label="PR"
                colors={colors}
                featured
              />
              <TrophyTile
                value={`×${best.reps}`}
                unit="reps"
                label="Meilleure série"
                colors={colors}
              />
              <TrophyTile
                value={best.oneRM > 0 ? Math.round(best.oneRM) : "—"}
                unit="kg"
                label="1RM est."
                colors={colors}
              />
            </div>
          )}

          {/* Hint prochain rang */}
          {!rank.isMax && nextRankHint && (
            <div
              className="mt-5 flex items-start gap-2 rounded-xl p-3"
              style={{
                background: "linear-gradient(180deg,rgba(0,0,0,0.35),rgba(0,0,0,0.15))",
                boxShadow: `inset 0 0 0 1px ${colors.primary}30`,
              }}
            >
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: colors.secondary }} />
              <span className="text-[11.5px] leading-relaxed text-white/85">{nextRankHint}</span>
            </div>
          )}

          {!bodyweightKnown && (
            <p className="mt-3 text-center text-[10px] text-white/40">
              Renseigne ton poids de corps dans Corps pour un rang précis.
            </p>
          )}

          {/* Share */}
          <button
            onClick={() => setShareOpen(true)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] font-bold uppercase tracking-[0.22em] transition-transform active:scale-[0.98]"
            style={{
              background: `linear-gradient(180deg, ${colors.primary}30, ${colors.primary}10)`,
              color: colors.text,
              boxShadow: `inset 0 0 0 1px ${colors.primary}55, 0 6px 22px -12px ${colors.glow}`,
            }}
          >
            <Share2 className="h-3.5 w-3.5" />
            Partager mon rang
          </button>
        </div>
      </motion.div>

      <RankUpOverlay rank={rankUp} onDone={() => setRankUp(null)} />

      {shareOpen && (
        <ExerciseRankShareSheet
          exerciseName={exerciseName}
          rank={rank}
          masteryPercent={masteryPercent}
          best={best}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}
