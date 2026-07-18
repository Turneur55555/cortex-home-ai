import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { EASE_IN_OUT, EASE_OUT, HALO_BREATH } from "./premium/tokens";
import { discTierFor, type DiscTier } from "./premium/discUniverse";

// ============================================================
// LE DISQUE — symbole officiel de CORTEX, relique unique du joueur.
//
// Objectif de rendu : un OBJET RÉEL forgé, pas une icône UI. Métal réaliste
// (texture de forge procédurale via feTurbulence + éclairage feDiffuse/
// feSpecular), relief profond, jante massive, gravures sculptées en creux,
// usure (micro-rayures, éclats), lumière cinématographique (key light + rim
// light + vignette), cœur d'énergie crédible, ombre de contact lourde.
//
// UNE seule silhouette immuable (jante → gorge → champ → cœur, nom gravé en
// arc). Ce qui évolue vient de `discUniverse.ts` ; les couleurs de
// `rankVisuals.ts`. Le fond participe (poussière/braises/éclats), avec
// sobriété : les effets servent le disque, jamais l'inverse.
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
// Une seule direction de lumière pour tout l'objet (clé du rendu « photographié »).
const LIGHT_AZ = 235;

/** Aléa déterministe (aucun random au render). */
function det(i: number, salt = 0): number {
  const t = (i * 9301 + (salt + 1) * 49297) % 233280;
  return t / 233280;
}

// ── Cœur d'énergie : puits profond, bloom crédible ──────────────────────────
function DiscCore({
  glow,
  text,
  tier,
  ids,
  animated,
}: {
  glow: string;
  text: string;
  tier: DiscTier;
  ids: { coreGlow: string; coreWell: string; coreHot: string };
  animated: boolean;
}) {
  const coreR = 22;
  const e = tier.energy;
  return (
    <g>
      {/* Bloom d'énergie derrière le puits — respire */}
      <motion.circle
        cx={C}
        cy={C}
        r={coreR * (1.1 + e * 0.9)}
        fill={`url(#${ids.coreGlow})`}
        animate={
          animated ? { opacity: [0.4 + e * 0.3, 0.75 + e * 0.25, 0.4 + e * 0.3] } : undefined
        }
        transition={
          animated ? { duration: 3.4 - e, repeat: Infinity, ease: EASE_IN_OUT } : undefined
        }
      />
      {/* Paroi du puits (recreusé, sombre) */}
      <circle cx={C} cy={C} r={coreR} fill={`url(#${ids.coreWell})`} />
      {/* Ombre interne haute + reflet bas — donne la profondeur du trou */}
      <circle
        cx={C}
        cy={C}
        r={coreR}
        fill="none"
        stroke="#000000"
        strokeOpacity="0.85"
        strokeWidth="3"
      />
      <path
        d={`M ${C - coreR * 0.72} ${C + coreR * 0.5} A ${coreR} ${coreR} 0 0 0 ${C + coreR * 0.72} ${C + coreR * 0.5}`}
        fill="none"
        stroke={text}
        strokeOpacity="0.25"
        strokeWidth="1.4"
      />
      {/* Foyer incandescent */}
      <motion.circle
        cx={C}
        cy={C}
        r={coreR * (0.66 + e * 0.2)}
        fill={`url(#${ids.coreHot})`}
        animate={
          animated
            ? {
                opacity: [0.7, 1, 0.7],
                scale: tier.surface === "molten" ? [0.96, 1.05, 0.96] : [1, 1, 1],
              }
            : undefined
        }
        transition={
          animated
            ? { duration: tier.surface === "molten" ? 1.8 : 3, repeat: Infinity, ease: EASE_IN_OUT }
            : undefined
        }
        style={{ transformOrigin: `${C}px ${C}px` }}
      />
      {/* Point de puissance blanc */}
      <circle cx={C} cy={C} r={1.6 + e * 2.4} fill="#ffffff" opacity={0.55 + e * 0.4} />

      {/* Rayons divins (Olympien) — élégants, tournants */}
      {tier.surface === "divine" && animated && (
        <motion.g
          style={{ transformOrigin: `${C}px ${C}px` }}
          animate={{ rotate: [0, 6, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: EASE_IN_OUT }}
        >
          {[0, 30, 60, 90, 120, 150].map((a) => (
            <rect
              key={a}
              x={C - 0.5}
              y={C - coreR * 1.15}
              width="1"
              height={coreR * 2.3}
              rx="0.5"
              fill={glow}
              opacity="0.5"
              transform={`rotate(${a} ${C} ${C})`}
            />
          ))}
        </motion.g>
      )}
      {/* Cœur cosmique tournant (Primordial) */}
      {tier.surface === "cosmic" && animated && (
        <motion.g
          style={{ transformOrigin: `${C}px ${C}px` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 46, repeat: Infinity, ease: "linear" }}
        >
          <ellipse
            cx={C}
            cy={C}
            rx={coreR * 0.85}
            ry={coreR * 0.32}
            fill="none"
            stroke={text}
            strokeOpacity="0.4"
            strokeWidth="0.8"
          />
          <ellipse
            cx={C}
            cy={C}
            rx={coreR * 0.85}
            ry={coreR * 0.32}
            fill="none"
            stroke={text}
            strokeOpacity="0.3"
            strokeWidth="0.8"
            transform={`rotate(60 ${C} ${C})`}
          />
        </motion.g>
      )}

      {/* Lèvre lumineuse du puits (haut) */}
      <path
        d={`M ${C - coreR * 0.8} ${C - coreR * 0.6} A ${coreR} ${coreR} 0 0 1 ${C + coreR * 0.6} ${C - coreR * 0.8}`}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.3"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </g>
  );
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
  const key = rank.rank.key;
  const seed = ["mortel", "guerrier", "heros", "titan", "olympien", "primordial"].indexOf(key) + 1;

  const uid = useId();
  const id = (n: string) => `${n}-${uid}`;
  const ids = {
    forge: id("forge"),
    rim: id("rim"),
    field: id("field"),
    bevel: id("bevel"),
    gloss: id("gloss"),
    clip: id("clip"),
    name: id("name"),
    vignette: id("vig"),
    key: id("key"),
    coreGlow: id("cglow"),
    coreWell: id("cwell"),
    coreHot: id("chot"),
    shadow: id("shadow"),
  };

  const rimStops = visual.metal.match(/#[0-9a-f]{6}/gi)?.slice(0, 3) ?? ["#555", "#888", "#333"];
  const faceStops = visual.enamel.match(/#[0-9a-f]{6}/gi)?.slice(0, 3) ?? ["#333", "#222", "#111"];

  // Géométrie dérivée (proportions constantes, valeurs qui évoluent).
  const rimInner = OUTER * (1 - tier.rim);
  const channelR = rimInner - 1.5;
  const fieldR = rimInner - 2.5;
  const engraveR = rimInner + (OUTER - rimInner) * 0.52; // nom gravé dans la jante massive
  const coreR = 22;

  // Texture de forge (feTurbulence) — paramétrée par la matière du rang.
  const bf = (0.008 + tier.rough * 0.03).toFixed(3);
  const surfaceScale = (1 + tier.relief * 2).toFixed(2);
  // Contraste de la texture de forge (overlay centré sur 0.5 — module sans écraser).
  const texSlope = 0.3 + tier.relief * 0.5;
  const texIntercept = 0.5 - texSlope * 0.5;

  // ── Éléments déterministes ────────────────────────────────────────────────
  const facets = useMemo(
    () => Array.from({ length: tier.spokes }, (_, i) => (i / tier.spokes) * 360),
    [tier.spokes],
  );
  const rivets = useMemo(
    () => Array.from({ length: tier.runes }, (_, i) => (i / Math.max(1, tier.runes)) * 360),
    [tier.runes],
  );
  const scratches = useMemo(() => {
    const n = Math.round(4 + tier.wear * 9);
    return Array.from({ length: n }, (_, i) => {
      const a0 = det(i, seed) * 360;
      const span = 18 + det(i, seed + 3) * 60;
      const r = coreR + 6 + det(i, seed + 5) * (OUTER - coreR - 12);
      const light = i % 3 === 0;
      const w = 0.3 + det(i, seed + 7) * 0.5;
      const a0r = (a0 * Math.PI) / 180;
      const a1r = ((a0 + span) * Math.PI) / 180;
      const x0 = C + Math.cos(a0r) * r;
      const y0 = C + Math.sin(a0r) * r;
      const x1 = C + Math.cos(a1r) * r;
      const y1 = C + Math.sin(a1r) * r;
      const large = span > 180 ? 1 : 0;
      return {
        d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`,
        stroke: light ? "#ffffff" : "#000000",
        opacity: (light ? 0.06 : 0.1) + tier.wear * 0.05,
        w,
      };
    });
  }, [tier.wear, seed]);
  const nicks = useMemo(() => {
    const n = Math.round(tier.wear * 9);
    return Array.from({ length: n }, (_, i) => {
      const a = det(i, seed + 11) * 360;
      const depth = 1.4 + det(i, seed + 13) * 2.6;
      return { a, depth };
    });
  }, [tier.wear, seed]);
  const particles = useMemo(() => {
    if (!isHero) return [];
    const n = 7 + Math.round(tier.energy * 6);
    return Array.from({ length: n }, (_, i) => ({
      id: i,
      left: 10 + det(i, seed + 17) * 80,
      size: 1 + det(i, seed + 19) * 2.4,
      delay: det(i, seed + 23) * 6,
      duration: 4 + det(i, seed + 29) * 5,
      drift: (i % 2 ? 1 : -1) * (6 + det(i, seed + 31) * 14),
    }));
  }, [isHero, tier.energy, seed]);

  const label = rank.rank.label.toUpperCase();
  const nameSpacing = Math.max(1.5, 8.5 - label.length * 0.5);
  const arcPath = `M ${C - engraveR} ${C} A ${engraveR} ${engraveR} 0 0 1 ${C + engraveR} ${C}`;
  const floatY = isHero ? -5 - tier.energy * 4 : -3;

  // Braises (warm) vs poussière (cold) vs éclats (divine/cosmic).
  const warm = key === "guerrier" || key === "titan";
  const partColor = visual.particleColor;

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size, perspective: 900 }}
      initial={{ opacity: 0, scale: 0.82, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.9, delay: revealDelay, ease: EASE_OUT }}
    >
      {/* ── Environnement (derrière) : le fond participe, avec sobriété ──────── */}
      {isHero && (
        <>
          {/* Nappe d'énergie au sol */}
          <motion.div
            className="absolute left-1/2 rounded-[50%] blur-2xl"
            style={{
              bottom: -size * 0.02,
              width: size * 0.9,
              height: size * 0.2,
              x: "-50%",
              background: glow,
            }}
            animate={
              animated
                ? { opacity: [0.25, 0.5 + tier.energy * 0.25, 0.25], scaleX: [0.85, 1.1, 0.85] }
                : undefined
            }
            transition={{ duration: 4.6, repeat: Infinity, ease: EASE_IN_OUT }}
            aria-hidden
          />
          {/* Particules d'ambiance : braises / poussière / éclats */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {particles.map((p) => (
              <motion.span
                key={p.id}
                className="absolute rounded-full"
                style={{
                  left: `${p.left}%`,
                  bottom: warm ? "8%" : "auto",
                  top: warm ? "auto" : "12%",
                  width: p.size,
                  height: p.size,
                  background: partColor,
                  filter: `blur(0.4px) drop-shadow(0 0 ${p.size * 2}px ${partColor})`,
                }}
                initial={{ opacity: 0 }}
                animate={
                  animated
                    ? {
                        opacity: [0, 0.85, 0],
                        y: warm ? [0, -size * 0.6] : [0, size * 0.5],
                        x: [0, p.drift],
                      }
                    : { opacity: 0.4 }
                }
                transition={
                  animated
                    ? { duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeOut" }
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}

      {/* ── Relique : basculement 3D + flottement (poids qui « vit ») ────────── */}
      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size, transformStyle: "preserve-3d" }}
        animate={
          animated
            ? { rotateY: [-4, 4, -4], rotateX: [2.5, -2.5, 2.5], y: [0, floatY, 0] }
            : undefined
        }
        transition={
          animated
            ? { duration: 10 - tier.energy * 2, repeat: Infinity, ease: EASE_IN_OUT }
            : undefined
        }
      >
        {/* Halo respirant */}
        <motion.div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{
            background: glow,
            transform: `scale(${(isHero ? 1.05 : 0.9) + tier.energy * 0.2})`,
          }}
          animate={animated ? HALO_BREATH.animate : undefined}
          transition={animated ? HALO_BREATH.transition : undefined}
          aria-hidden
        />

        {/* Rayons divins tournants derrière le disque (Olympien) */}
        {animated && tier.surface === "divine" && (
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: size * 1.55,
              height: size * 1.55,
              background: `conic-gradient(from 0deg, transparent 0deg, ${glow} 9deg, transparent 26deg, transparent 92deg, ${glow} 101deg, transparent 118deg, transparent 200deg, ${glow} 209deg, transparent 226deg)`,
              maskImage: "radial-gradient(circle, black 26%, transparent 66%)",
              WebkitMaskImage: "radial-gradient(circle, black 26%, transparent 66%)",
              opacity: 0.45,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            aria-hidden
          />
        )}

        <svg viewBox="0 0 200 200" width={size} height={size} className="relative overflow-visible">
          <defs>
            {/* Métal de la jante — éclairé en haut-gauche */}
            <radialGradient id={ids.rim} cx="37%" cy="28%" r="82%">
              <stop offset="0%" stopColor={rimStops[1] ?? "#888"} />
              <stop offset="42%" stopColor={rimStops[0] ?? "#666"} />
              <stop offset="78%" stopColor={rimStops[2] ?? "#333"} />
              <stop offset="100%" stopColor="#0a0a0c" />
            </radialGradient>
            {/* Champ intérieur */}
            <radialGradient id={ids.field} cx="40%" cy="30%" r="85%">
              <stop offset="0%" stopColor={faceStops[0] ?? "#444"} />
              <stop offset="55%" stopColor={faceStops[1] ?? "#282828"} />
              <stop offset="100%" stopColor={faceStops[2] ?? "#0c0c0e"} />
            </radialGradient>
            {/* Biseau de la jante : lumière haut → ombre bas */}
            <linearGradient id={ids.bevel} x1="0.2" y1="0" x2="0.8" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="42%" stopColor="#ffffff" stopOpacity="0.08" />
              <stop offset="58%" stopColor="#000000" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id={ids.gloss} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            {/* Key light (hotspot spéculaire) */}
            <radialGradient id={ids.key} cx="32%" cy="21%" r="40%">
              <stop
                offset="0%"
                stopColor="#ffffff"
                stopOpacity={tier.surface === "raw" ? 0.22 : 0.36}
              />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            {/* Vignette : périphérie assombrie (usure, lumière rasante) */}
            <radialGradient id={ids.vignette} cx="50%" cy="44%" r="56%">
              <stop offset="0%" stopColor="#000000" stopOpacity="0" />
              <stop offset="66%" stopColor="#000000" stopOpacity="0" />
              <stop offset="90%" stopColor="#000000" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.78" />
            </radialGradient>
            {/* Cœur */}
            <radialGradient id={ids.coreGlow} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={glow} stopOpacity="0.9" />
              <stop offset="55%" stopColor={primary} stopOpacity="0.4" />
              <stop offset="100%" stopColor={primary} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={ids.coreWell} cx="42%" cy="34%" r="75%">
              <stop offset="0%" stopColor="#14131a" />
              <stop offset="70%" stopColor="#070609" />
              <stop offset="100%" stopColor="#000000" />
            </radialGradient>
            <radialGradient id={ids.coreHot} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="28%" stopColor={text} />
              <stop offset="60%" stopColor={primary} stopOpacity="0.75" />
              <stop offset="100%" stopColor={primary} stopOpacity="0" />
            </radialGradient>

            {/* FORGE — texture de métal réelle : bruit → relief éclairé, recentré sur
                le gris moyen puis mélangé en OVERLAY. Module la surface (grain,
                martelage) SANS écraser la structure (jante, gravures, cœur). */}
            <filter
              id={ids.forge}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency={bf}
                numOctaves="3"
                seed={seed * 7}
                stitchTiles="stitch"
                result="noise"
              />
              <feDiffuseLighting
                in="noise"
                surfaceScale={surfaceScale}
                diffuseConstant="1"
                lightingColor="#ffffff"
                result="light"
              >
                <feDistantLight azimuth={LIGHT_AZ} elevation="48" />
              </feDiffuseLighting>
              <feComponentTransfer in="light" result="tex">
                <feFuncR type="linear" slope={texSlope} intercept={texIntercept} />
                <feFuncG type="linear" slope={texSlope} intercept={texIntercept} />
                <feFuncB type="linear" slope={texSlope} intercept={texIntercept} />
              </feComponentTransfer>
              <feComposite in="tex" in2="SourceAlpha" operator="in" result="texC" />
              <feBlend in="SourceGraphic" in2="texC" mode="overlay" />
            </filter>

            <clipPath id={ids.clip}>
              <circle cx={C} cy={C} r={OUTER} />
            </clipPath>
            <path id={ids.name} d={arcPath} />
          </defs>

          {/* Ombre de contact lourde (le disque pèse) */}
          <ellipse
            cx={C}
            cy={C + OUTER * 0.62}
            rx={OUTER * 0.86}
            ry={OUTER * 0.2}
            fill="#000000"
            opacity="0.55"
            style={{ filter: "blur(6px)" }}
          />
          <circle
            cx={C}
            cy={C + 4}
            r={OUTER}
            fill="#000000"
            opacity="0.5"
            style={{ filter: "blur(3px)" }}
          />

          {/* Diamètre du rang (centré) */}
          <g transform={`translate(${C} ${C}) scale(${tier.scale}) translate(${-C} ${-C})`}>
            {/* ═══ CORPS FORGÉ (texturé + éclairé par le filtre) ═══ */}
            <g filter={`url(#${ids.forge})`}>
              {/* Jante massive */}
              <circle cx={C} cy={C} r={OUTER} fill={`url(#${ids.rim})`} />
              {/* Champ intérieur en creux */}
              <circle cx={C} cy={C} r={fieldR} fill={`url(#${ids.field})`} />

              {/* Facettes radiales forgées (grain très subtil, jamais une roue) */}
              <g clipPath={`url(#${ids.clip})`} opacity={0.4}>
                {facets.map((a, i) => {
                  const a0 = (a * Math.PI) / 180;
                  const a1 = ((a + 360 / tier.spokes) * Math.PI) / 180;
                  const x0 = C + Math.cos(a0) * fieldR;
                  const y0 = C + Math.sin(a0) * fieldR;
                  const x1 = C + Math.cos(a1) * fieldR;
                  const y1 = C + Math.sin(a1) * fieldR;
                  return (
                    <path
                      key={a}
                      d={`M ${C} ${C} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${fieldR} ${fieldR} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`}
                      fill={i % 2 === 0 ? "#ffffff" : "#000000"}
                      opacity={i % 2 === 0 ? 0.03 : 0.06}
                    />
                  );
                })}
              </g>

              {/* Gorge profonde entre jante et champ */}
              <circle
                cx={C}
                cy={C}
                r={channelR}
                fill="none"
                stroke="#000000"
                strokeOpacity={0.75 * tier.groove}
                strokeWidth="4"
              />
              <circle
                cx={C}
                cy={C}
                r={fieldR}
                fill="none"
                stroke="#000000"
                strokeOpacity="0.5"
                strokeWidth="1"
              />
              <circle
                cx={C}
                cy={C}
                r={fieldR - 1}
                fill="none"
                stroke={text}
                strokeOpacity="0.12"
                strokeWidth="0.6"
              />

              {/* Biseau extérieur massif (chanfrein éclairé) */}
              <circle
                cx={C}
                cy={C}
                r={OUTER - 2.5}
                fill="none"
                stroke={`url(#${ids.bevel})`}
                strokeWidth="6"
              />
              <circle
                cx={C}
                cy={C}
                r={OUTER}
                fill="none"
                stroke="#000000"
                strokeOpacity="0.7"
                strokeWidth="1.4"
              />
              {/* Reflet vif du chanfrein (haut-gauche) — vend l'épaisseur du métal */}
              <path
                d={`M ${C + Math.cos(Math.PI * 1.15) * (OUTER - 2)} ${C + Math.sin(Math.PI * 1.15) * (OUTER - 2)} A ${OUTER - 2} ${OUTER - 2} 0 0 1 ${C + Math.cos(Math.PI * 1.72) * (OUTER - 2)} ${C + Math.sin(Math.PI * 1.72) * (OUTER - 2)}`}
                fill="none"
                stroke="#ffffff"
                strokeOpacity="0.55"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              {/* Marche intérieure sombre (la jante domine le champ, profondeur) */}
              <circle
                cx={C}
                cy={C}
                r={rimInner + 1}
                fill="none"
                stroke="#000000"
                strokeOpacity="0.5"
                strokeWidth="2.5"
              />

              {/* Rivets / encoches sculptés sur l'anneau intérieur de la jante */}
              {rivets.map((a) => {
                const rad = rimInner + 3.5;
                const x = C + Math.cos((a * Math.PI) / 180) * rad;
                const y = C + Math.sin((a * Math.PI) / 180) * rad;
                return (
                  <g key={a}>
                    <circle cx={x} cy={y + 0.5} r="1.8" fill="#000000" opacity="0.6" />
                    <circle cx={x} cy={y} r="1.6" fill={`url(#${ids.rim})`} />
                    <circle
                      cx={x - 0.4}
                      cy={y - 0.5}
                      r="0.6"
                      fill="#ffffff"
                      opacity={0.5 + tier.energy * 0.3}
                    />
                  </g>
                );
              })}

              {/* NOM DU RANG — gravure profondément sculptée dans la jante (jamais un chiffre) */}
              {(() => {
                const f = {
                  fontFamily: "ui-serif, Georgia, 'Times New Roman', serif" as const,
                  fontWeight: 800,
                  fontSize: 14.5,
                  letterSpacing: nameSpacing,
                };
                const tp = (dx = 0, dy = 0) => (
                  <textPath
                    href={`#${ids.name}`}
                    startOffset="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={dx || dy ? `translate(${dx},${dy})` : undefined}
                  >
                    {label}
                  </textPath>
                );
                return (
                  <g>
                    {/* sillon assombri où l'inscription est entaillée */}
                    <path
                      d={arcPath}
                      fill="none"
                      stroke="#000000"
                      strokeOpacity="0.46"
                      strokeWidth="18"
                      strokeLinecap="round"
                    />
                    {/* parois hautes du sillon (double ombre = profondeur) */}
                    <text {...f} fill="#000000" opacity="0.95">
                      {tp(0, -1.4)}
                    </text>
                    <text {...f} fill="#000000" opacity="0.7">
                      {tp(0.5, -0.5)}
                    </text>
                    {/* lueur interne pour les hauts rangs (gravure chargée d'énergie) */}
                    {tier.energy > 0.35 && (
                      <text
                        {...f}
                        fill={glow}
                        opacity={0.45 + tier.energy * 0.4}
                        style={{ filter: `drop-shadow(0 0 2.5px ${glow})` }}
                      >
                        {tp()}
                      </text>
                    )}
                    {/* arête basse captant la lumière (lèvre du sillon) */}
                    <text {...f} fill="#ffffff" opacity="0.5">
                      {tp(0, 1.3)}
                    </text>
                    {/* corps sombre entaillé */}
                    <text {...f} fill="#08070a" opacity="0.88">
                      {tp()}
                    </text>
                  </g>
                );
              })()}
            </g>

            {/* ═══ USURE (par-dessus le métal) ═══ */}
            <g clipPath={`url(#${ids.clip})`}>
              {scratches.map((s, i) => (
                <path
                  key={i}
                  d={s.d}
                  fill="none"
                  stroke={s.stroke}
                  strokeOpacity={s.opacity}
                  strokeWidth={s.w}
                  strokeLinecap="round"
                />
              ))}
            </g>
            {/* Éclats sur le bord (relique ancienne, ébréchée) */}
            {nicks.map((nk, i) => {
              const a = (nk.a * Math.PI) / 180;
              const pa = a + 0.05;
              const pb = a - 0.05;
              return (
                <path
                  key={i}
                  d={`M ${(C + Math.cos(pa) * OUTER).toFixed(1)} ${(C + Math.sin(pa) * OUTER).toFixed(1)} L ${(C + Math.cos(a) * (OUTER - nk.depth)).toFixed(1)} ${(C + Math.sin(a) * (OUTER - nk.depth)).toFixed(1)} L ${(C + Math.cos(pb) * OUTER).toFixed(1)} ${(C + Math.sin(pb) * OUTER).toFixed(1)} Z`}
                  fill="#000000"
                  opacity="0.55"
                />
              );
            })}

            {/* Fissures de lave (Titan) */}
            {tier.surface === "molten" && (
              <g clipPath={`url(#${ids.clip})`}>
                {facets.slice(0, 5).map((a, i) => {
                  const a0 = (a * Math.PI) / 180;
                  const x0 = C + Math.cos(a0) * (coreR + 4);
                  const y0 = C + Math.sin(a0) * (coreR + 4);
                  const x1 = C + Math.cos(a0) * (fieldR - 2);
                  const y1 = C + Math.sin(a0) * (fieldR - 2);
                  const mx = (x0 + x1) / 2 + (det(i, seed + 3) - 0.5) * 16;
                  const my = (y0 + y1) / 2 + (det(i, seed + 9) - 0.5) * 16;
                  return (
                    <motion.path
                      key={i}
                      d={`M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`}
                      fill="none"
                      stroke={glow}
                      strokeWidth={1.1 + det(i, seed) * 0.9}
                      strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 3px ${primary})` }}
                      animate={animated ? { opacity: [0.35, 0.9, 0.35] } : { opacity: 0.6 }}
                      transition={
                        animated
                          ? {
                              duration: 2.2 + det(i, seed) * 2,
                              repeat: Infinity,
                              ease: EASE_IN_OUT,
                              delay: det(i, seed + 1) * 2,
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </g>
            )}
            {/* Constellations (Primordial) */}
            {tier.surface === "cosmic" && (
              <g clipPath={`url(#${ids.clip})`}>
                {Array.from({ length: 12 }, (_, i) => {
                  const a = det(i, seed + 2) * Math.PI * 2;
                  const r = coreR + 5 + det(i, seed + 4) * (fieldR - coreR - 8);
                  const x = C + Math.cos(a) * r;
                  const y = C + Math.sin(a) * r;
                  return (
                    <motion.circle
                      key={i}
                      cx={x}
                      cy={y}
                      r={0.6 + det(i, seed + 6) * 1.4}
                      fill="#ffffff"
                      style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
                      animate={animated ? { opacity: [0.15, 0.9, 0.15] } : { opacity: 0.5 }}
                      transition={
                        animated
                          ? {
                              duration: 2.5 + det(i, seed + 8) * 3,
                              repeat: Infinity,
                              ease: EASE_IN_OUT,
                              delay: det(i, seed + 10) * 3,
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </g>
            )}

            {/* ═══ LUMIÈRE CINÉMATOGRAPHIQUE ═══ */}
            <circle
              cx={C}
              cy={C}
              r={OUTER}
              fill={`url(#${ids.vignette})`}
              clipPath={`url(#${ids.clip})`}
            />
            <circle
              cx={C}
              cy={C}
              r={OUTER}
              fill={`url(#${ids.key})`}
              clipPath={`url(#${ids.clip})`}
            />
            {/* Rim light bas-droite */}
            <path
              d={`M ${C + Math.cos(Math.PI * 0.12) * OUTER} ${C + Math.sin(Math.PI * 0.12) * OUTER} A ${OUTER} ${OUTER} 0 0 1 ${C + Math.cos(Math.PI * 0.62) * OUTER} ${C + Math.sin(Math.PI * 0.62) * OUTER}`}
              fill="none"
              stroke={secondary}
              strokeOpacity="0.5"
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{ filter: `blur(1px) drop-shadow(0 0 3px ${glow})` }}
            />

            {/* ═══ CŒUR ═══ */}
            <DiscCore glow={glow} text={text} tier={tier} ids={ids} animated={animated} />

            {/* Reflet spéculaire qui balaie */}
            {animated && (
              <g clipPath={`url(#${ids.clip})`}>
                <motion.rect
                  x="-120"
                  y="0"
                  width="44"
                  height="200"
                  fill={`url(#${ids.gloss})`}
                  transform="skewX(-18)"
                  animate={{ x: [-120, 300] }}
                  transition={{
                    duration: 6.5,
                    repeat: Infinity,
                    repeatDelay: 3.5,
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
