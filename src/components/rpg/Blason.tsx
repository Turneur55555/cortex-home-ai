import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { RankSigil } from "./RankSigil";
import { EASE_IN_OUT, EASE_OUT, HALO_BREATH } from "./premium/tokens";

// ============================================================
// Blason — l'emblème de rang, pièce maîtresse de la signature CORTEX.
//
// Élève le badge hexagonal existant (métal/émail/sigil) en objet précieux
// « mis en scène » : aura respirante, halo conique rotatif, braises flottantes
// propres au rang, socle lumineux, reflet spéculaire, révélation à l'entrée.
//
// UN composant réutilisable partout (Hero, montée de rang, récompenses,
// reliques). `variant="hero"` = pleine mise en scène ; `variant="emblem"` =
// juste la pièce (listes, cartes) ; `size` pilote l'échelle.
// ============================================================

interface BlasonProps {
  rank: RankState;
  size?: number;
  variant?: "hero" | "emblem";
  animated?: boolean;
  /** Bandeau du niveau romain gravé en bas du blason (I..V). */
  showLevelBand?: boolean;
  /** Délai d'entrée (secondes) pour l'orchestration d'une scène. */
  revealDelay?: number;
}

function Embers({ color, count, radius }: { color: string; count: number; radius: number }) {
  const embers = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 3);
        return {
          id: i,
          x: Math.cos(angle) * radius * (0.55 + (i % 4) * 0.12),
          size: 2 + (i % 3),
          delay: (i * 0.5) % 3,
          duration: 3.2 + (i % 4) * 0.7,
          drift: (i % 2 === 0 ? 1 : -1) * (4 + (i % 3) * 3),
        };
      }),
    [count, radius],
  );
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {embers.map((e) => (
        <motion.span
          key={e.id}
          className="absolute rounded-full"
          style={{
            width: e.size,
            height: e.size,
            background: color,
            boxShadow: `0 0 ${e.size * 2.5}px ${color}`,
            left: `calc(50% + ${e.x}px)`,
            bottom: "18%",
          }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 0.9, 0], y: [-4, -radius * 0.9], x: [0, e.drift] }}
          transition={{
            duration: e.duration,
            delay: e.delay,
            repeat: Infinity,
            ease: EASE_IN_OUT,
          }}
        />
      ))}
    </div>
  );
}

export function Blason({
  rank,
  size = 120,
  variant = "emblem",
  animated = true,
  showLevelBand = true,
  revealDelay = 0,
}: BlasonProps) {
  const { primary, secondary, glow, text } = rank.rank.colors;
  const visual = getRankVisual(rank.rank.key);
  const isHero = variant === "hero";
  const uid = useId();
  const metalId = `metal-${uid}`;
  const enamelId = `enamel-${uid}`;
  const glossId = `gloss-${uid}`;
  const clipId = `clip-${uid}`;

  const metalStops = visual.metal.match(/#[0-9a-f]{6}/gi)?.slice(0, 3) ?? [];
  const enamelStops = visual.enamel.match(/#[0-9a-f]{6}/gi)?.slice(0, 3) ?? [];

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      initial={{ opacity: 0, scale: 0.82, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.7, delay: revealDelay, ease: EASE_OUT }}
    >
      {/* Socle lumineux au sol (hero) */}
      {isHero && (
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 rounded-[50%] blur-2xl"
          style={{
            bottom: -size * 0.06,
            width: size * 0.78,
            height: size * 0.18,
            background: glow,
          }}
          animate={animated ? { opacity: [0.35, 0.6, 0.35], scaleX: [0.9, 1.05, 0.9] } : undefined}
          transition={{ duration: 4, repeat: Infinity, ease: EASE_IN_OUT }}
          aria-hidden
        />
      )}

      {/* Braises flottantes (hero) */}
      {isHero && animated && visual.particleCount > 0 && (
        <Embers color={visual.particleColor} count={visual.particleCount} radius={size * 0.5} />
      )}

      {/* Flottement de l'ensemble */}
      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
        animate={animated ? { y: [0, isHero ? -6 : -3, 0] } : undefined}
        transition={animated ? { duration: 4.6, repeat: Infinity, ease: EASE_IN_OUT } : undefined}
      >
        {/* Halo respirant */}
        <motion.div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{ background: glow, transform: `scale(${isHero ? 1.15 : 1})` }}
          animate={animated ? HALO_BREATH.animate : undefined}
          transition={animated ? HALO_BREATH.transition : undefined}
          aria-hidden
        />

        {/* Anneau conique rotatif */}
        {animated && (
          <motion.div
            className="absolute inset-0 rounded-[22%]"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, ${secondary}80 60deg, transparent 140deg, transparent 220deg, ${primary}60 280deg, transparent 340deg)`,
              filter: "blur(4px)",
              opacity: isHero ? 0.6 : 0.5,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
            aria-hidden
          />
        )}

        <svg viewBox="0 0 64 64" width={size} height={size} className="relative">
          <defs>
            <linearGradient id={metalId} x1="0" x2="1" y1="0" y2="1">
              {metalStops.map((c, i) => (
                <stop
                  key={i}
                  offset={`${(i / Math.max(1, metalStops.length - 1)) * 100}%`}
                  stopColor={c}
                />
              ))}
            </linearGradient>
            <radialGradient id={enamelId} cx="35%" cy="30%" r="75%">
              {enamelStops.map((c, i) => (
                <stop
                  key={i}
                  offset={`${(i / Math.max(1, enamelStops.length - 1)) * 100}%`}
                  stopColor={c}
                />
              ))}
            </radialGradient>
            <linearGradient id={glossId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <clipPath id={clipId}>
              <polygon points="32,3 59,17.5 59,46.5 32,61 5,46.5 5,17.5" />
            </clipPath>
          </defs>

          {/* Plaque métal */}
          <polygon
            points="32,3 59,17.5 59,46.5 32,61 5,46.5 5,17.5"
            fill={`url(#${metalId})`}
            stroke={secondary}
            strokeOpacity="0.85"
            strokeWidth="0.8"
          />
          {/* Médaillon émaillé */}
          <polygon
            points="32,10 53,21 53,43 32,54 11,43 11,21"
            fill={`url(#${enamelId})`}
            stroke={primary}
            strokeOpacity="0.6"
            strokeWidth="0.5"
          />

          {/* Sigil */}
          <g transform={showLevelBand ? "translate(0,-2)" : "translate(0,0)"}>
            <RankSigil kind={visual.sigil} color={text} accent={secondary} />
          </g>

          {/* Reflet spéculaire */}
          {animated && (
            <g clipPath={`url(#${clipId})`}>
              <motion.rect
                x="-40"
                y="0"
                width="30"
                height="64"
                fill={`url(#${glossId})`}
                transform="skewX(-20)"
                animate={{ x: [-40, 90] }}
                transition={{ duration: 6, repeat: Infinity, repeatDelay: 2.2, ease: EASE_IN_OUT }}
              />
            </g>
          )}

          {/* Bandeau du niveau romain */}
          {showLevelBand && (
            <g>
              <rect x="22" y="52" width="20" height="9" rx="1.5" fill="#0a0a0a" opacity="0.88" />
              <rect
                x="22"
                y="52"
                width="20"
                height="9"
                rx="1.5"
                fill={`url(#${metalId})`}
                opacity="0.35"
              />
              <text
                x="32"
                y="58.8"
                textAnchor="middle"
                fontSize="7.2"
                fontWeight="700"
                fill={text}
                fontFamily="ui-serif, Georgia, serif"
                letterSpacing="1.5"
              >
                {rank.romanLevel}
              </text>
            </g>
          )}
        </svg>
      </motion.div>
    </motion.div>
  );
}
