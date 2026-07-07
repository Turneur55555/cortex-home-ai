import { motion } from "framer-motion";
import { Swords, ChevronRight } from "lucide-react";

/**
 * Action principale du module Séances — remplace visuellement l'ancien
 * bouton "Nouvelle séance". Reprend les matériaux "Reliquary" (atmosphère
 * Titan par défaut, filet métallique, halo rouge), pour signifier "entre
 * dans l'arène". Ne change AUCUNE logique : c'est le même déclencheur que
 * l'ancien FAB / StartWorkoutSheet.
 */
export function ChoisirEpreuveCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 }}
      whileTap={{ scale: 0.985 }}
      aria-label="Choisir une épreuve"
      className="group relative block w-full overflow-hidden rounded-[26px] border border-white/[0.10] p-5 text-left shadow-elevated transition-colors hover:border-white/[0.20]"
      style={{
        background: `
          radial-gradient(120% 80% at 50% 0%, rgba(239,68,68,0.22) 0%, transparent 55%),
          radial-gradient(80% 70% at 100% 100%, rgba(185,28,28,0.28) 0%, transparent 60%),
          linear-gradient(180deg,#1a0606 0%,#080202 100%)`,
        boxShadow:
          "inset 0 0 0 1px rgba(239,68,68,0.35), 0 14px 48px -22px rgba(239,68,68,0.45)",
      }}
    >
      {/* Filet métallique haut */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(239,68,68,0.75), transparent)",
        }}
      />

      {/* Pulse discret au hover */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 100%, rgba(239,68,68,0.20), transparent 70%)",
        }}
        animate={{ opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative flex items-center gap-4">
        <div
          aria-hidden
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
          style={{
            background:
              "linear-gradient(140deg,#7f1d1d 0%,#ef4444 45%,#450a0a 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 24px -8px rgba(239,68,68,0.7)",
          }}
        >
          <Swords className="h-6 w-6 text-white drop-shadow" />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: "#fca5a5" }}
          >
            Entrer dans l'arène
          </p>
          <p
            className="mt-1 font-serif text-[22px] font-semibold italic leading-tight tracking-wide text-white"
            style={{ textShadow: "0 0 16px rgba(239,68,68,0.35)" }}
          >
            Choisir une épreuve
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/60">
            Démarre ta prochaine séance — forge ta prochaine légende.
          </p>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
      </div>
    </motion.button>
  );
}
