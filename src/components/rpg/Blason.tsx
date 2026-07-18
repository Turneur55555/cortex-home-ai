import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { RankSigil } from "./RankSigil";
import { EASE_IN_OUT, EASE_OUT, HALO_BREATH } from "./premium/tokens";
import { particleParamsFor } from "./premium/rankUniverse";

// ============================================================
// Blason — l'emblème de rang, RELIQUE LÉGENDAIRE et pièce maîtresse de la
// signature CORTEX.
//
// Sensation de matière : métal biseauté, médaillon gravé en creux, sigil en
// relief (ombre + lumière), biseau lumineux, léger basculement 3D, reflet
// spéculaire, halo vivant, et particules propres à l'UNIVERS du rang (braises,
// étincelles, rayons divins, poussière, motes, cosmos — voir rankUniverse.ts).
//
// UN composant réutilisable partout (Hero, montée de rang, récompenses,
// reliques, trophées). `variant="hero"` = pleine mise en scène ;
// `variant="emblem"` = la pièce seule ; `size` pilote l'échelle.
// ============================================================

interface BlasonProps {
  rank: RankState;
  size?: number;
  variant?: "hero" | "emblem";
  animated?: boolean;
  showLevelBand?: boolean;
  revealDelay?: number;
}

// ── Particules d'univers ────────────────────────────────────────────────────
function RelicParticles({
  rankKey,
  color,
  radius,
}: {
  rankKey: RankState["rank"]["key"];
  color: string;
  radius: number;
}) {
  const p = particleParamsFor(rankKey);

  const parts = useMemo(
    () =>
      Array.from({ length: p.count }, (_, i) => {
        const t = (i * 9301 + 49297) % 233280;
        const rnd = t / 233280;
        const rnd2 = ((i * 4021 + 7919) % 3571) / 3571;
        const size = p.sizeRange[0] + rnd * (p.sizeRange[1] - p.sizeRange[0]);
        return {
          id: i,
          left: 12 + rnd * 76, // %
          size,
          delay: rnd2 * p.speed[1],
          duration: p.speed[0] + rnd * (p.speed[1] - p.speed[0]),
          drift: (i % 2 === 0 ? 1 : -1) * (p.drift * (0.5 + rnd2)),
          yTarget: -p.rise * radius * (0.7 + rnd * 0.5),
        };
      }),
    [p, radius],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Faisceaux divins (Olympien) */}
      {p.beams && (
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: radius * 3,
            height: radius * 3,
            background: `conic-gradient(from 0deg, transparent 0deg, ${color}22 12deg, transparent 34deg, transparent 90deg, ${color}1f 104deg, transparent 128deg, transparent 200deg, ${color}22 214deg, transparent 236deg)`,
            maskImage: "radial-gradient(circle, black 30%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(circle, black 30%, transparent 70%)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        />
      )}

      {parts.map((e) =>
        p.twinkle ? (
          <motion.span
            key={e.id}
            className="absolute rounded-full"
            style={{
              width: e.size,
              height: e.size,
              left: `${e.left}%`,
              top: `${20 + ((e.id * 37) % 60)}%`,
              background: color,
              boxShadow: `0 0 ${e.size * 3}px ${color}`,
            }}
            animate={{ opacity: [0.1, 0.9, 0.1], scale: [0.8, 1.2, 0.8], x: [0, e.drift * 0.3, 0] }}
            transition={{
              duration: e.duration,
              delay: e.delay,
              repeat: Infinity,
              ease: EASE_IN_OUT,
            }}
          />
        ) : (
          <motion.span
            key={e.id}
            className="absolute rounded-full"
            style={{
              width: e.size,
              height: e.size,
              left: `${e.left}%`,
              bottom: p.rise >= 0 ? "22%" : "auto",
              top: p.rise < 0 ? "18%" : "auto",
              background: color,
              boxShadow: `0 0 ${e.size * 2.5}px ${color}`,
            }}
            initial={{ opacity: 0, y: 0, x: 0 }}
            animate={{ opacity: [0, 0.95, 0], y: [0, e.yTarget], x: [0, e.drift] }}
            transition={{ duration: e.duration, delay: e.delay, repeat: Infinity, ease: EASE_OUT }}
          />
        ),
      )}
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
  const bevelId = `bevel-${uid}`;
  const clipId = `clip-${uid}`;
  const recessId = `recess-${uid}`;

  const metalStops = visual.metal.match(/#[0-9a-f]{6}/gi)?.slice(0, 3) ?? [];
  const enamelStops = visual.enamel.match(/#[0-9a-f]{6}/gi)?.slice(0, 3) ?? [];

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size, perspective: 700 }}
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, delay: revealDelay, ease: EASE_OUT }}
    >
      {/* Socle lumineux au sol (hero) */}
      {isHero && (
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 rounded-[50%] blur-2xl"
          style={{
            bottom: -size * 0.05,
            width: size * 0.82,
            height: size * 0.18,
            background: glow,
          }}
          animate={animated ? { opacity: [0.3, 0.6, 0.3], scaleX: [0.88, 1.06, 0.88] } : undefined}
          transition={{ duration: 4.4, repeat: Infinity, ease: EASE_IN_OUT }}
          aria-hidden
        />
      )}

      {/* Particules de l'univers du rang */}
      {animated && (
        <RelicParticles rankKey={rank.rank.key} color={visual.particleColor} radius={size * 0.5} />
      )}

      {/* Basculement 3D subtil + flottement — l'emblème « vit ». */}
      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size, transformStyle: "preserve-3d" }}
        animate={
          animated
            ? { rotateY: [-5, 5, -5], rotateX: [3, -3, 3], y: [0, isHero ? -6 : -3, 0] }
            : undefined
        }
        transition={animated ? { duration: 9, repeat: Infinity, ease: EASE_IN_OUT } : undefined}
      >
        {/* Halo respirant */}
        <motion.div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{ background: glow, transform: `scale(${isHero ? 1.2 : 1})` }}
          animate={animated ? HALO_BREATH.animate : undefined}
          transition={animated ? HALO_BREATH.transition : undefined}
          aria-hidden
        />

        {/* Anneau conique rotatif */}
        {animated && (
          <motion.div
            className="absolute inset-0 rounded-[22%]"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, ${secondary}90 55deg, transparent 130deg, transparent 220deg, ${primary}70 285deg, transparent 350deg)`,
              filter: "blur(5px)",
              opacity: isHero ? 0.65 : 0.5,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
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
            <radialGradient id={enamelId} cx="35%" cy="28%" r="80%">
              {enamelStops.map((c, i) => (
                <stop
                  key={i}
                  offset={`${(i / Math.max(1, enamelStops.length - 1)) * 100}%`}
                  stopColor={c}
                />
              ))}
            </radialGradient>
            {/* Biseau : lumière en haut, ombre en bas — donne le relief. */}
            <linearGradient id={bevelId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.65" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.08" />
              <stop offset="55%" stopColor="#000000" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id={glossId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            {/* Médaillon gravé en creux (inner shadow). */}
            <filter id={recessId} x="-20%" y="-20%" width="140%" height="140%">
              <feComponentTransfer in="SourceAlpha" result="a">
                <feFuncA type="table" tableValues="1 0" />
              </feComponentTransfer>
              <feGaussianBlur in="a" stdDeviation="1.5" result="b" />
              <feOffset in="b" dx="0" dy="1.2" result="c" />
              <feFlood floodColor="#000000" floodOpacity="0.8" result="d" />
              <feComposite in="d" in2="c" operator="in" result="e" />
              <feComposite in="e" in2="SourceAlpha" operator="in" result="f" />
              <feMerge>
                <feMergeNode in="SourceGraphic" />
                <feMergeNode in="f" />
              </feMerge>
            </filter>
            <clipPath id={clipId}>
              <polygon points="32,3 59,17.5 59,46.5 32,61 5,46.5 5,17.5" />
            </clipPath>
          </defs>

          {/* Ombre portée de la plaque */}
          <polygon
            points="32,4 59,18.5 59,47.5 32,62 5,47.5 5,18.5"
            fill="#000000"
            opacity="0.45"
          />
          {/* Plaque métal */}
          <polygon
            points="32,3 59,17.5 59,46.5 32,61 5,46.5 5,17.5"
            fill={`url(#${metalId})`}
            stroke={secondary}
            strokeOpacity="0.9"
            strokeWidth="0.8"
          />
          {/* Biseau extérieur (relief) */}
          <polygon
            points="32,5 57,18.6 57,45.4 32,59 7,45.4 7,18.6"
            fill="none"
            stroke={`url(#${bevelId})`}
            strokeWidth="1.6"
          />
          {/* Médaillon émaillé gravé en creux */}
          <g filter={`url(#${recessId})`}>
            <polygon
              points="32,10 53,21 53,43 32,54 11,43 11,21"
              fill={`url(#${enamelId})`}
              stroke={primary}
              strokeOpacity="0.55"
              strokeWidth="0.5"
            />
          </g>

          {/* Sigil en relief : ombre gravée + éclat lumineux */}
          <g transform={showLevelBand ? "translate(0,-2)" : "translate(0,0)"}>
            <g transform="translate(0.55,0.9)" opacity="0.55">
              <RankSigil kind={visual.sigil} color="#000000" accent="#000000" />
            </g>
            <RankSigil kind={visual.sigil} color={text} accent={secondary} />
            <g transform="translate(-0.45,-0.6)" opacity="0.3">
              <RankSigil kind={visual.sigil} color="#ffffff" accent="#ffffff" />
            </g>
          </g>

          {/* Reflet spéculaire qui balaie la surface */}
          {animated && (
            <g clipPath={`url(#${clipId})`}>
              <motion.rect
                x="-40"
                y="0"
                width="26"
                height="64"
                fill={`url(#${glossId})`}
                transform="skewX(-20)"
                animate={{ x: [-40, 92] }}
                transition={{
                  duration: 5.5,
                  repeat: Infinity,
                  repeatDelay: 2.4,
                  ease: EASE_IN_OUT,
                }}
              />
            </g>
          )}

          {/* Bandeau du niveau romain — plaque gravée */}
          {showLevelBand && (
            <g>
              <rect x="21" y="52" width="22" height="9.5" rx="1.6" fill="#0a0a0a" opacity="0.9" />
              <rect
                x="21"
                y="52"
                width="22"
                height="9.5"
                rx="1.6"
                fill={`url(#${metalId})`}
                opacity="0.4"
              />
              <rect
                x="21"
                y="52"
                width="22"
                height="9.5"
                rx="1.6"
                fill="none"
                stroke={secondary}
                strokeOpacity="0.5"
                strokeWidth="0.4"
              />
              <text
                x="32"
                y="58.9"
                textAnchor="middle"
                fontSize="7"
                fontWeight="700"
                fill={text}
                fontFamily="ui-serif, Georgia, serif"
                letterSpacing="1.6"
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
