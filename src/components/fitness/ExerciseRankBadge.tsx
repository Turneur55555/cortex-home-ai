import { useId } from "react";
import { motion } from "framer-motion";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { RankSigil } from "@/components/rpg/RankSigil";

export function ExerciseRankBadge({
  rank,
  size = 88,
  animated = true,
}: {
  rank: RankState;
  size?: number;
  animated?: boolean;
}) {
  const { primary, secondary, glow, text } = rank.rank.colors;
  const visual = getRankVisual(rank.rank.key);
  const uid = useId();
  const metalId = `metal-${uid}`;
  const enamelId = `enamel-${uid}`;
  const glossId = `gloss-${uid}`;
  const clipId = `clip-${uid}`;

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      animate={animated ? { y: [0, -3, 0] } : undefined}
      transition={animated ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : undefined}
    >
      {/* Halo respirant */}
      <motion.div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{ background: glow }}
        animate={animated ? { opacity: [0.55, 0.85, 0.55], scale: [0.9, 1.05, 0.9] } : undefined}
        transition={animated ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" } : undefined}
      />

      {/* Anneau lumineux rotatif — subtil */}
      {animated && (
        <motion.div
          className="absolute inset-0 rounded-[22%]"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, ${secondary}80 60deg, transparent 140deg, transparent 220deg, ${primary}60 280deg, transparent 340deg)`,
            filter: "blur(4px)",
            opacity: 0.5,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
        />
      )}

      <svg viewBox="0 0 64 64" width={size} height={size} className="relative">
        <defs>
          <linearGradient id={metalId} x1="0" x2="1" y1="0" y2="1">
            {visual.metal
              .match(/#[0-9a-f]{6}/gi)
              ?.slice(0, 3)
              .map((c, i, arr) => (
                <stop key={i} offset={`${(i / (arr.length - 1)) * 100}%`} stopColor={c} />
              ))}
          </linearGradient>
          <radialGradient id={enamelId} cx="35%" cy="30%" r="75%">
            {visual.enamel
              .match(/#[0-9a-f]{6}/gi)
              ?.slice(0, 3)
              .map((c, i, arr) => (
                <stop key={i} offset={`${(i / (arr.length - 1)) * 100}%`} stopColor={c} />
              ))}
          </radialGradient>
          <linearGradient id={glossId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
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
          strokeOpacity="0.8"
          strokeWidth="0.8"
        />
        {/* Médaillon émaillé intérieur */}
        <polygon
          points="32,10 53,21 53,43 32,54 11,43 11,21"
          fill={`url(#${enamelId})`}
          stroke={primary}
          strokeOpacity="0.6"
          strokeWidth="0.5"
        />

        {/* Sigil */}
        <g transform="translate(0,-2)">
          <RankSigil kind={visual.sigil} color={text} accent={secondary} />
        </g>

        {/* Reflet spéculaire animé */}
        {animated && (
          <g clipPath={`url(#${clipId})`}>
            <motion.rect
              x="-40"
              y="0"
              width="30"
              height="64"
              fill={`url(#${glossId})`}
              transform="skewX(-20)"
              animate={{ x: [-40, 80] }}
              transition={{ duration: 6, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
            />
          </g>
        )}

        {/* Bandeau du niveau — plaque gravée */}
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
      </svg>
    </motion.div>
  );
}
