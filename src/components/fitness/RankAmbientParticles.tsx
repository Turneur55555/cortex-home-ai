import { useMemo } from "react";
import { motion } from "framer-motion";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import type { RankKey } from "@/lib/fitness/exerciseRanks";

/**
 * Particules ambiantes discrètes propres au rang.
 * SVG + framer-motion, pas de canvas. Respect strict de la perf mobile :
 * 3 à 8 éléments max, animés uniquement en transform + opacity (GPU).
 */
export function RankAmbientParticles({
  rankKey,
  seed = 0,
}: {
  rankKey: RankKey;
  seed?: number;
}) {
  const visual = getRankVisual(rankKey);
  const particles = useMemo(() => {
    const count = visual.particleCount;
    return Array.from({ length: count }).map((_, i) => {
      const rand = (i + 1 + seed) * 9301 + 49297;
      const r = (rand % 233280) / 233280;
      const r2 = ((rand * 3) % 233280) / 233280;
      return {
        left: 8 + r * 84,
        size: 2 + r2 * 3,
        delay: r * 6,
        duration: 5 + r2 * 5,
      };
    });
  }, [visual.particleCount, seed]);

  if (particles.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            bottom: -6,
            width: p.size,
            height: p.size,
            background: visual.particleColor,
            filter: `blur(0.5px) drop-shadow(0 0 4px ${visual.particleColor})`,
          }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: [-20, -180], opacity: [0, 0.9, 0] }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}
