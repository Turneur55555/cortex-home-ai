import { motion } from "framer-motion";
import type { RankState } from "@/lib/fitness/exerciseRanks";

// Motif SVG central par rang (mythologie grecque).
function RankMotif({ motif, color }: { motif: string; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (motif) {
    case "shield": // Guerrier — bouclier + lance
      return (
        <g {...stroke}>
          <path d="M32 14 L48 22 V34 C48 42 40 48 32 52 C24 48 16 42 16 34 V22 Z" />
          <path d="M32 22 L32 42 M24 30 L40 30" />
        </g>
      );
    case "helm": // Héros — casque grec
      return (
        <g {...stroke}>
          <path d="M18 36 C18 26 24 20 32 20 C40 20 46 26 46 36 V42 H18 Z" />
          <path d="M28 20 L28 12 L36 12 L36 20" />
          <path d="M32 42 V50" />
        </g>
      );
    case "flame": // Titan — flamme
      return (
        <g {...stroke}>
          <path d="M32 12 C36 20 42 24 42 34 C42 42 37 48 32 48 C27 48 22 42 22 34 C22 28 26 24 28 20 C29 24 30 26 32 28 C33 24 32 18 32 12 Z" />
        </g>
      );
    case "lightning": // Olympien — éclair
      return (
        <g {...stroke}>
          <path d="M34 12 L20 34 L30 34 L26 52 L44 28 L34 28 Z" />
        </g>
      );
    case "cosmos": // Primordial — étoile + orbite
      return (
        <g {...stroke}>
          <circle cx="32" cy="32" r="18" />
          <path d="M32 18 L34 28 L44 30 L36 36 L38 46 L32 40 L26 46 L28 36 L20 30 L30 28 Z" />
        </g>
      );
    case "stone": // Mortel — bloc
    default:
      return (
        <g {...stroke}>
          <path d="M20 26 L32 18 L44 26 V42 L32 50 L20 42 Z" />
          <path d="M20 26 L32 34 L44 26 M32 34 L32 50" />
        </g>
      );
  }
}

export function ExerciseRankBadge({
  rank,
  size = 88,
}: {
  rank: RankState;
  size?: number;
}) {
  const { primary, secondary, glow, text } = rank.rank.colors;
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size, filter: `drop-shadow(0 0 12px ${glow})` }}
    >
      <motion.svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <defs>
          <linearGradient id={`hex-${rank.rank.key}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={secondary} />
            <stop offset="55%" stopColor={primary} />
            <stop offset="100%" stopColor="#0a0a0a" />
          </linearGradient>
          <linearGradient id={`hex-stroke-${rank.rank.key}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={secondary} stopOpacity="0.95" />
            <stop offset="100%" stopColor={primary} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        {/* Hexagone extérieur */}
        <polygon
          points="32,2 60,17 60,47 32,62 4,47 4,17"
          fill={`url(#hex-${rank.rank.key})`}
          stroke={`url(#hex-stroke-${rank.rank.key})`}
          strokeWidth="2"
        />
        {/* Hexagone intérieur subtil */}
        <polygon
          points="32,8 55,20 55,44 32,56 9,44 9,20"
          fill="none"
          stroke={secondary}
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        <RankMotif motif={rank.rank.motif} color={text} />
        {/* Bandeau du niveau (romain) */}
        <g>
          <rect x="24" y="52" width="16" height="8" rx="1.5" fill="#0a0a0a" opacity="0.85" />
          <text
            x="32"
            y="58.5"
            textAnchor="middle"
            fontSize="7"
            fontWeight="700"
            fill={text}
            fontFamily="ui-serif, Georgia, serif"
            letterSpacing="1"
          >
            {rank.romanLevel}
          </text>
        </g>
      </motion.svg>
    </div>
  );
}
