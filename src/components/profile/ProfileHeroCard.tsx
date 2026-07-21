import { motion } from "framer-motion";

import { RankAmbientParticles } from "@/components/fitness/RankAmbientParticles";
import { RankDisc } from "@/components/rpg/RankDisc";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { toRankState } from "@/hooks/useExerciseProgression";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp } from "@/lib/fitness/rpg/titleProgress";
import { SERIF, EASE_OUT, stagger } from "@/components/rpg/premium/tokens";

/**
 * Fiche de Personnage — pièce maîtresse de CORTEX (Accueil).
 * L'identité (avatar + pseudo) est rendue AU-DESSUS via ProfileIdentityStrip.
 */
export function ProfileHeroCard() {
  const { data: userStats, isLoading: statsLoading } = useUserStats();
  const progress = titleProgressForXp(userStats?.xp ?? 0);


  // Position dans le palier courant (0..100), pour l'anneau de progression
  // du Disque uniquement — jamais affiché en texte (règle "pas de %").
  const gradeSpan = Math.max(
    1,
    (progress.xpNextThreshold ?? progress.xpCurrentThreshold) - progress.xpCurrentThreshold,
  );
  const percentInGrade = progress.isMax
    ? 100
    : ((progress.xp - progress.xpCurrentThreshold) / gradeSpan) * 100;

  const rank = toRankState(progress.tierIndex, percentInGrade);
  const isHydrating = statsLoading;
  const colors = rank.rank.colors;
  const visual = getRankVisual(rank.rank.key);
  const currentGrade = progress.grade;




  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className="relative mb-6 overflow-hidden rounded-[28px] px-5 pb-5 pt-5 shadow-elevated"
      style={{
        background: visual.atmosphere,
        boxShadow: `inset 0 0 0 1px ${visual.vignette}, 0 16px 50px -22px ${colors.glow}`,
      }}
    >
      <RankAmbientParticles rankKey={rank.rank.key} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(130% 70% at 50% 100%, rgba(0,0,0,0.58) 0%, transparent 72%)",
        }}
      />

      {/* ── Scène du RANG (le héros) ──────────────────────────────────────── */}
      <div className="relative flex flex-col items-center text-center">
        <RankDisc rank={rank} size={170} variant="hero" revealDelay={0.1} />


        {/* Nom de RANG monumental : lettrage serif, métal dégradé, halo, reflet. */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.94 }}
          animate={{ opacity: isHydrating ? 0 : 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: stagger(1), ease: EASE_OUT }}
          className="relative mt-3 flex flex-col items-center"
        >
          {/* Halo diffus du nom */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[42px] font-black uppercase leading-none tracking-[0.1em] blur-[12px]"
            style={{ fontFamily: SERIF, color: colors.glow, opacity: 0.8 }}
          >
            {rank.rank.label}
          </span>
          {/* Nom rempli d'un dégradé métallique */}
          <h1
            className="relative bg-clip-text text-[42px] font-black uppercase leading-none tracking-[0.1em] text-transparent"
            style={{
              fontFamily: SERIF,
              backgroundImage: `linear-gradient(180deg, #ffffff 0%, ${colors.secondary} 46%, ${colors.primary} 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
            }}
          >
            {rank.rank.label}
          </h1>
          {/* Reflet en miroir sous le nom */}
          <span
            aria-hidden
            className="pointer-events-none -mt-1 bg-clip-text text-[42px] font-black uppercase leading-none tracking-[0.1em] text-transparent"
            style={{
              fontFamily: SERIF,
              backgroundImage: `linear-gradient(180deg, ${colors.primary} 0%, transparent 70%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              transform: "scaleY(-1)",
              opacity: 0.22,
              maskImage: "linear-gradient(black, transparent 55%)",
              WebkitMaskImage: "linear-gradient(black, transparent 55%)",
            }}
          >
            {rank.rank.label}
          </span>
        </motion.div>

        {/* Grade nommé (remplace « Rang I..V ») */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: stagger(2), ease: EASE_OUT }}
          className="mt-1.5 flex items-center gap-2"
        >
          <span className="h-px w-6" style={{ background: `${colors.secondary}66` }} />
          <span
            className="text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{ color: colors.secondary }}
          >
            {isHydrating ? "" : currentGrade}
          </span>
          <span className="h-px w-6" style={{ background: `${colors.secondary}66` }} />
        </motion.div>
      </div>
    </motion.header>
  );
}
