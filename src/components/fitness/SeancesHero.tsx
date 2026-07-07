import { motion } from "framer-motion";
import { RankAggregator, type RankAggregate } from "@/components/fitness/RankAggregator";
import { RankAmbientParticles } from "@/components/fitness/RankAmbientParticles";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import type { RankKey } from "@/lib/fitness/exerciseRanks";

/**
 * Hero du module Séances — reprend strictement le langage visuel du Hero
 * du Profil (ProfileHeroCard) : atmosphère "Reliquary" du meilleur rang de
 * l'utilisateur, particules ambiantes, halo, vignettage, typographie serif
 * italique pour la signature. Aucun hook métier ajouté : l'atmosphère est
 * simplement dérivée du RankAggregator existant (topExercises).
 *
 * Signature officielle du module : "Chaque légende est forgée une
 * répétition à la fois." — devient le sous-titre du Hero.
 *
 * Ce n'est pas un bouton : aucune action au tap. La carte réagit
 * simplement au survol/à la pression (halo qui s'intensifie, léger
 * relief) pour exploiter l'envie instinctive de la toucher, sans jamais
 * prétendre déclencher quoi que ce soit — un lieu vivant, pas un CTA.
 */
export function SeancesHero({ topExercises }: { topExercises: string[] }) {
  if (topExercises.length === 0) {
    return <SeancesHeroCard rankKey="titan" />;
  }
  return (
    <RankAggregator exerciseNames={topExercises}>
      {(agg) => <SeancesHeroCard rankKey={agg.best?.rank.rank.key ?? "titan"} aggregate={agg} />}
    </RankAggregator>
  );
}

function SeancesHeroCard({ rankKey, aggregate }: { rankKey: RankKey; aggregate?: RankAggregate }) {
  const visual = getRankVisual(rankKey);
  const colors = aggregate?.best?.rank.rank.colors ?? {
    primary: "#ef4444",
    secondary: "#fca5a5",
    glow: "rgba(239,68,68,0.45)",
    text: "#fee2e2",
    gradient: "linear-gradient(90deg,#7f1d1d 0%,#ef4444 100%)",
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.994 }}
      className="group relative mb-2 overflow-hidden rounded-[28px] p-6 shadow-elevated"
      style={{
        background: visual.atmosphere,
        boxShadow: `inset 0 0 0 1px ${visual.vignette}, 0 12px 44px -20px ${colors.glow}`,
      }}
    >
      {/* Couche de profondeur lointaine — embers flous, plus lents, en arrière-plan */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 scale-110 opacity-50 blur-[1px]"
      >
        <RankAmbientParticles rankKey={rankKey} seed={11} />
      </div>
      {/* Couche de profondeur proche — embers nets, au premier plan */}
      <RankAmbientParticles rankKey={rankKey} />

      {/* Cœur du brasier — respiration lente, s'intensifie au toucher */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 transition-opacity duration-700 group-hover:opacity-100"
        style={{
          background: `radial-gradient(60% 90% at 50% 120%, ${colors.glow} 0%, transparent 70%)`,
          opacity: 0.7,
        }}
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Halo lointain — respiration plus ample, effet de profondeur */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-8"
        style={{
          background: `radial-gradient(50% 50% at 50% 40%, ${colors.glow} 0%, transparent 65%)`,
        }}
        animate={{ opacity: [0.12, 0.28, 0.12] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(120% 60% at 50% 100%, rgba(0,0,0,0.55) 0%, transparent 70%)",
        }}
      />

      {/* Filet métallique haut — évoque la barre d'acier */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-4 h-px transition-opacity duration-500 group-hover:opacity-90"
        style={{ background: colors.gradient, opacity: 0.5 }}
      />

      {/* Vignettage réactif — le rebord de la carte s'illumine au toucher */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[28px] opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-active:opacity-100"
        style={{ boxShadow: `inset 0 0 0 1px ${colors.glow}, inset 0 0 40px -18px ${colors.glow}` }}
      />

      <div className="relative">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.28em]"
          style={{ color: colors.secondary }}
        >
          La Forge
        </p>

        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mt-3 font-serif text-[26px] font-semibold italic leading-tight tracking-wide text-white"
          style={{
            textShadow: `0 0 24px ${colors.glow}, 0 2px 8px rgba(0,0,0,0.5)`,
          }}
        >
          Chaque légende est forgée
          <br />
          une répétition à la fois.
        </motion.h1>

        <div className="mt-4 flex items-center gap-3">
          <div
            aria-hidden
            className="h-px flex-1"
            style={{ background: `linear-gradient(90deg, ${colors.primary}55, transparent)` }}
          />
          <p
            className="text-[11px] font-bold uppercase tracking-[0.32em] text-white/90"
            style={{ textShadow: `0 0 12px ${colors.glow}` }}
          >
            Séances
          </p>
          <div
            aria-hidden
            className="h-px flex-1"
            style={{ background: `linear-gradient(270deg, ${colors.primary}55, transparent)` }}
          />
        </div>
      </div>
    </motion.header>
  );
}
