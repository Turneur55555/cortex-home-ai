import { useId } from "react";
import { motion } from "framer-motion";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { getRankVisual, type SigilKind } from "@/lib/fitness/rankVisuals";

// ============================================================
// Sigils — pleins, ombrage doux, plus artefacts que icônes.
// ============================================================
function Sigil({ kind, color, accent }: { kind: SigilKind; color: string; accent: string }) {
  const fill = color;
  const stroke = accent;
  const s = { fill, stroke, strokeWidth: 1.2, strokeLinejoin: "round" as const };
  switch (kind) {
    case "rune":
      return (
        <g {...s}>
          <path d="M32 14 L42 22 L38 34 L32 30 L26 34 L22 22 Z" opacity="0.95" />
          <path d="M32 30 L32 44" strokeWidth="2" />
          <circle cx="32" cy="44" r="2" />
        </g>
      );
    case "swords":
      return (
        <g {...s}>
          <path d="M20 16 L34 40 L30 42 L18 20 Z" />
          <path d="M44 16 L30 40 L34 42 L46 20 Z" />
          <rect x="30" y="42" width="4" height="6" rx="1" />
          <path d="M26 44 L38 44" strokeWidth="2" />
        </g>
      );
    case "laurel":
      return (
        <g fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
          <path d="M32 14 C22 16 16 22 16 34 C16 42 22 48 32 50" />
          <path d="M32 14 C42 16 48 22 48 34 C48 42 42 48 32 50" />
          <path d="M20 22 L14 20 M22 30 L14 30 M22 38 L14 40" />
          <path d="M44 22 L50 20 M42 30 L50 30 M42 38 L50 40" />
          <circle cx="32" cy="16" r="2" fill={accent} stroke="none" />
        </g>
      );
    case "flame":
      return (
        <g {...s}>
          <path d="M32 12 C36 20 42 24 42 34 C42 43 37 50 32 50 C27 50 22 43 22 34 C22 27 26 24 28 20 C29 25 30 27 32 29 C33 25 32 18 32 12 Z" />
          <path d="M32 32 C33 36 35 38 35 41 C35 44 33 46 32 46 C31 46 29 44 29 41 C29 38 31 36 32 32 Z" fill={accent} stroke="none" opacity="0.85" />
        </g>
      );
    case "thunder":
      return (
        <g {...s}>
          <circle cx="32" cy="24" r="8" fill={accent} stroke="none" opacity="0.9" />
          <path d="M32 16 L28 12 M32 16 L36 12 M24 20 L20 18 M40 20 L44 18" strokeWidth="1.8" />
          <path d="M34 30 L20 44 L30 44 L26 54 L44 38 L34 38 Z" />
        </g>
      );
    case "galaxy":
      return (
        <g stroke={accent} strokeWidth="1.2" fill="none">
          <ellipse cx="32" cy="32" rx="18" ry="6" transform="rotate(30 32 32)" opacity="0.6" />
          <ellipse cx="32" cy="32" rx="18" ry="6" transform="rotate(-30 32 32)" opacity="0.6" />
          <circle cx="32" cy="32" r="4" fill={color} stroke="none" />
          <circle cx="32" cy="32" r="2" fill={accent} stroke="none" />
          <circle cx="14" cy="20" r="0.8" fill={accent} stroke="none" />
          <circle cx="52" cy="18" r="0.6" fill={accent} stroke="none" />
          <circle cx="50" cy="46" r="0.8" fill={accent} stroke="none" />
          <circle cx="16" cy="48" r="0.6" fill={accent} stroke="none" />
        </g>
      );
  }
}

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
            {visual.metal.match(/#[0-9a-f]{6}/gi)?.slice(0, 3).map((c, i, arr) => (
              <stop key={i} offset={`${(i / (arr.length - 1)) * 100}%`} stopColor={c} />
            ))}
          </linearGradient>
          <radialGradient id={enamelId} cx="35%" cy="30%" r="75%">
            {visual.enamel.match(/#[0-9a-f]{6}/gi)?.slice(0, 3).map((c, i, arr) => (
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
          <Sigil kind={visual.sigil} color={text} accent={secondary} />
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
          <rect x="22" y="52" width="20" height="9" rx="1.5" fill={`url(#${metalId})`} opacity="0.35" />
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
