// ============================================================
// Titre — dérivé de la Puissance Cortex, JAMAIS de l'XP.
//
// C'est l'unique source de vérité pour le Titre affiché dans toute l'app
// (Accueil, Profil, thème global). Remplace `titleProgressForXp` (moteur
// XP, `src/lib/fitness/rpg/titleProgress.ts`) pour tous les écrans qui
// affichent l'IDENTITÉ courante du joueur.
//
// Chaîne : Performance → Rang exercice (`rank/engine.ts`, inchangé) →
// Rang musculaire (`muscleRank.ts`) → Puissance Cortex (`cortexPower.ts`)
// → Titre (ici). Réutilise la même échelle 0-29 et la même taxonomie des 6
// Titres (`RANK_TIERS`) que le Rang par exercice — un seul langage
// numérique dans toute l'app (voir rapport Phase 2 finale, §5).
// ============================================================

import { RANK_TIERS, LEVELS_PER_RANK, type RankTier } from "@/lib/fitness/exerciseRanks";
import { GRADE_NAMES_BY_TITLE } from "./titleConfig";
import type { CortexPowerResult } from "./cortexPower";

export type CortexTitleProgress =
  | { status: "not_ranked" | "partial" }
  | {
      status: "ranked";
      /** Palier global 0..29. */
      tierIndex: number;
      title: RankTier;
      titleIndex: number;
      grade: string;
      gradeIndex: number;
      isMax: boolean;
    };

const NOT_CLASSIFIED: CortexTitleProgress = { status: "not_ranked" };
const PARTIAL: CortexTitleProgress = { status: "partial" };

/**
 * Dérive le Titre/Grade affichable à partir du résultat de Puissance
 * Cortex. Un nouveau joueur (0 muscle évalué) obtient l'état "non classé",
 * JAMAIS "Mortel" par défaut — un vrai Mortel a mesuré une performance,
 * même faible ; un nouveau joueur n'a rien mesuré du tout (règle déjà
 * validée, rapport Phase 2 finale §7).
 */
export function titleForCortexPower(power: CortexPowerResult): CortexTitleProgress {
  if (power.status === "partial") {
    return power.evaluatedCount === 0 ? NOT_CLASSIFIED : PARTIAL;
  }

  const tierIndex = power.tierIndex;
  const titleIndex = Math.floor(tierIndex / LEVELS_PER_RANK);
  const gradeIndex = tierIndex % LEVELS_PER_RANK;
  const title = RANK_TIERS[titleIndex];
  const grade = GRADE_NAMES_BY_TITLE[title.key][gradeIndex];

  return {
    status: "ranked",
    tierIndex,
    title,
    titleIndex,
    grade,
    gradeIndex,
    isMax: tierIndex >= 29,
  };
}

/** Libellé du prochain Grade, `null` si suprême ou si pas encore classé. */
export function nextCortexGradeLabel(progress: CortexTitleProgress): string | null {
  if (progress.status !== "ranked" || progress.isMax) return null;
  const nextTierIndex = progress.tierIndex + 1;
  const nextTitleIndex = Math.floor(nextTierIndex / LEVELS_PER_RANK);
  const nextGradeIndex = nextTierIndex % LEVELS_PER_RANK;
  const nextTitle = RANK_TIERS[nextTitleIndex];
  return GRADE_NAMES_BY_TITLE[nextTitle.key][nextGradeIndex];
}
