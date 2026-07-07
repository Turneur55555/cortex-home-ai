import { motion } from "framer-motion";

/**
 * Carte Sensei^IA — remplace l'ancien bouton "Coach IA". Signature en
 * exposant, ton d'un maître qui accompagne. Aucun badge, aucune capsule,
 * aucune icône "IA" : le mot est la signature. Réutilise les matériaux
 * "Reliquary" du Profil (surface verre teintée, ring lumineux, halo doré
 * discret) pour rester dans le même univers visuel.
 */
export function SenseiIACard({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      whileTap={{ scale: 0.985 }}
      aria-label="Ouvrir Sensei IA"
      className="group relative block w-full overflow-hidden rounded-[24px] border border-white/[0.08] p-5 text-left shadow-card transition-colors hover:border-white/[0.16]"
      style={{
        background:
          "radial-gradient(120% 80% at 20% 0%, rgba(234,179,8,0.10) 0%, transparent 55%), radial-gradient(80% 70% at 100% 100%, rgba(148,163,184,0.06) 0%, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
      }}
    >
      {/* Filet doré discret en haut — évoque le calligraphe / la signature */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(234,179,8,0.55), transparent)",
        }}
      />
      {/* Halo doré très discret suivant le hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(80% 60% at 20% 0%, rgba(234,179,8,0.14), transparent 60%)",
        }}
      />

      <div className="relative">
        <p className="font-serif text-[26px] font-semibold italic leading-none tracking-wide text-white">
          Sensei
          <sup
            className="ml-0.5 align-super text-[13px] font-bold not-italic tracking-[0.15em]"
            style={{
              color: "rgba(234,179,8,0.92)",
              textShadow: "0 0 12px rgba(234,179,8,0.35)",
            }}
          >
            IA
          </sup>
        </p>

        <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-white/70">
          Que souhaites-tu accomplir aujourd'hui ?
        </p>

        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
          Toucher pour dialoguer
        </p>
      </div>
    </motion.button>
  );
}
