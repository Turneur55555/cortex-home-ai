import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getRewardTrophy } from "@/assets/rewards";
import { AnimatedNumber } from "@/components/fitness/AnimatedNumber";
import { MasteryBar } from "@/components/fitness/MasteryBar";
import { Confetti } from "@/components/fitness/session/WorkoutCelebration";
import {
  RANK_AMBIANCE,
  rankGlowShadow,
  rankTextGlow,
  rankThemeByKey,
} from "@/components/rpg/rankTheme";
import { useSessionReward } from "@/hooks/useSessionReward";
import { useCortexPowerTransition } from "@/hooks/useCortexPowerTransition";
import { Portal } from "@/components/Portal";
import { nextCortexGradeLabel } from "@/lib/fitness/rpg/cortexTitle";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Séquence de la célébration de montée de grade — purement présentationnelle
 * (aucun impact sur `titleTransition`, déjà calculé par la logique métier).
 * "next" est l'état stable final (et le seul état pour un gain d'XP sans
 * changement de grade) : jamais de barre de progression pendant les autres
 * phases, elle ne réapparaît qu'à la prochaine séance (nouvel écran).
 */
type CelebrationPhase =
  | "counting"
  | "charge"
  | "unlocked"
  | "transition"
  | "rankUnlocked"
  | "firstGrade"
  | "next";

const PHASE_DURATIONS: Partial<Record<CelebrationPhase, number>> = {
  counting: 950,
  charge: 650,
  unlocked: 900,
  transition: 1100,
  rankUnlocked: 900,
  firstGrade: 1100,
};

function Section({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Écran de récompense de fin de séance — UN SEUL écran premium, épuré comme
 * une récompense de RPG : l'illustration du rang, l'XP gagnée, la
 * progression vers le prochain grade. Le détail des sources d'XP reste
 * calculé (voir `useSessionReward`) mais n'est plus affiché ici — il
 * rejoindra une page d'historique dédiée.
 *
 * Lecture seule : toutes les valeurs viennent du serveur (xp_events /
 * user_stats via useSessionReward). Toutes les couleurs dynamiques
 * (halo, +XP, barre de progression, célébration de montée de grade)
 * suivent le `RankTheme` du rang courant — aucune palette propre à cet écran.
 *
 * Montée de grade (`titleTransition.gradeUp`) : remplace la barre de
 * progression par une petite cinématique en phases (compteur → charge →
 * révélation → objectif suivant), sans jamais montrer barre pleine puis
 * barre revenue à zéro. Un changement de Rang (pas seulement de Grade) va
 * plus loin : l'illustration change aussi, avec une étape « Nouveau rang »
 * dédiée avant le premier grade du nouveau rang.
 */
export function SessionRewardScreen({
  workoutId,
  onContinue,
}: {
  workoutId: string;
  title: string;
  onContinue: () => void;
  onViewAnalysis: () => void;
}) {
  const { totalXp, breakdown, hasXp } = useSessionReward(workoutId);
  const titleTransition = useCortexPowerTransition(workoutId);
  const afterRanked = titleTransition.after.status === "ranked" ? titleTransition.after : null;
  const beforeRanked = titleTransition.before.status === "ranked" ? titleTransition.before : null;
  const hasPr = breakdown.some((b) => b.source === "pr_muscu");
  const rankKey = afterRanked?.title.key ?? "mortel";
  const beforeRankKey = beforeRanked?.title.key ?? "mortel";
  const theme = rankThemeByKey(rankKey);
  const ambiance = RANK_AMBIANCE[rankKey];

  const gradeUp = titleTransition.gradeUp;
  const rankChanged = gradeUp && beforeRankKey !== rankKey;

  const steps = useMemo<CelebrationPhase[]>(() => {
    if (!gradeUp) return ["next"];
    return rankChanged
      ? ["counting", "charge", "rankUnlocked", "firstGrade", "next"]
      : ["counting", "charge", "unlocked", "transition", "next"];
  }, [gradeUp, rankChanged]);

  const [stepIndex, setStepIndex] = useState(0);
  const phase = steps[Math.min(stepIndex, steps.length - 1)];

  useEffect(() => {
    if (stepIndex >= steps.length - 1) return;
    const duration = PHASE_DURATIONS[steps[stepIndex]] ?? 800;
    const timer = setTimeout(() => setStepIndex((i) => i + 1), duration);
    return () => clearTimeout(timer);
  }, [stepIndex, steps]);

  const celebrating = gradeUp && phase !== "counting";
  const settled = !gradeUp || phase === "next";
  const displayedRankKey =
    rankChanged && (phase === "counting" || phase === "charge") ? beforeRankKey : rankKey;
  const trophySrc = getRewardTrophy(displayedRankKey);

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm">
        <Confetti />

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-[#161311] to-[#0b0a09] px-6 pb-6 pt-3"
          style={{ boxShadow: rankGlowShadow(theme.glow, -20, 80, -24) }}
        >
          {/* Halo d'ambiance */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-48"
            style={{
              background: `radial-gradient(120% 100% at 50% 0%, ${theme.glow} 0%, transparent 70%)`,
            }}
          />

          {/* Fond assombri pendant la célébration de montée de grade */}
          {gradeUp && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[28px] bg-black"
              initial={{ opacity: 0 }}
              animate={{ opacity: celebrating ? 0.32 : 0 }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          )}

          {/* Hero — illustration du rang */}
          <Section delay={0.05}>
            <div className="relative text-center">
              {trophySrc ? (
                <div className="relative mx-auto flex h-[300px] w-[300px] items-center justify-center">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-4 rounded-full blur-2xl"
                    style={{
                      background: `radial-gradient(circle, ${theme.glow} 0%, transparent 72%)`,
                    }}
                  />
                  {/* Effets du RankTheme (halo qui respire + éclat diagonal,
                    cadencés par RANK_AMBIANCE) pendant la célébration. */}
                  {celebrating && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
                      style={
                        {
                          "--rank-halo-duration": `${ambiance.haloDuration}s`,
                          "--rank-sweep-duration": `${ambiance.sweepDuration}s`,
                          "--primary-glow-soft": theme.glow,
                        } as React.CSSProperties
                      }
                    >
                      <div
                        className="absolute inset-0 animate-rank-breathe"
                        style={{
                          background: `radial-gradient(60% 60% at 50% 50%, ${theme.glow} 0%, transparent 75%)`,
                        }}
                      />
                      <div className="absolute inset-0 rank-glint-layer" />
                    </div>
                  )}
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={displayedRankKey}
                      src={trophySrc}
                      alt={`Récompense — ${afterRanked?.title.label ?? "Non classé"}`}
                      loading="eager"
                      decoding="async"
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{
                        opacity: 1,
                        scale: celebrating && !settled ? [1, 1.05, 1] : 1,
                      }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={
                        celebrating && !settled
                          ? {
                              scale: {
                                duration: ambiance.haloDuration / 2,
                                repeat: Infinity,
                                ease: "easeInOut",
                              },
                              opacity: { duration: 0.4 },
                            }
                          : { duration: 0.4, ease: EASE }
                      }
                      className="relative h-full w-full object-contain"
                      style={{
                        filter: `drop-shadow(0 16px 28px ${theme.glow})`,
                        WebkitMaskImage:
                          "radial-gradient(closest-side, black 82%, transparent 100%)",
                        maskImage: "radial-gradient(closest-side, black 82%, transparent 100%)",
                      }}
                    />
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-5xl">🏆</div>
              )}
              <h2 className="mt-1 text-lg font-bold tracking-tight text-white">
                Séance terminée !
              </h2>
            </div>
          </Section>

          {/* XP totale gagnée */}
          {hasXp && (
            <Section delay={0.15}>
              <div className="mt-4 text-center">
                <div
                  className="text-[44px] font-black leading-none tracking-tight"
                  style={{ color: theme.secondary, textShadow: rankTextGlow(theme.glow, 26) }}
                >
                  +<AnimatedNumber value={totalXp} /> XP
                </div>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  Expérience gagnée
                </p>
              </div>
            </Section>
          )}

          {/* Progression vers le prochain grade — OU célébration de montée de
            grade (jamais les deux : la barre disparaît complètement tant que
            la célébration joue). */}
          {gradeUp ? (
            <Section delay={0.32}>
              <div className="mt-5 min-h-[132px] rounded-2xl border border-white/8 bg-white/[0.03] p-5 text-center">
                <AnimatePresence mode="wait">
                  {(phase === "unlocked" || phase === "rankUnlocked") && (
                    <motion.div
                      key="unlocked"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.45, ease: EASE }}
                    >
                      <p
                        className="text-2xl font-black uppercase tracking-[0.08em]"
                        style={{ color: theme.secondary, textShadow: rankTextGlow(theme.glow, 22) }}
                      >
                        {phase === "rankUnlocked" ? "Nouveau rang" : "Grade débloqué"}
                      </p>
                      {phase === "rankUnlocked" && (
                        <p className="mt-1 text-3xl font-black uppercase tracking-wide text-white">
                          {afterRanked?.title.label ?? "Non classé"}
                        </p>
                      )}
                    </motion.div>
                  )}

                  {phase === "transition" && (
                    <motion.div
                      key="transition"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <motion.p
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0.35, scale: 0.9 }}
                        transition={{ delay: 0.35, duration: 0.5 }}
                        className="text-lg font-bold uppercase tracking-wide text-white/70"
                      >
                        {beforeRanked?.grade ?? "—"}
                      </motion.p>
                      <ArrowDown className="mx-auto my-1 h-4 w-4 text-white/30" />
                      <motion.p
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4, type: "spring", stiffness: 260, damping: 16 }}
                        className="text-3xl font-black uppercase tracking-wide"
                        style={{ color: theme.secondary, textShadow: rankTextGlow(theme.glow, 24) }}
                      >
                        {afterRanked?.grade}
                      </motion.p>
                    </motion.div>
                  )}

                  {phase === "firstGrade" && (
                    <motion.div
                      key="firstGrade"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.45, ease: EASE }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                        Premier grade
                      </p>
                      <motion.p
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 16 }}
                        className="mt-1 text-3xl font-black uppercase tracking-wide"
                        style={{ color: theme.secondary, textShadow: rankTextGlow(theme.glow, 24) }}
                      >
                        {afterRanked?.grade}
                      </motion.p>
                    </motion.div>
                  )}

                  {phase === "next" && (
                    <motion.div
                      key="next"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: EASE }}
                    >
                      {afterRanked?.isMax ? (
                        <p className="text-sm font-bold text-white/70">Grade suprême atteint</p>
                      ) : (
                        <>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                            Prochain objectif
                          </p>
                          <p className="mt-1 text-2xl font-black uppercase tracking-wide text-white">
                            {nextCortexGradeLabel(titleTransition.after)}
                          </p>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Section>
          ) : (
            <Section delay={0.28}>
              <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                {/* Puissance Cortex = palier discret (0-29), pas une valeur
                    continue comme l'XP : la barre reflète la position parmi
                    les 5 grades du Titre courant, pas une distance
                    fractionnaire au prochain grade (aucun compte à rebours
                    chiffré affiché — règle RPG). */}
                <MasteryBar
                  percent={
                    afterRanked?.isMax
                      ? 100
                      : (((afterRanked?.gradeIndex ?? 0) + 1) / 5) * 100
                  }
                  colors={theme}
                  segments={5}
                  height={10}
                  showLabel={false}
                />
                <p className="mt-2 text-right text-[10px] text-white/40">
                  {afterRanked?.isMax
                    ? "Grade suprême atteint"
                    : `Prochain grade : ${nextCortexGradeLabel(titleTransition.after)}`}
                </p>
              </div>
            </Section>
          )}

          {/* Record personnel */}
          {hasPr && (
            <Section delay={0.55}>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2.5">
                <Trophy className="h-4 w-4 shrink-0 text-amber-300" />
                <p className="text-xs font-semibold text-amber-100">
                  Nouveau record personnel dans cette séance !
                </p>
              </div>
            </Section>
          )}

          {/* CTA */}
          <Section delay={0.72}>
            <div className="mt-6">
              <button
                type="button"
                onClick={onContinue}
                className="w-full rounded-xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow"
              >
                Continuer
              </button>
            </div>
          </Section>
        </motion.div>
      </div>
    </Portal>
  );
}
