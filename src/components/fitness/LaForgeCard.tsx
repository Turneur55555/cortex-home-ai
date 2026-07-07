import { motion } from "framer-motion";
import { Hammer, ChevronRight } from "lucide-react";

/**
 * La Forge — remplace l'ancien bouton "Catalogue d'exercices". Même niveau
 * de matériau que SenseiIACard/ChoisirEpreuveCard (verre teinté, filet
 * lumineux, halo au toucher) : ce n'est plus un simple catalogue mais
 * l'atelier où l'utilisateur vient choisir ses techniques.
 */
export function LaForgeCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08 }}
      whileTap={{ scale: 0.985 }}
      aria-label="Ouvrir la Forge"
      className="group relative block w-full overflow-hidden rounded-[24px] border border-white/[0.08] p-5 text-left shadow-card transition-colors hover:border-white/[0.16]"
      style={{
        background: `
          radial-gradient(120% 80% at 15% 0%, rgba(251,146,60,0.16) 0%, transparent 55%),
          radial-gradient(80% 70% at 100% 100%, rgba(120,53,15,0.22) 0%, transparent 60%),
          linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)`,
        boxShadow: "inset 0 0 0 1px rgba(251,146,60,0.14)",
      }}
    >
      {/* Filet ambré discret en haut — même langage que Sensei^IA */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(251,146,60,0.55), transparent)",
        }}
      />

      {/* Halo qui respire, s'intensifie au toucher */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-60 transition-opacity duration-500 group-hover:opacity-100 group-active:opacity-100"
        style={{
          background: "radial-gradient(70% 60% at 15% 0%, rgba(251,146,60,0.20), transparent 65%)",
        }}
        animate={{ opacity: [0.25, 0.5, 0.25] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative flex items-center gap-4">
        <div
          aria-hidden
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{
            background: "linear-gradient(140deg,#7c2d12 0%,#f97316 45%,#431407 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 20px -8px rgba(251,146,60,0.6)",
          }}
        >
          <Hammer className="h-5 w-5 text-white drop-shadow" />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="font-serif text-[19px] font-semibold italic leading-tight tracking-wide text-white"
            style={{ textShadow: "0 0 14px rgba(251,146,60,0.3)" }}
          >
            La Forge
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/60">
            Choisis les techniques qui forgeront ta prochaine épreuve.
          </p>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-white/50 transition-transform group-hover:translate-x-0.5" />
      </div>
    </motion.button>
  );
}
