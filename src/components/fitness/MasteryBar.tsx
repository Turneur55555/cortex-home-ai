import { motion } from "framer-motion";

/**
 * Barre de Maîtrise premium — remplissage animé + shimmer + segments.
 * Purement visuelle : la valeur `percent` est fournie par le moteur.
 */
export function MasteryBar({
  percent,
  colors,
  segments = 5,
  height = 12,
  showLabel = true,
}: {
  percent: number;
  colors: { gradient: string; primary: string; secondary: string; glow: string };
  segments?: number;
  height?: number;
  /** Pastille de pourcentage flottante au-dessus de la barre. */
  showLabel?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative">
      {/* Rail creusé */}
      <div
        className="relative overflow-hidden rounded-full"
        style={{
          height,
          background: "linear-gradient(180deg,rgba(0,0,0,0.55) 0%,rgba(255,255,255,0.02) 100%)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Remplissage */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="relative h-full rounded-full"
          style={{
            background: colors.gradient,
            boxShadow: `0 0 14px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.35)`,
          }}
        >
          {/* Shimmer qui traverse */}
          <motion.div
            className="absolute inset-y-0 w-1/3"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)",
              mixBlendMode: "overlay",
            }}
            initial={{ x: "-120%" }}
            animate={{ x: "320%" }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.4 }}
          />
        </motion.div>

        {/* Segments (encoches des 5 niveaux) */}
        <div className="pointer-events-none absolute inset-0 flex">
          {Array.from({ length: segments - 1 }).map((_, i) => (
            <div key={i} className="flex-1 border-r" style={{ borderColor: "rgba(0,0,0,0.55)" }} />
          ))}
          <div className="flex-1" />
        </div>
      </div>

      {/* Pill du pourcentage */}
      {showLabel && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="absolute -top-2 -translate-y-full"
          style={{ left: `calc(${clamped}% - 22px)` }}
        >
          <div
            className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
            style={{
              background: colors.primary,
              color: "#fff",
              boxShadow: `0 4px 12px ${colors.glow}`,
            }}
          >
            {Math.round(clamped)}%
          </div>
        </motion.div>
      )}
    </div>
  );
}
