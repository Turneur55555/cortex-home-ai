import { useId } from "react";
import { motion } from "framer-motion";
import { HelpCircle, Lock } from "lucide-react";
import { getRarityVisual } from "@/lib/fitness/rarityVisuals";
import type { BadgeRarity } from "@/lib/fitness/badges";

interface Props {
  rarity: BadgeRarity;
  icon: React.FC<{ className?: string }>;
  size?: number;
  unlocked?: boolean;
  /** Secret non révélé : affiche un point d'interrogation plutôt que l'icône. */
  isSecret?: boolean;
  isComingSoon?: boolean;
  /**
   * Animations en boucle (halo, anneau tournant, reflet). Réservées aux
   * badges mis en avant (hero, cinématique de déblocage) — désactivées par
   * défaut dans la grille dense pour respecter `docs/ui-rules.md`
   * ("animations légères") et rester fluide sur mobile en scroll.
   */
  animated?: boolean;
}

/**
 * Médaillon héraldique de badge — même technique de construction (plaque
 * métal + émail + reflet) que `ExerciseRankBadge`, mais paramétré par
 * `BadgeRarity` plutôt que par rang d'exercice. Composant volontairement
 * séparé : on ne modifie pas `ExerciseRankBadge` (déjà utilisé et validé
 * ailleurs), on réutilise seulement le langage visuel.
 */
export function BadgeMedallion({
  rarity,
  icon: Icon,
  size = 56,
  unlocked = true,
  isSecret = false,
  isComingSoon = false,
  animated = false,
}: Props) {
  const visual = getRarityVisual(rarity);
  const uid = useId();
  const metalId = `badge-metal-${uid}`;
  const enamelId = `badge-enamel-${uid}`;
  const glossId = `badge-gloss-${uid}`;
  const clipId = `badge-clip-${uid}`;

  const metalStops = visual.metal.match(/#[0-9a-f]{6}/gi)?.slice(0, 3) ?? [];
  const enamelStops = visual.enamel.match(/#[0-9a-f]{6}/gi)?.slice(0, 3) ?? [];

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      animate={animated && unlocked ? { y: [0, -2, 0] } : undefined}
      transition={animated ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : undefined}
    >
      {animated && unlocked && (
        <motion.div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{ background: visual.vignette }}
          animate={{ opacity: [0.5, 0.8, 0.5], scale: [0.9, 1.05, 0.9] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <svg viewBox="0 0 64 64" width={size} height={size} className="relative">
        <defs>
          <linearGradient id={metalId} x1="0" x2="1" y1="0" y2="1">
            {metalStops.map((c, i, arr) => (
              <stop key={i} offset={`${(i / Math.max(1, arr.length - 1)) * 100}%`} stopColor={c} />
            ))}
          </linearGradient>
          <radialGradient id={enamelId} cx="35%" cy="30%" r="75%">
            {enamelStops.map((c, i, arr) => (
              <stop key={i} offset={`${(i / Math.max(1, arr.length - 1)) * 100}%`} stopColor={c} />
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

        <polygon
          points="32,3 59,17.5 59,46.5 32,61 5,46.5 5,17.5"
          fill={unlocked ? `url(#${metalId})` : "rgba(255,255,255,0.04)"}
          stroke={unlocked ? visual.vignette : "rgba(255,255,255,0.08)"}
          strokeOpacity="0.8"
          strokeWidth="0.8"
        />
        <polygon
          points="32,10 53,21 53,43 32,54 11,43 11,21"
          fill={unlocked ? `url(#${enamelId})` : "rgba(255,255,255,0.03)"}
          stroke={unlocked ? visual.vignette : "rgba(255,255,255,0.06)"}
          strokeOpacity="0.6"
          strokeWidth="0.5"
        />

        <foreignObject x="20" y="18" width="24" height="24">
          <div className="flex h-full w-full items-center justify-center">
            {isSecret ? (
              <HelpCircle className="h-5 w-5 text-white/30" />
            ) : isComingSoon ? (
              <Lock className="h-5 w-5 text-white/30" />
            ) : (
              <Icon className={unlocked ? "h-5 w-5 text-white" : "h-5 w-5 text-white/25"} />
            )}
          </div>
        </foreignObject>

        {animated && unlocked && (
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
      </svg>
    </motion.div>
  );
}
