import { motion } from "framer-motion";

import { RankIllustration } from "@/components/rpg/RankIllustration";
import { toRankState } from "@/hooks/useExerciseProgression";
import { useCortexPower } from "@/hooks/useCortexPower";
import { EASE_OUT } from "@/components/rpg/premium/tokens";

/**
 * Fiche de Personnage — pièce maîtresse de CORTEX (Accueil).
 *
 * L'illustration officielle du TITRE courant (« GUERRIER », « TITAN »…)
 * occupe toute la carte ; elle porte déjà le nom du rang, donc aucun texte
 * n'est superposé.
 *
 * Ratio du conteneur : 4:5 exact, conformément à la règle absolue de
 * `assets/ranks/FORMAT.md` (tout conteneur accueillant `RankIllustration`
 * respecte ce ratio, sinon `object-fit: cover` recadre l'image de façon
 * imprévisible et peut couper le disque/le lettrage du rang). On pilote donc
 * l'emprise verticale sur Accueil via la hauteur (`height` + `self-center`)
 * plutôt que via le ratio lui-même : la largeur suit proportionnellement,
 * l'illustration (disque + nom du rang) reste toujours entière, jamais rognée.
 *
 * Aucune logique métier ici : le Titre vient de `useCortexPower`
 * (Performance → Rang exercice → Rang musculaire → Puissance Cortex →
 * Titre — JAMAIS de l'XP, voir `lib/fitness/rpg/cortexTitle.ts`). La
 * correspondance rang → illustration vit dans `assets/ranks`.
 */
export function ProfileHeroCard() {
  const { isLoading, title } = useCortexPower();

  // Ne rien inventer tant que le calcul n'est pas terminé, ou si le joueur
  // n'a pas encore assez de données pour être classé/partiellement classé —
  // un squelette plutôt qu'un Titre par défaut ("Mortel") trompeur.
  if (isLoading || title.status !== "ranked") {
    return (
      <div
        className="relative mb-5 aspect-[4/5] w-full animate-pulse self-center overflow-hidden rounded-[28px] bg-white/5 shadow-elevated"
        style={{ height: "clamp(300px, 48vh, 480px)" }}
      />
    );
  }

  // Position dans le grade courant : la Puissance Cortex est un palier
  // discret (0-29), pas une valeur continue comme l'XP — on affiche donc le
  // grade atteint sans barre de progression fractionnaire au sein du palier.
  const rank = toRankState(title.tierIndex, 0);

  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className="relative mb-5 self-center overflow-hidden rounded-[28px] shadow-elevated"
      style={{ aspectRatio: "4 / 5", height: "clamp(300px, 48vh, 480px)" }}
    >
      <RankIllustration
        rankKey={rank.rank.key}
        label={rank.rank.label}
        className="absolute inset-0 h-full w-full"
      />
    </motion.header>
  );
}
