import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { EASE_IN_OUT, EASE_OUT, HALO_BREATH } from "./premium/tokens";
import { discTierFor, type DiscSurface } from "./premium/discUniverse";

// ============================================================
// LE DISQUE — symbole officiel de CORTEX, relique unique du joueur.
//
// UNE seule silhouette, immuable : jante biseautée → gorge gravée → champ →
// cœur d'énergie, avec le NOM DU RANG gravé en arc (jamais de chiffre, jamais
// de poids). Ce n'est pas un disque de musculation : c'est un artefact
// mythique qui absorbe la puissance du joueur. Ce qui évolue d'un rang à
// l'autre (diamètre, épaisseur, matière, gravures, cœur, énergie, environnement)
// vient de `discUniverse.ts` ; les couleurs/matières de `rankVisuals.ts`.
//
// Réutilisable partout (Hero, montée de rang, Chroniques, Reliques…).
// `variant="hero"` = pleine mise en scène ; `variant="emblem"` = la pièce seule.
// ============================================================

interface RankDiscProps {
  rank: RankState;
  size?: number;
  variant?: "hero" | "emblem";
  animated?: boolean;
  revealDelay?: number;
}

// Géométrie de base (viewBox 200×200, centre 100,100) — CONSTANTE tous rangs.
const C = 100;
const OUTER = 94;

// ── Cœur d'énergie : le puits central de la relique ─────────────────────────
function DiscCore({
  color,
  glow,
  energy,
  surface,
  animated,
}: {
  color: string;
  glow: string;
  energy: number;
  surface: DiscSurface;
  animated: boolean;
}) {
  const coreR = 24;
  return (
    <g>
      {/* Bore gravé en creux */}
      <circle cx={C} cy={C} r={coreR} fill="#05050a" />
      <circle
        cx={C}
        cy={C}
        r={coreR}
        fill="none"
        stroke="#000"
        strokeOpacity="0.7"
        strokeWidth="2.5"
      />
      {/* Lueur du cœur — s'intensifie avec le rang */}
      <motion.circle
        cx={C}
        cy={C}
        r={coreR * (0.42 + energy * 0.4)}
        fill={color}
        style={{ filter: `blur(${2 + energy * 4}px)` }}
        animate={
          animated
            ? { opacity: [0.35 + energy * 0.3, 0.7 + energy * 0.3, 0.35 + energy * 0.3] }
            : undefined
        }
        transition={
          animated ? { duration: 3.2 - energy, repeat: Infinity, ease: EASE_IN_OUT } : undefined
        }
      />
      {/* Point de puissance central */}
      <circle cx={C} cy={C} r={2 + energy * 2.2} fill="#ffffff" opacity={0.5 + energy * 0.45} />
      {/* Étoile divine / cosmique au cœur des hauts rangs */}
      {(surface === "divine" || surface === "cosmic") && animated && (
        <motion.g
          style={{ transformOrigin: `${C}px ${C}px` }}
          animate={{ rotate: surface === "cosmic" ? 360 : [0, 8, 0] }}
          transition={{
            duration: surface === "cosmic" ? 40 : 6,
            repeat: Infinity,
            ease: surface === "cosmic" ? "linear" : EASE_IN_OUT,
          }}
        >
          {[0, 45, 90, 135].map((a) => (
            <rect
              key={a}
              x={C - 0.7}
              y={C - coreR * 0.9}
              width="1.4"
              height={coreR * 1.8}
              rx="0.7"
              fill={glow}
              opacity="0.6"
              transform={`rotate(${a} ${C} ${C})`}
            />
          ))}
        </motion.g>
      )}
      {/* Anneau du cœur */}
      <circle
        cx={C}
        cy={C}
        r={coreR}
        fill="none"
        stroke={color}
        strokeOpacity={0.35 + energy * 0.4}
        strokeWidth="1"
      />
    </g>
  );
}

// ── Effets de surface propres à la matière du rang ──────────────────────────
function SurfaceFX({
  surface,
  faceR,
  color,
  glow,
  energy,
  animated,
}: {
  surface: DiscSurface;
  faceR: number;
  color: string;
  glow: string;
  energy: number;
  animated: boolean;
}) {
  // Positions déterministes (pas de random au render).
  const seeds = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const r = ((i * 9301 + 49297) % 233280) / 233280;
        const r2 = ((i * 4021 + 7919) % 3571) / 3571;
        const a = r * Math.PI * 2;
        const rad = 30 + r2 * (faceR - 34);
        return { x: C + Math.cos(a) * rad, y: C + Math.sin(a) * rad, r, r2, a };
      }),
    [faceR],
  );

  switch (surface) {
    case "molten": // Titan — fissures de lave incandescentes
      return (
        <g>
          {seeds.slice(0, 6).map((s, i) => {
            const x2 = C + Math.cos(s.a) * faceR * 0.94;
            const y2 = C + Math.sin(s.a) * faceR * 0.94;
            const mx = (s.x + x2) / 2 + (s.r - 0.5) * 12;
            const my = (s.y + y2) / 2 + (s.r2 - 0.5) * 12;
            return (
              <motion.path
                key={i}
                d={`M ${s.x.toFixed(1)} ${s.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`}
                fill="none"
                stroke={glow}
                strokeWidth={1 + s.r}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 ${2 + energy * 3}px ${color})` }}
                animate={animated ? { opacity: [0.35, 0.85, 0.35] } : undefined}
                transition={
                  animated
                    ? {
                        duration: 2.4 + s.r * 2,
                        repeat: Infinity,
                        ease: EASE_IN_OUT,
                        delay: s.r2 * 2,
                      }
                    : undefined
                }
              />
            );
          })}
        </g>
      );
    case "cosmic": // Primordial — constellations reliées + éclats de cristal
      return (
        <g>
          {seeds.map((s, i) => {
            const n = seeds[(i + 3) % seeds.length];
            return i % 2 === 0 ? (
              <line
                key={`l${i}`}
                x1={s.x}
                y1={s.y}
                x2={n.x}
                y2={n.y}
                stroke={color}
                strokeOpacity="0.25"
                strokeWidth="0.5"
              />
            ) : null;
          })}
          {seeds.map((s, i) => (
            <motion.circle
              key={`c${i}`}
              cx={s.x}
              cy={s.y}
              r={0.7 + s.r * 1.6}
              fill="#ffffff"
              style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
              animate={animated ? { opacity: [0.2, 0.95, 0.2] } : undefined}
              transition={
                animated
                  ? {
                      duration: 2.5 + s.r * 3,
                      repeat: Infinity,
                      ease: EASE_IN_OUT,
                      delay: s.r2 * 3,
                    }
                  : undefined
              }
            />
          ))}
        </g>
      );
    case "divine": // Olympien — poussière d'or scintillante
      return (
        <g>
          {seeds.slice(0, 9).map((s, i) => (
            <motion.circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={0.8 + s.r * 1.4}
              fill={glow}
              style={{ filter: `drop-shadow(0 0 3px ${color})` }}
              animate={animated ? { opacity: [0.15, 0.9, 0.15] } : undefined}
              transition={
                animated
                  ? {
                      duration: 3 + s.r * 2,
                      repeat: Infinity,
                      ease: EASE_IN_OUT,
                      delay: s.r2 * 2.4,
                    }
                  : undefined
              }
            />
          ))}
        </g>
      );
    case "forge": // Guerrier — étincelles vives, brèves
      return (
        <g>
          {seeds.slice(0, 7).map((s, i) => (
            <motion.circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={0.8 + s.r}
              fill={glow}
              animate={animated ? { opacity: [0, 1, 0] } : { opacity: 0.4 }}
              transition={
                animated
                  ? {
                      duration: 1.4 + s.r,
                      repeat: Infinity,
                      ease: "easeOut",
                      delay: s.r2 * 3,
                      repeatDelay: 1.5,
                    }
                  : undefined
              }
            />
          ))}
        </g>
      );
    default: // raw / rune — pas d'effet flottant additionnel ici
      return null;
  }
}

export function RankDisc({
  rank,
  size = 160,
  variant = "hero",
  animated = true,
  revealDelay = 0,
}: RankDiscProps) {
  const { primary, secondary, glow, text } = rank.rank.colors;
  const visual = getRankVisual(rank.rank.key);
  const tier = discTierFor(rank.rank.key);
  const isHero = variant === "hero";
  const uid = useId();
  const rimId = `rim-${uid}`;
  const faceId = `face-${uid}`;
  const bevelId = `bevel-${uid}`;
  const glossId = `gloss-${uid}`;
  const nameId = `name-${uid}`;
  const clipId = `clip-${uid}`;

  const rimStops = visual.metal.match(/#[0-9a-f]{6}/gi)?.slice(0, 3) ?? ["#555", "#888", "#333"];
  const faceStops = visual.enamel.match(/#[0-9a-f]{6}/gi)?.slice(0, 3) ?? ["#333", "#222", "#111"];

  // Géométrie dérivée du rang (proportions constantes, valeurs qui évoluent).
  const rimInner = OUTER * (1 - tier.rim);
  const grooveR = rimInner - 3;
  const faceR = grooveR - 2;
  const engraveR = faceR - 11; // rayon du texte gravé (arc haut)
  const coreR = 24;

  // Rayons gravés (spokes) — texture radiale.
  const spokes = useMemo(
    () => Array.from({ length: tier.spokes }, (_, i) => (i / tier.spokes) * 360),
    [tier.spokes],
  );
  // Encoches runiques sur l'anneau intérieur.
  const runes = useMemo(
    () => Array.from({ length: tier.runes }, (_, i) => (i / Math.max(1, tier.runes)) * 360),
    [tier.runes],
  );

  const label = rank.rank.label.toUpperCase();
  // Espacement du nom gravé adapté à sa longueur (reste lisible & centré).
  const nameSpacing = Math.max(2, 9 - label.length * 0.55);
  // Arc supérieur pour le textPath (West → sommet → East, sens horaire).
  const arcPath = `M ${C - engraveR} ${C} A ${engraveR} ${engraveR} 0 0 1 ${C + engraveR} ${C}`;

  const floatY = isHero ? -6 - tier.energy * 4 : -3;

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size, perspective: 800 }}
      initial={{ opacity: 0, scale: 0.82, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.85, delay: revealDelay, ease: EASE_OUT }}
    >
      {/* Socle lumineux au sol (hero) — la relique lévite au-dessus d'une lueur */}
      {isHero && (
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 rounded-[50%] blur-2xl"
          style={{
            bottom: -size * 0.04,
            width: size * 0.78,
            height: size * 0.16,
            background: glow,
          }}
          animate={
            animated
              ? { opacity: [0.3, 0.55 + tier.energy * 0.25, 0.3], scaleX: [0.86, 1.08, 0.86] }
              : undefined
          }
          transition={{ duration: 4.4, repeat: Infinity, ease: EASE_IN_OUT }}
          aria-hidden
        />
      )}

      {/* Basculement 3D + flottement — la relique « vit » (plus haut rang = plus vivante) */}
      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size, transformStyle: "preserve-3d" }}
        animate={
          animated ? { rotateY: [-5, 5, -5], rotateX: [3, -3, 3], y: [0, floatY, 0] } : undefined
        }
        transition={
          animated
            ? { duration: 9 - tier.energy * 2, repeat: Infinity, ease: EASE_IN_OUT }
            : undefined
        }
      >
        {/* Halo respirant */}
        <motion.div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{
            background: glow,
            transform: `scale(${(isHero ? 1.15 : 0.95) + tier.energy * 0.25})`,
          }}
          animate={animated ? HALO_BREATH.animate : undefined}
          transition={animated ? HALO_BREATH.transition : undefined}
          aria-hidden
        />

        {/* Anneau conique rotatif d'énergie (derrière le disque) */}
        {animated && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, ${secondary}90 55deg, transparent 130deg, transparent 220deg, ${primary}70 285deg, transparent 350deg)`,
              filter: "blur(6px)",
              opacity: (isHero ? 0.55 : 0.4) + tier.energy * 0.25,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 26 - tier.energy * 8, repeat: Infinity, ease: "linear" }}
            aria-hidden
          />
        )}

        {/* Rayons divins tournants (Olympien) */}
        {animated && tier.surface === "divine" && (
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: size * 1.5,
              height: size * 1.5,
              background: `conic-gradient(from 0deg, transparent 0deg, ${glow} 10deg, transparent 30deg, transparent 90deg, ${glow} 100deg, transparent 122deg, transparent 200deg, ${glow} 210deg, transparent 232deg)`,
              maskImage: "radial-gradient(circle, black 28%, transparent 68%)",
              WebkitMaskImage: "radial-gradient(circle, black 28%, transparent 68%)",
              opacity: 0.5,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
            aria-hidden
          />
        )}

        <svg viewBox="0 0 200 200" width={size} height={size} className="relative">
          <defs>
            <radialGradient id={rimId} cx="38%" cy="30%" r="75%">
              {rimStops.map((c, i) => (
                <stop
                  key={i}
                  offset={`${(i / Math.max(1, rimStops.length - 1)) * 100}%`}
                  stopColor={c}
                />
              ))}
            </radialGradient>
            <radialGradient id={faceId} cx="40%" cy="32%" r="80%">
              {faceStops.map((c, i) => (
                <stop
                  key={i}
                  offset={`${(i / Math.max(1, faceStops.length - 1)) * 100}%`}
                  stopColor={c}
                />
              ))}
            </radialGradient>
            <linearGradient id={bevelId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="55%" stopColor="#000000" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id={glossId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <clipPath id={clipId}>
              <circle cx={C} cy={C} r={OUTER} />
            </clipPath>
            <path id={nameId} d={arcPath} />
          </defs>

          {/* Échelle du diamètre selon le rang (la relique grandit, centrée) */}
          <g transform={`translate(${C} ${C}) scale(${tier.scale}) translate(${-C} ${-C})`}>
            {/* Ombre portée */}
            <circle cx={C} cy={C + 3} r={OUTER} fill="#000000" opacity="0.5" />

            {/* Jante métal */}
            <circle
              cx={C}
              cy={C}
              r={OUTER}
              fill={`url(#${rimId})`}
              stroke={secondary}
              strokeOpacity="0.85"
              strokeWidth="1"
            />
            {/* Biseau extérieur (relief) */}
            <circle
              cx={C}
              cy={C}
              r={OUTER - 2}
              fill="none"
              stroke={`url(#${bevelId})`}
              strokeWidth="3"
            />

            {/* Gorge gravée (creux entre jante et champ) */}
            <circle cx={C} cy={C} r={grooveR + 2} fill="#000000" opacity={0.55 * tier.groove} />
            <circle
              cx={C}
              cy={C}
              r={rimInner}
              fill="none"
              stroke="#000"
              strokeOpacity={0.6 * tier.groove}
              strokeWidth="2.5"
            />

            {/* Champ intérieur (matière émaillée) */}
            <circle
              cx={C}
              cy={C}
              r={faceR}
              fill={`url(#${faceId})`}
              stroke={primary}
              strokeOpacity="0.5"
              strokeWidth="0.8"
            />

            {/* Rayons gravés (spokes) — texture radiale */}
            <g opacity={0.25 + tier.groove * 0.4}>
              {spokes.map((a) => (
                <rect
                  key={a}
                  x={C - 0.5}
                  y={C - faceR + 6}
                  width="1"
                  height={faceR - coreR - 8}
                  fill="#000000"
                  transform={`rotate(${a} ${C} ${C})`}
                />
              ))}
            </g>

            {/* Encoches runiques sur l'anneau intérieur (s'allument avec le rang) */}
            {runes.map((a) => {
              const rad = faceR - 5;
              const x = C + Math.cos((a * Math.PI) / 180) * rad;
              const y = C + Math.sin((a * Math.PI) / 180) * rad;
              return (
                <circle
                  key={a}
                  cx={x}
                  cy={y}
                  r={1.2}
                  fill={text}
                  opacity={0.3 + tier.energy * 0.5}
                  style={{ filter: tier.energy > 0.4 ? `drop-shadow(0 0 2px ${glow})` : undefined }}
                />
              );
            })}

            {/* Effets de surface (lave, constellations, or, étincelles) */}
            <SurfaceFX
              surface={tier.surface}
              faceR={faceR}
              color={primary}
              glow={glow}
              energy={tier.energy}
              animated={animated}
            />

            {/* NOM DU RANG gravé en arc — inscription en creux (intaglio), l'identité
                de la relique. Jamais un chiffre. Lisible sur toute matière : lueur
                interne (hauts rangs) → arête lumineuse basse → creux sombre au-dessus. */}
            {(() => {
              const nameFont = {
                fontFamily: "ui-serif, Georgia, serif" as const,
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: nameSpacing,
              };
              const path = (extra?: { dx?: number; dy?: number }) => (
                <textPath
                  href={`#${nameId}`}
                  startOffset="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={extra ? `translate(${extra.dx ?? 0},${extra.dy ?? 0})` : undefined}
                >
                  {label}
                </textPath>
              );
              return (
                <g>
                  {/* Lueur interne (la gravure semble chargée d'énergie) */}
                  {tier.energy > 0.35 && (
                    <text
                      {...nameFont}
                      fill={glow}
                      opacity={0.5 + tier.energy * 0.4}
                      style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
                    >
                      {path()}
                    </text>
                  )}
                  {/* Arête inférieure captant la lumière */}
                  <text {...nameFont} fill="#ffffff" opacity="0.4">
                    {path({ dy: 1.1 })}
                  </text>
                  {/* Creux sombre — le corps de la lettre entaillée */}
                  <text {...nameFont} fill="#050507" opacity="0.85">
                    {path()}
                  </text>
                </g>
              );
            })()}

            {/* Cœur d'énergie */}
            <DiscCore
              color={primary}
              glow={glow}
              energy={tier.energy}
              surface={tier.surface}
              animated={animated}
            />

            {/* Reflet spéculaire qui balaie la surface */}
            {animated && (
              <g clipPath={`url(#${clipId})`}>
                <motion.rect
                  x="-120"
                  y="0"
                  width="70"
                  height="200"
                  fill={`url(#${glossId})`}
                  transform="skewX(-20)"
                  animate={{ x: [-120, 280] }}
                  transition={{
                    duration: 5.5,
                    repeat: Infinity,
                    repeatDelay: 2.6,
                    ease: EASE_IN_OUT,
                  }}
                />
              </g>
            )}
          </g>
        </svg>
      </motion.div>
    </motion.div>
  );
}
