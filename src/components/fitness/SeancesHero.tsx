import { motion } from "framer-motion";

/**
 * Hero du module Séances — n'est plus une "carte" mais une simple
 * respiration visuelle entre la barre de navigation et Sensei^IA :
 * quelques braises très discrètes, un halo rouge léger, un fond sombre,
 * animations extrêmement lentes. Aucun filet, aucune bordure, aucun
 * survol interactif — la citation flotte, elle ne rivalise plus avec
 * Sensei qui reste le vrai point d'entrée de la page.
 *
 * Volontairement découplé du rang de l'utilisateur (plus de
 * RankAggregator ici) : l'ambiance n'a plus vocation à refléter une
 * progression, ce n'est plus qu'un détail d'identité fixe.
 */

const EMBERS = [
  { left: 20, size: 2, delay: 0, duration: 17 },
  { left: 44, size: 2.5, delay: 5, duration: 21 },
  { left: 68, size: 2, delay: 2, duration: 19 },
  { left: 84, size: 2.5, delay: 8, duration: 23 },
];

export function SeancesHero() {
  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative mb-2 flex min-h-[44px] items-center justify-center overflow-hidden rounded-2xl px-6 py-2 text-center"
      style={{ background: "linear-gradient(180deg,#150808 0%,#070303 100%)" }}
    >
      {/* Halo rouge léger — respiration extrêmement lente */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-6"
        style={{
          background:
            "radial-gradient(55% 70% at 50% 55%, rgba(239,68,68,0.18) 0%, transparent 70%)",
        }}
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Quelques braises très discrètes */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {EMBERS.map((ember, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-red-400/60"
            style={{ left: `${ember.left}%`, bottom: -4, width: ember.size, height: ember.size }}
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: [-4, -26], opacity: [0, 0.5, 0] }}
            transition={{
              duration: ember.duration,
              delay: ember.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.6 }}
        className="relative max-w-[26ch] font-serif text-[13px] font-semibold italic leading-[1.3] tracking-wide text-white/90"
        style={{ textShadow: "0 0 16px rgba(239,68,68,0.25), 0 2px 6px rgba(0,0,0,0.5)" }}
      >
        Chaque légende est forgée
        <br />
        une répétition à la fois.
      </motion.h1>
    </motion.header>
  );
}
