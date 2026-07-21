import { motion } from "framer-motion";
import {
  Activity,
  ArrowUp,
  Dumbbell,
  Flame,
  Medal,
  Sparkles,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { AnimatedNumber } from "@/components/fitness/AnimatedNumber";
import { MasteryBar } from "@/components/fitness/MasteryBar";
import { Confetti } from "@/components/fitness/session/WorkoutCelebration";
import { useSessionReward } from "@/hooks/useSessionReward";
import { buildTitleTransition } from "@/lib/fitness/rpg/sessionReward";
import { nextGradeLabel } from "@/lib/fitness/rpg/titleProgress";
import { useBadgeHighlights } from "@/hooks/useBadgeHighlights";
import { RARITY_COLORS, RARITY_LABELS, type BadgeRarity } from "@/lib/fitness/badges";

// Palette "trésor" dédiée à l'XP — le Niveau est la colonne vertébrale, la
// récompense se lit en or/ambre (distinct des couleurs de rang mythologique).
const XP_COLORS = {
  gradient: "linear-gradient(90deg,#b45309 0%,#f59e0b 55%,#fcd34d 100%)",
  primary: "#f59e0b",
  secondary: "#fcd34d",
  glow: "rgba(245,158,11,0.55)",
};

const ICONS: Record<string, LucideIcon> = {
  Dumbbell,
  Trophy,
  Flame,
  Activity,
  Medal,
  Target,
  Sparkles,
};

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
 * Écran de récompense de fin de séance — UN SEUL écran premium qui récapitule
 * la progression RPG obtenue pendant la séance (XP gagnée + détail des
 * sources, montée de niveau, record, badge). Pas de succession de pop-ups :
 * le bilan IA détaillé devient opt-in via « Voir le bilan ».
 *
 * Lecture seule : toutes les valeurs viennent du serveur (xp_events /
 * user_stats via useSessionReward, badges via useBadgeHighlights). Règle
 * « donnée absente → section masquée, jamais inventée ».
 */
export function SessionRewardScreen({
  workoutId,
  title,
  createdAtISO,
  onContinue,
  onViewAnalysis,
}: {
  workoutId: string;
  title: string;
  /** Début de la séance — pour ne mettre en avant qu'un badge débloqué PENDANT. */
  createdAtISO: string;
  onContinue: () => void;
  onViewAnalysis: () => void;
}) {
  const { totalXp, breakdown, level, hasXp } = useSessionReward(workoutId);
  const { latestUnlocked } = useBadgeHighlights();
  const titleTransition = buildTitleTransition(level.xpBefore, level.xpAfter);

  const newBadge =
    latestUnlocked?.unlockedAt && new Date(latestUnlocked.unlockedAt) >= new Date(createdAtISO)
      ? latestUnlocked
      : null;

  const hasPr = breakdown.some((b) => b.source === "pr_muscu");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm">
      <Confetti />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-[#161311] to-[#0b0a09] p-6 shadow-[0_-20px_80px_-24px_rgba(245,158,11,0.35)]"
      >
        {/* Halo d'ambiance */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{
            background:
              "radial-gradient(120% 100% at 50% 0%, rgba(245,158,11,0.20) 0%, transparent 70%)",
          }}
        />

        {/* Hero */}
        <Section delay={0.05}>
          <div className="relative text-center">
            <div className="text-5xl">🏆</div>
            <h2 className="mt-2 text-lg font-bold tracking-tight text-white">Séance terminée !</h2>
            <p className="truncate text-xs text-white/50">{title}</p>
          </div>
        </Section>

        {/* XP totale gagnée */}
        {hasXp && (
          <Section delay={0.15}>
            <div className="mt-4 text-center">
              <div
                className="text-[44px] font-black leading-none tracking-tight"
                style={{ color: XP_COLORS.secondary, textShadow: `0 0 26px ${XP_COLORS.glow}` }}
              >
                +<AnimatedNumber value={totalXp} /> XP
              </div>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Expérience gagnée
              </p>
            </div>
          </Section>
        )}

        {/* Titre / Grade — progression principale */}
        <Section delay={0.28}>
          <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-white/80">
                {titleTransition.after.title.label} — {titleTransition.after.grade}
              </span>
              {titleTransition.gradeUp && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.7, type: "spring", stiffness: 320, damping: 14 }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black text-black"
                  style={{
                    background: XP_COLORS.secondary,
                    boxShadow: `0 0 18px ${XP_COLORS.glow}`,
                  }}
                >
                  <ArrowUp className="h-3 w-3" />
                  NOUVEAU GRADE
                </motion.span>
              )}
            </div>
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
              colors={XP_COLORS}
              segments={5}
              height={10}
              showLabel={false}
            />
            <p className="mt-2 text-right text-[10px] text-white/40">
              {titleTransition.gradeUp
                ? `${titleTransition.before.title.label} — ${titleTransition.before.grade} → ${titleTransition.after.title.label} — ${titleTransition.after.grade}`
                : titleTransition.after.isMax
                  ? "Grade suprême atteint"
                  : `Encore ${titleTransition.after.xpToNext} XP avant ${nextGradeLabel(titleTransition.after)}`}
            </p>
          </div>
        </Section>

        {/* Détail des sources d'XP */}
        {breakdown.length > 0 && (
          <Section delay={0.4}>
            <div className="mt-3 space-y-1.5">
              {breakdown.map((line, i) => {
                const Icon = ICONS[line.icon] ?? Sparkles;
                return (
                  <motion.div
                    key={line.source}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45 + i * 0.07, duration: 0.35, ease: EASE }}
                    className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.04]"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "rgba(245,158,11,0.14)", color: XP_COLORS.secondary }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-white/75">
                      {line.label}
                    </span>
                    <span
                      className="shrink-0 text-xs font-bold"
                      style={{ color: XP_COLORS.secondary }}
                    >
                      +{line.amount}
                    </span>
                  </motion.div>
                );
              })}
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

        {/* Badge débloqué pendant la séance */}
        {newBadge && (
          <Section delay={0.62}>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
              <Medal
                className="h-4 w-4 shrink-0"
                style={{ color: RARITY_COLORS[newBadge.catalog.rarity as BadgeRarity] }}
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white/85">
                  Badge débloqué : {newBadge.catalog.label}
                </p>
                <p
                  className="text-[10px] font-medium"
                  style={{ color: RARITY_COLORS[newBadge.catalog.rarity as BadgeRarity] }}
                >
                  {RARITY_LABELS[newBadge.catalog.rarity as BadgeRarity]}
                </p>
              </div>
            </div>
          </Section>
        )}

        {/* CTAs */}
        <Section delay={0.72}>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={onContinue}
              className="w-full rounded-xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow"
            >
              Continuer
            </button>
            <button
              type="button"
              onClick={onViewAnalysis}
              className="w-full rounded-xl border border-white/10 py-2.5 text-xs font-medium text-white/60 transition-colors hover:text-white"
            >
              Voir le bilan détaillé
            </button>
          </div>
        </Section>
      </motion.div>
    </div>
  );
}
