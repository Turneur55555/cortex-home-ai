import type { SigilKind } from "@/lib/fitness/rankVisuals";

// ============================================================
// Sigils de rang — artefacts SVG (viewBox 64x64), pleins, ombrage doux.
// EXTRAIT de ExerciseRankBadge pour être partagé par le Blason premium et
// le badge existant (règle anti-doublon). Un seul jeu de tracés pour tout
// le RPG. Chaque sigil incarne un rang : rune (Mortel), épées (Guerrier),
// laurier (Héros), flamme (Titan), foudre (Olympien), galaxie (Primordial).
// ============================================================
export function RankSigil({
  kind,
  color,
  accent,
}: {
  kind: SigilKind;
  color: string;
  accent: string;
}) {
  const s = { fill: color, stroke: accent, strokeWidth: 1.2, strokeLinejoin: "round" as const };
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
          <path
            d="M32 32 C33 36 35 38 35 41 C35 44 33 46 32 46 C31 46 29 44 29 41 C29 38 31 36 32 32 Z"
            fill={accent}
            stroke="none"
            opacity="0.85"
          />
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
