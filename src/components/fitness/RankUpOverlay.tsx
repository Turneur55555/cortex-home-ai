import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { rankTextGlow } from "@/components/rpg/rankTheme";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { gradeName } from "@/lib/fitness/rpg/grade";
import { isHapticsEnabled } from "@/lib/haptics";

/**
 * Cinématique de montée de rang — "Reliquary".
 * Séquence 2.6s : fondu → rayons → badge → flash → texte → particules.
 * Confettis uniquement pour Olympien et Primordial.
 */
export function RankUpOverlay({ rank, onDone }: { rank: RankState | null; onDone: () => void }) {
  useEffect(() => {
    if (!rank) return;
    if (isHapticsEnabled() && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.([15, 30, 15, 30, 60]);
      } catch {
        /* noop */
      }
    }
    const highTier = rank.rank.key === "olympien" || rank.rank.key === "primordial";
    if (highTier) {
      setTimeout(() => {
        confetti({
          particleCount: 140,
          spread: 100,
          origin: { y: 0.5 },
          colors: [rank.rank.colors.primary, rank.rank.colors.secondary, "#ffffff"],
        });
      }, 900);
    }
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [rank, onDone]);

  return (
    <AnimatePresence>
      {rank &&
        (() => {
          const { colors } = rank.rank;
          return (
            <motion.div
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-black"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={onDone}
            >
              {/* Vignettage */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(80% 60% at 50% 50%, transparent 20%, rgba(0,0,0,0.85) 100%)",
                }}
              />

              {/* Rayons lumineux jaillissants */}
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 400 400"
                preserveAspectRatio="xMidYMid slice"
              >
                <defs>
                  <linearGradient id="ray-grad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={colors.secondary} stopOpacity="0" />
                    <stop offset="40%" stopColor={colors.secondary} stopOpacity="0.7" />
                    <stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {Array.from({ length: 12 }).map((_, i) => (
                  <motion.rect
                    key={i}
                    x="198"
                    y="0"
                    width="4"
                    height="400"
                    fill="url(#ray-grad)"
                    transform={`rotate(${(360 / 12) * i} 200 200)`}
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: [0, 0.9, 0.4, 0.6], scaleY: [0, 1, 1, 1] }}
                    transition={{
                      delay: 0.3 + i * 0.03,
                      duration: 2.2,
                      ease: "easeOut",
                    }}
                    style={{ transformOrigin: "200px 200px" }}
                  />
                ))}
              </svg>

              {/* Flash blanc bref */}
              <motion.div
                className="pointer-events-none absolute inset-0 bg-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.6, 0] }}
                transition={{ delay: 1.0, duration: 0.35 }}
              />

              {/* Badge */}
              <motion.div
                initial={{ scale: 0.2, opacity: 0, filter: "blur(20px)" }}
                animate={{ scale: [0.2, 1.12, 1], opacity: 1, filter: "blur(0px)" }}
                transition={{
                  delay: 0.5,
                  duration: 0.9,
                  times: [0, 0.7, 1],
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="relative"
              >
                <div
                  className="absolute inset-0 -z-10 rounded-full blur-3xl"
                  style={{ background: colors.glow, transform: "scale(1.6)" }}
                />
                <RankIllustration
                  rankKey={rank.rank.key}
                  label={rank.rank.label}
                  className="aspect-[4/5] w-52 rounded-3xl shadow-2xl"
                />
              </motion.div>

              {/* Texte */}
              <motion.p
                initial={{ opacity: 0, y: 12, letterSpacing: "0.1em" }}
                animate={{ opacity: 1, y: 0, letterSpacing: "0.4em" }}
                transition={{ delay: 1.3, duration: 0.6 }}
                className="mt-8 text-[10px] font-bold uppercase text-white/60"
              >
                Vous êtes devenu
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 14, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 1.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="mt-2 font-serif text-4xl font-bold uppercase tracking-[0.18em]"
                style={{
                  color: colors.text,
                  textShadow: rankTextGlow(colors.glow, 30, "0 0 6px rgba(255,255,255,0.4)"),
                }}
              >
                {gradeName(rank.rank.key, rank.levelInRank)}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                transition={{ delay: 2.1, duration: 0.4 }}
                className="mt-6 text-[9px] uppercase tracking-[0.3em] text-white/40"
              >
                Toucher pour continuer
              </motion.p>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}
