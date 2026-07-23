import { motion } from "framer-motion";

import { RankIllustration } from "@/components/rpg/RankIllustration";
import { toRankState } from "@/hooks/useExerciseProgression";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp } from "@/lib/fitness/rpg/titleProgress";
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
 * Aucune logique métier ici : le Titre vient du moteur de progression
 * principale (`titleProgress`, piloté PAR L'XP GLOBALE UNIQUEMENT — jamais
 * par le Rang par exercice, qui reste un système indépendant avec ses propres
 * paliers). La correspondance rang → illustration vit dans `assets/ranks`.
 */
export function ProfileHeroCard() {
  const { data: userStats } = useUserStats();

  // `useUserStats` sert le dernier rang confirmé (cache local) dès le premier
  // rendu ; `userStats` n'est `undefined` que pour un tout premier lancement
  // sans aucun cache — dans ce seul cas, ne rien inventer, un squelette le
  // temps que la vraie valeur arrive.
  if (!userStats) {
    return (
      <div
        className="relative mb-5 aspect-[4/5] w-full animate-pulse self-center overflow-hidden rounded-[28px] bg-white/5 shadow-elevated"
        style={{ height: "clamp(300px, 48vh, 480px)" }}
      />
    );
  }

  const progress = titleProgressForXp(userStats.xp);

  // Position dans le palier courant (0..100).
  const gradeSpan = Math.max(
    1,
    (progress.xpNextThreshold ?? progress.xpCurrentThreshold) - progress.xpCurrentThreshold,
  );
  const percentInGrade = progress.isMax
    ? 100
    : ((progress.xp - progress.xpCurrentThreshold) / gradeSpan) * 100;

  const rank = toRankState(progress.tierIndex, percentInGrade);

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
