import { motion } from "framer-motion";
import { ArrowUp, Trophy } from "lucide-react";
import { getRewardTrophy } from "@/assets/rewards";
import { AnimatedNumber } from "@/components/fitness/AnimatedNumber";
import { MasteryBar } from "@/components/fitness/MasteryBar";
import { Confetti } from "@/components/fitness/session/WorkoutCelebration";
import { rankGlowShadow, rankTextGlow, rankThemeByKey } from "@/components/rpg/rankTheme";
import { useSessionReward } from "@/hooks/useSessionReward";
import { buildTitleTransition } from "@/lib/fitness/rpg/sessionReward";
import { nextGradeLabel } from "@/lib/fitness/rpg/titleProgress";

const EASE = [0.22, 1, 0.36, 1] as const;

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
 * (halo, +XP, barre de progression) suivent le `RankTheme` du rang courant —
 * aucune palette propre à cet écran.
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
  const { totalXp, breakdown, level, hasXp } = useSessionReward(workoutId);
  const titleTransition = buildTitleTransition(level.xpBefore, level.xpAfter);
  const hasPr = breakdown.some((b) => b.source === "pr_muscu");
  const rankKey = titleTransition.after.title.key;
  const theme = rankThemeByKey(rankKey);
  const trophySrc = getRewardTrophy(rankKey);

  return (
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
                <img
                  src={trophySrc}
                  alt={`Récompense — ${titleTransition.after.title.label}`}
                  loading="eager"
                  decoding="async"
                  className="relative h-full w-full object-contain"
                  style={{
                    filter: `drop-shadow(0 16px 28px ${theme.glow})`,
                    WebkitMaskImage: "radial-gradient(closest-side, black 82%, transparent 100%)",
                    maskImage: "radial-gradient(closest-side, black 82%, transparent 100%)",
                  }}
                />
              </div>
            ) : (
              <div className="text-5xl">🏆</div>
            )}
            <h2 className="mt-1 text-lg font-bold tracking-tight text-white">Séance terminée !</h2>
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

        {/* Progression vers le prochain grade */}
        <Section delay={0.28}>
          <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            {titleTransition.gradeUp && (
              <div className="mb-2 flex justify-end">
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.7, type: "spring", stiffness: 320, damping: 14 }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black text-black"
                  style={{
                    background: theme.secondary,
                    boxShadow: rankGlowShadow(theme.glow, 0, 18, 0),
                  }}
                >
                  <ArrowUp className="h-3 w-3" />
                  NOUVEAU GRADE
                </motion.span>
              </div>
            )}
            <MasteryBar
              percent={
                titleTransition.after.isMax
                  ? 100
                  : ((titleTransition.after.xp - titleTransition.after.xpCurrentThreshold) /
                      Math.max(
                        1,
                        (titleTransition.after.xpNextThreshold ??
                          titleTransition.after.xpCurrentThreshold) -
                          titleTransition.after.xpCurrentThreshold,
                      )) *
                    100
              }
              colors={theme}
              segments={5}
              height={10}
              showLabel={false}
            />
            <p className="mt-2 text-right text-[10px] text-white/40">
              {titleTransition.gradeUp
                ? `${titleTransition.before.grade} → ${titleTransition.after.grade}`
                : titleTransition.after.isMax
                  ? "Grade suprême atteint"
                  : `Encore ${titleTransition.after.xpToNext} XP avant ${nextGradeLabel(titleTransition.after)}`}
            </p>
          </div>
        </Section>

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
  );
}
