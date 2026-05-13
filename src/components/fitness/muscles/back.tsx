import type { MuscleId } from "@/lib/fitness/muscleMapping";

type Props = {
  getColor: (id: MuscleId) => string;
  onMuscle?: (id: MuscleId) => void;
  activeMuscle?: MuscleId | null;
};

const STROKE = "rgba(255,255,255,0.15)";

export function BackView({ getColor, onMuscle, activeMuscle }: Props) {
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
      <title>Vue dorsale</title>

      {/* Tête */}
      <ellipse cx="70" cy="22" rx="14" ry="17" fill="none" stroke={STROKE} strokeWidth="0.8" />
      {/* Cou */}
      <rect x="63" y="38" width="14" height="10" rx="3" fill="none" stroke={STROKE} strokeWidth="0.8" />

      {/* Trapèzes supérieurs */}
      <path d="M48 48 L63 46 L63 62 L48 66 Z" {...handlers("trapeze")} />
      <path d="M92 48 L77 46 L77 62 L92 66 Z" {...handlers("trapeze")} />

      {/* Deltoïdes postérieurs */}
      <path d="M38 56 Q46 48 54 54 L50 72 Q40 68 38 56 Z" {...handlers("epaules")} />
      <path d="M102 56 Q94 48 86 54 L90 72 Q100 68 102 56 Z" {...handlers("epaules")} />

      {/* Dos / Grand dorsal + Rhomboïdes */}
      <path d="M54 58 Q70 52 86 58 L88 110 Q70 118 52 110 Z" {...handlers("dos")} />

      {/* Triceps */}
      <path d="M36 72 L46 68 L44 108 L34 106 Z" {...handlers("triceps")} />
      <path d="M104 72 L94 68 L96 108 L106 106 Z" {...handlers("triceps")} />

      {/* Avant-bras postérieurs */}
      <path d="M32 108 L44 110 L42 148 L30 144 Z" {...handlers("avant-bras")} />
      <path d="M108 108 L96 110 L98 148 L110 144 Z" {...handlers("avant-bras")} />

      {/* Lombaires / Érecteurs */}
      <path d="M58 112 L82 112 L80 146 L60 146 Z" {...handlers("lombaires")} />

      {/* Fessiers */}
      <path d="M50 146 L90 146 L88 180 Q70 190 52 180 Z" {...handlers("fessiers")} />

      {/* Ischio-jambiers */}
      <path d="M52 182 L68 186 L64 238 Q56 244 48 236 Z" {...handlers("ischio")} />
      <path d="M88 182 L72 186 L76 238 Q84 244 92 236 Z" {...handlers("ischio")} />

      {/* Mollets / Soléaire */}
      <path d="M48 242 L64 240 L60 296 Q52 302 46 294 Z" {...handlers("mollets")} />
      <path d="M92 242 L76 240 L80 296 Q88 302 94 294 Z" {...handlers("mollets")} />
    </svg>
  );
}
