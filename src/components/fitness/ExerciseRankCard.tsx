import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Share2 } from "lucide-react";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { rankRingInset, rankSurfaceShadow, rankTextGlow } from "@/components/rpg/rankTheme";
import { MasteryBar } from "./MasteryBar";
import { RankUpOverlay } from "./RankUpOverlay";
import { ExerciseRankShareSheet } from "./ExerciseRankShareSheet";
import { useAuth } from "@/hooks/use-auth";
import { useExerciseProgression } from "@/hooks/useExerciseProgression";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { gradeName } from "@/lib/fitness/rpg/grade";

const STORAGE_PREFIX = "exrank:seen:";

function loadSeen(userId: string, exerciseName: string): number | null {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + userId + ":" + exerciseName);
    return v == null ? null : parseInt(v, 10);
  } catch {
    return null;
  }
}
function saveSeen(userId: string, exerciseName: string, tierIndex: number) {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId + ":" + exerciseName, String(tierIndex));
  } catch {
    /* noop */
  }
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
        background: "linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)",
        boxShadow: featured
          ? rankSurfaceShadow(colors, { ringAlpha: "55", y: 6, blur: 20, spread: -8 })
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

  // Détection PUREMENT visuelle (déclenche l'animation RankUpOverlay). L'XP
  // est versée automatiquement à la clôture de séance
  // (`useVerifyExerciseRanksForSession`), jamais depuis cette carte — la
  // fiche exercice reste un simple affichage.
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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative isolate overflow-hidden rounded-2xl bg-[#0b0b0f]"
        style={{
          boxShadow: rankSurfaceShadow(colors, { y: 10, blur: 40, spread: -20 }),
          // Force sa propre couche de composition GPU : évite un bug de rendu
          // WebKit/Safari où des coins arrondis + overflow imbriqués sous un
          // ancêtre `backdrop-filter` (le sheet de la fiche d'exercice) se
          // peignent en noir plein au lieu du contenu réel.
          transform: "translateZ(0)",
        }}
      >
        {/* Contenu */}
        <div className="relative p-5">
          {/* Illustration officielle du rang — même signature visuelle que la
              carte d'accueil (RankIllustration, ratio 4:5 intégral, disque +
              titre gravé jamais recadrés), simplement mise à l'échelle de la
              carte plutôt que plein écran. */}
          <div className="flex flex-col items-center pt-2">
            <div className="relative aspect-[4/5] w-full max-w-[220px] overflow-hidden rounded-[22px] shadow-elevated">
              <RankIllustration
                rankKey={rank.rank.key}
                label={rank.rank.label}
                className="absolute inset-0 h-full w-full"
              />
            </div>

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
                  textShadow: rankTextGlow(colors.glow, 18, "0 1px 0 rgba(0,0,0,0.4)"),
                }}
              >
                {gradeName(rank.rank.key, rank.levelInRank)}
              </h3>
              <div
                className="mx-auto mt-2 h-px w-24"
                style={{
                  background: `linear-gradient(90deg, transparent, ${colors.secondary}aa, transparent)`,
                }}
              />
              <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-white/50">
                {sessionCount} séance{sessionCount > 1 ? "s" : ""}
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
              <TrophyTile value={best.weight} unit="kg" label="PR" colors={colors} featured />
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
                boxShadow: rankRingInset(colors.primary),
              }}
            >
              <Sparkles
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{ color: colors.secondary }}
              />
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
              boxShadow: rankSurfaceShadow(colors, {
                ringAlpha: "55",
                y: 6,
                blur: 22,
                spread: -12,
              }),
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
