// ============================================================
// LOT C3 — Petits composants UI premium du Livre des Chroniques.
//
// Uniquement de la présentation (verre, glow, shimmer, jauges, rangs).
// Les constantes/projections non-composant vivent dans livreData.ts
// (règle react-refresh). Le rang affiché par RankPill réutilise les
// couleurs officielles du système RPG existant (RANK_TIERS).
// ============================================================

import { useEffect, useRef } from "react";
import { motion, useInView, animate } from "framer-motion";
import { Lock } from "lucide-react";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { rankGlowShadow } from "@/components/rpg/rankTheme";
import { gradeName } from "@/lib/fitness/rpg/grade";

// ── Titre de section — UNIQUE gabarit pour les 3 modules des Chroniques
//    (Légendes, Forge, Progression) : icône ambrée + titre serif italique +
//    indice optionnel. Toute section d'un module doit passer par ce
//    composant plutôt que recomposer sa propre hiérarchie (règle DA :
//    cohérence visuelle entre modules). ───────────────────────────────────

export function ModuleSectionTitle({
  icon,
  children,
  hint,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3 px-1">
      <div className="flex items-center gap-2">
        <span className="text-amber-400">{icon}</span>
        <h2 className="font-serif text-[15px] font-semibold italic text-white/90">{children}</h2>
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Compteur animé : compte jusqu'à sa valeur à l'entrée dans le viewport
//    (une seule fois, GPU-light) — utilisé par tous les gros chiffres du
//    module Progression (carrière, Hall of Fame). ───────────────────────────

export function AnimatedNumber({
  value,
  format: fmt,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt ? fmt(v) : `${Math.round(v)}`;
      },
    });
    return () => controls.stop();
  }, [inView, value, fmt]);
  return (
    <span ref={ref} className={className}>
      {fmt ? fmt(0) : "0"}
    </span>
  );
}

// ── Sheen : reflet lumineux qui balaie une carte (shimmer premium) ────────────

export function Sheen({ delay = 0 }: { delay?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      <motion.div
        className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)",
        }}
        animate={{ x: ["0%", "460%"] }}
        transition={{ duration: 3.2, delay, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
      />
    </div>
  );
}

// ── PopIn : apparition pop au scroll + léger hover desktop ────────────────────

export function PopIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 10 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Jauge de maîtrise fine, remplissage animé ─────────────────────────────────

export function MasteryGauge({
  percent,
  gradient,
  height = "h-1.5",
}: {
  percent: number;
  gradient: string;
  height?: string;
}) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-white/[0.08] ${height}`}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: gradient }}
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        viewport={{ once: true, margin: "-30px" }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

// ── Pastille de rang, réutilisant les couleurs officielles du rang ────────────

export function RankPill({ rank }: { rank: RankState }) {
  const c = rank.rank.colors;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
      style={{
        background: c.gradient,
        color: c.text,
        boxShadow: rankGlowShadow(c.glow, 0, 16, -6),
      }}
    >
      {rank.rank.label} — {gradeName(rank.rank.key, rank.levelInRank)}
    </span>
  );
}

// ── Carte dorée générique (fond ambré, halo optionnel) — Hall of Fame,
//    Techniques oubliées, Potentiel caché, Galerie des Records. ─────────────

export function GoldCard({
  children,
  className = "",
  glow = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-3xl border border-white/[0.07] shadow-card backdrop-blur-xl " +
        className
      }
      style={{
        background:
          "radial-gradient(120% 90% at 20% 0%, rgba(234,179,8,0.08) 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        ...(glow ? { boxShadow: "0 0 40px -12px rgba(234,179,8,0.35)" } : {}),
      }}
    >
      {children}
    </div>
  );
}

// ── Tuile de badge (débloqué / verrouillé assombri) ───────────────────────────

export function BadgeTile({
  emoji,
  label,
  unlocked,
  index,
}: {
  emoji: string;
  label: string;
  unlocked: boolean;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: unlocked ? 1.04 : 1.0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className={
        "relative flex flex-col items-center gap-1 rounded-2xl border p-3 text-center " +
        (unlocked
          ? "border-amber-400/25 bg-amber-400/[0.06]"
          : "border-white/[0.06] bg-white/[0.02]")
      }
      style={unlocked ? { boxShadow: "0 0 24px -14px rgba(234,179,8,0.6)" } : undefined}
    >
      {unlocked && <Sheen delay={index * 0.3} />}
      <span
        className={"relative text-2xl leading-none " + (unlocked ? "" : "opacity-25 grayscale")}
      >
        {unlocked ? emoji : <Lock className="h-5 w-5 text-white/30" />}
      </span>
      <span
        className={
          "relative text-[10px] font-semibold leading-tight " +
          (unlocked ? "text-white/85" : "text-white/35")
        }
      >
        {label}
      </span>
    </motion.div>
  );
}
