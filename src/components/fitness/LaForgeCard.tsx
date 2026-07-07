import { motion } from "framer-motion";
import { Hammer } from "lucide-react";

/**
 * La Forge — même identité visuelle que Sensei^IA (même matériau : verre
 * teinté, même halo doré, même filet lumineux, même hiérarchie
 * typographique, même niveau de finition). La seule différence entre les
 * deux cartes est le glyphe (marteau plutôt que "IA"), le titre et le
 * contenu — pour que l'utilisateur comprenne immédiatement que les deux
 * appartiennent à la même famille : Sensei le coach, La Forge l'atelier.
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
        background:
          "radial-gradient(120% 80% at 20% 0%, rgba(234,179,8,0.10) 0%, transparent 55%), radial-gradient(80% 70% at 100% 100%, rgba(148,163,184,0.06) 0%, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
      }}
    >
      {/* Filet doré discret en haut — même langage que Sensei^IA */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(234,179,8,0.55), transparent)",
        }}
      />
      {/* Halo doré très discret suivant le hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: "radial-gradient(80% 60% at 20% 0%, rgba(234,179,8,0.14), transparent 60%)",
        }}
      />

      <div className="relative">
        <p className="font-serif text-[26px] font-semibold italic leading-none tracking-wide text-white">
          La Forge
          <sup
            className="ml-1.5 inline-flex align-super"
            style={{
              color: "rgba(234,179,8,0.92)",
              filter: "drop-shadow(0 0 6px rgba(234,179,8,0.35))",
            }}
          >
            <Hammer className="h-3 w-3" strokeWidth={2.5} />
          </sup>
        </p>

        <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-white/70">
          Choisis les techniques qui forgeront ta prochaine épreuve.
        </p>

        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
          Toucher pour forger
        </p>
      </div>
    </motion.button>
  );
}
