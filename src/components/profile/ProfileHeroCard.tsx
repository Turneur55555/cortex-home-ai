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
 * n'est superposé. L'identité de l'utilisateur (avatar + pseudo) est rendue
 * par ProfileIdentityStrip, au-dessus.
 *
 * Aucune logique métier ici : le Titre vient du moteur de progression
 * principale (`titleProgress`, piloté PAR L'XP GLOBALE UNIQUEMENT — jamais
 * par le Rang par exercice, qui reste un système indépendant avec ses propres
 * paliers). La correspondance rang → illustration vit dans `assets/ranks`.
 */
export function ProfileHeroCard() {
  const { data: userStats } = useUserStats();
  const progress = titleProgressForXp(userStats?.xp ?? 0);

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
      className="relative mb-6 overflow-hidden rounded-[28px] shadow-elevated"
      style={{ aspectRatio: "4 / 4" }}
    >
      <RankIllustration
        rankKey={rank.rank.key}
        label={rank.rank.label}
        className="absolute inset-0 h-full w-full"
      />
    </motion.header>
  );
}
