import { motion } from "framer-motion";

/**
 * Apparition progressive uniforme pour les sections de la page Séances —
 * fondu + légère élévation au défilement. Purement décoratif (CSS
 * transform/opacity, GPU), `once: true` pour ne jamais rejouer ni
 * pénaliser le scroll. Utilisé pour donner l'impression d'un même lieu que
 * l'on explore plutôt que des cartes indépendantes qui popent en bloc.
 */
export function SectionReveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
