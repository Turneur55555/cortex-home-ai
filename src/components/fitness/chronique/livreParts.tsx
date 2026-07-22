// ============================================================
// LOT C3 — Petits composants UI premium du Livre des Chroniques.
//
// Uniquement de la présentation (verre, glow, shimmer, jauges, rangs).
// Les constantes/projections non-composant vivent dans livreData.ts
// (règle react-refresh). Le rang affiché par RankPill réutilise les
// couleurs officielles du système RPG existant (RANK_TIERS).
// ============================================================

import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { rankGlowShadow } from "@/components/rpg/rankTheme";
import { gradeName } from "@/lib/fitness/rpg/grade";

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
