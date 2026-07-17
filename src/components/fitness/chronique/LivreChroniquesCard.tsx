import { motion } from "framer-motion";
import { Trophy, ChevronRight } from "lucide-react";

/**
 * LOT C2 — Hero Card « Le Livre des Chroniques », troisième pilier de la
 * page Séances, au même poids visuel que « Entrer dans l'arène »
 * (ChoisirEpreuveCard, rouge) et « La Forge » (or discret). Matériau
 * doré/cuivré, halo animé, particules légères — même gabarit (icône 14,
 * kicker uppercase, titre serif italique, texte, chevron) pour que les
 * trois cartes se lisent comme une même famille.
 */

const SPARKS = [
  { left: 16, size: 2, delay: 0, duration: 15 },
  { left: 38, size: 2.5, delay: 6, duration: 19 },
  { left: 62, size: 2, delay: 3, duration: 17 },
  { left: 87, size: 2.5, delay: 9, duration: 21 },
];

export function LivreChroniquesCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.12 }}
      whileTap={{ scale: 0.985 }}
      aria-label="Ouvrir le Livre des Chroniques"
      className="group relative block w-full overflow-hidden rounded-[26px] border border-white/[0.10] p-5 text-left shadow-elevated transition-colors hover:border-white/[0.20]"
      style={{
        background: `
          radial-gradient(120% 80% at 50% 0%, rgba(234,179,8,0.20) 0%, transparent 55%),
          radial-gradient(80% 70% at 100% 100%, rgba(180,83,9,0.26) 0%, transparent 60%),
          linear-gradient(180deg,#1a1206 0%,#080502 100%)`,
        boxShadow: "inset 0 0 0 1px rgba(234,179,8,0.30), 0 14px 48px -22px rgba(234,179,8,0.40)",
      }}
    >
      {/* Filet doré haut — même langage que les deux autres piliers */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(234,179,8,0.75), transparent)",
        }}
      />

      {/* Halo animé — respiration lente */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px"
        style={{
          background: "radial-gradient(60% 50% at 50% 100%, rgba(234,179,8,0.18), transparent 70%)",
        }}
        animate={{ opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Particules légères — étincelles dorées qui montent */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {SPARKS.map((spark, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-amber-300/60"
            style={{
              left: `${spark.left}%`,
              bottom: -4,
              width: spark.size,
              height: spark.size,
            }}
            animate={{ y: [0, -110], opacity: [0, 0.8, 0] }}
            transition={{
              duration: spark.duration,
              delay: spark.delay,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </div>

      <div className="relative flex items-center gap-4">
        <div
          aria-hidden
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
          style={{
            background: "linear-gradient(140deg,#78350f 0%,#eab308 45%,#451a03 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 24px -8px rgba(234,179,8,0.7)",
          }}
        >
          <Trophy className="h-6 w-6 text-white drop-shadow" />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: "#fcd34d" }}
          >
            Le Livre des Chroniques
          </p>
          <p
            className="mt-1 font-serif text-[22px] font-semibold italic leading-tight tracking-wide text-white"
            style={{ textShadow: "0 0 16px rgba(234,179,8,0.35)" }}
          >
            Chroniques
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/60">
            Revivez chaque bataille. Découvrez vos records. Écrivez la suite de votre légende.
          </p>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
      </div>
    </motion.button>
  );
}
