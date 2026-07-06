import { LEVELS_PER_RANK } from "@/lib/fitness/exerciseRanks";
import type { AchievementDef } from "../types";
import type { ExerciseFamily } from "@/lib/fitness/rank/types";

const TITAN_THRESHOLD = 3 * LEVELS_PER_RANK;
const PRIMORDIAL_THRESHOLD = 5 * LEVELS_PER_RANK;

function bestInFamily(
  ctx: Parameters<AchievementDef["evaluate"]>[0],
  family: ExerciseFamily,
): number {
  return ctx.rankProbes
    .filter((p) => p.family === family)
    .reduce((m, p) => Math.max(m, p.rank.tierIndex), 0);
}

export const secretAchievements: AchievementDef[] = [
  {
    id: "secret_primordial",
    category: "secret",
    rarity: "mythic",
    title: "Le Primordial",
    description: "Atteins le rang suprême — Primordial V — sur un exercice.",
    secretHint: "Un seul rang existe au-delà des Olympiens.",
    icon: "Crown",
    xpReward: 1000,
    secret: true,
    evaluate: (ctx) => {
      const best = ctx.rankProbes.reduce((m, p) => Math.max(m, p.rank.tierIndex), 0);
      return {
        unlocked: best >= PRIMORDIAL_THRESHOLD + LEVELS_PER_RANK - 1,
        progress: Math.max(
          0,
          Math.min(100, Math.round((best / (PRIMORDIAL_THRESHOLD + LEVELS_PER_RANK - 1)) * 100)),
        ),
      };
    },
  },
  {
    id: "secret_trio_de_force",
    category: "secret",
    rarity: "legendary",
    title: "Le Trio de Force",
    description:
      "Atteins le rang Titan ou plus au développé couché, au squat et au soulevé de terre à la fois.",
    secretHint: "Trois mouvements fondamentaux, un même niveau d'excellence.",
    icon: "Swords",
    xpReward: 500,
    secret: true,
    evaluate: (ctx) => {
      const bench = bestInFamily(ctx, "developpe_couche");
      const squat = bestInFamily(ctx, "squat_presse_jambes");
      const deadlift = bestInFamily(ctx, "deadlift_tirage_hanche");
      const min = Math.min(bench, squat, deadlift);
      return {
        unlocked: min >= TITAN_THRESHOLD,
        progress: Math.max(0, Math.min(100, Math.round((min / TITAN_THRESHOLD) * 100))),
      };
    },
  },
  {
    id: "secret_corps_et_esprit",
    category: "secret",
    rarity: "epic",
    title: "Corps et Esprit",
    description: "Enregistre au moins 10 bilans corporels et 50 séances.",
    secretHint: "Le corps se travaille aussi hors de la salle.",
    icon: "Activity",
    xpReward: 250,
    secret: true,
    evaluate: (ctx) => {
      const unlocked = ctx.bodyMeasurementsCount >= 10 && ctx.workoutsCountTotal >= 50;
      const pct = Math.min(
        (ctx.bodyMeasurementsCount / 10) * 100,
        (ctx.workoutsCountTotal / 50) * 100,
      );
      return { unlocked, progress: Math.max(0, Math.min(100, Math.round(pct))) };
    },
  },
  {
    id: "secret_regularite_et_puissance",
    category: "secret",
    rarity: "legendary",
    title: "Régularité et Puissance",
    description: "Maintiens une série de 30 jours tout en dépassant 100 000 kg de volume cumulé.",
    secretHint: "La discipline finit toujours par payer.",
    icon: "Sparkles",
    xpReward: 500,
    secret: true,
    evaluate: (ctx) => {
      const unlocked = ctx.streakDays >= 30 && ctx.totalVolumeSample >= 100_000;
      const pct = Math.min((ctx.streakDays / 30) * 100, (ctx.totalVolumeSample / 100_000) * 100);
      return { unlocked, progress: Math.max(0, Math.min(100, Math.round(pct))) };
    },
  },
  {
    id: "secret_touche_a_tout",
    category: "secret",
    rarity: "epic",
    title: "Touche-à-tout",
    description:
      "Pratique au moins 30 exercices différents tout en travaillant toutes les catégories musculaires.",
    secretHint: "La curiosité est une force.",
    icon: "Sparkles",
    xpReward: 300,
    secret: true,
    evaluate: (ctx) => {
      const unlocked =
        ctx.distinctExerciseCount >= 30 && ctx.categoriesTrainedCount >= ctx.totalCategoriesCount;
      const pct = Math.min(
        (ctx.distinctExerciseCount / 30) * 100,
        (ctx.categoriesTrainedCount / Math.max(1, ctx.totalCategoriesCount)) * 100,
      );
      return { unlocked, progress: Math.max(0, Math.min(100, Math.round(pct))) };
    },
  },
  {
    id: "secret_collectionneur_ultime",
    category: "secret",
    rarity: "mythic",
    title: "Collectionneur Ultime",
    description: "Débloque 90 % de tous les succès disponibles.",
    secretHint: "Il ne reste presque plus rien à trouver.",
    icon: "Trophy",
    xpReward: 1000,
    secret: true,
    evaluate: (ctx) => {
      const stats = ctx.collectionStats;
      if (!stats || stats.total === 0) return { unlocked: false, progress: 0 };
      const pct = (stats.unlockedCount / stats.total) * 100;
      return {
        unlocked: pct >= 90,
        progress: Math.max(0, Math.min(100, Math.round((pct / 90) * 100))),
      };
    },
  },
];
