import type { MuscleId } from "@/lib/fitness/muscleMapping";

type Props = {
  getColor: (id: MuscleId) => string;
  onMuscle?: (id: MuscleId) => void;
  activeMuscle?: MuscleId | null;
};

const STROKE = "rgba(255,255,255,0.15)";

export function FrontView({ getColor, onMuscle, activeMuscle }: Props) {
  const handlers = (id: MuscleId) => ({
    fill: getColor(id),
    stroke: activeMuscle === id ? "rgba(255,255,255,0.6)" : STROKE,
    strokeWidth: activeMuscle === id ? 1.5 : 0.8,
    className: "cursor-pointer transition-all duration-300",
    onClick: () => onMuscle?.(id),
    onMouseEnter: () => onMuscle?.(id),
    style: id === activeMuscle ? { filter: "brightness(1.3)" } : undefined,
  });

  return (
    <svg viewBox="0 0 140 320" className="h-full w-full">
      <title>Vue frontale</title>

      {/* Tête (décoratif) */}
      <ellipse cx="70" cy="22" rx="14" ry="17" fill="none" stroke={STROKE} strokeWidth="0.8" />
      {/* Cou */}
      <rect x="63" y="38" width="14" height="10" rx="3" fill="none" stroke={STROKE} strokeWidth="0.8" />

      {/* Trapèzes */}
      <path d="M48 50 L63 48 L63 58 L50 62 Z" {...handlers("trapeze")} />
      <path d="M92 50 L77 48 L77 58 L90 62 Z" {...handlers("trapeze")} />

      {/* Épaules / Deltoïdes */}
      <path d="M38 56 Q46 48 54 54 L50 72 Q40 68 38 56 Z" {...handlers("epaules")} />
      <path d="M102 56 Q94 48 86 54 L90 72 Q100 68 102 56 Z" {...handlers("epaules")} />

      {/* Pectoraux */}
      <path d="M54 58 Q70 52 86 58 L84 82 Q70 88 56 82 Z" {...handlers("pectoraux")} />

      {/* Biceps */}
      <path d="M36 72 L46 68 L44 108 L34 106 Z" {...handlers("biceps")} />
      <path d="M104 72 L94 68 L96 108 L106 106 Z" {...handlers("biceps")} />

      {/* Avant-bras */}
      <path d="M32 108 L44 110 L42 148 L30 144 Z" {...handlers("avant-bras")} />
      <path d="M108 108 L96 110 L98 148 L110 144 Z" {...handlers("avant-bras")} />

      {/* Abdos */}
      <path d="M60 86 L80 86 L78 142 L62 142 Z" {...handlers("abdos")} />

      {/* Obliques */}
      <path d="M50 82 L60 86 L62 142 L52 136 Z" {...handlers("obliques")} />
      <path d="M90 82 L80 86 L78 142 L88 136 Z" {...handlers("obliques")} />

      {/* Quadriceps */}
      <path d="M52 148 L68 150 L64 230 Q56 236 48 228 Z" {...handlers("quadriceps")} />
      <path d="M88 148 L72 150 L76 230 Q84 236 92 228 Z" {...handlers("quadriceps")} />

      {/* Mollets */}
      <path d="M48 240 L64 236 L60 296 Q52 302 46 294 Z" {...handlers("mollets")} />
      <path d="M92 240 L76 236 L80 296 Q88 302 94 294 Z" {...handlers("mollets")} />
    </svg>
  );
}
