import type { ExerciseFamily } from "@/lib/fitness/rank/types";
import { RANK_TIERS, LEVELS_PER_RANK, type RankKey } from "@/lib/fitness/exerciseRanks";
import { buildMilestoneSeries } from "../tierBuilder";
import type { AchievementDef, AchievementRarity } from "../types";

const FAMILY_LABELS: Record<ExerciseFamily, string> = {
  squat_presse_jambes: "Squat & Presse à cuisses",
  deadlift_tirage_hanche: "Soulevé de terre",
  developpe_couche: "Développé couché",
  developpe_militaire: "Développé militaire",
  tirage_traction_dos: "Tirage & Rowing",
  poids_de_corps: "Tractions & Dips",
  isolation: "Isolation",
};

// Familles considérées comme "Force" au sens du système de succès —
// l'isolation reste hors périmètre (mouvements d'accessoire, pas de charge de référence).
const STRENGTH_FAMILIES: ExerciseFamily[] = [
  "squat_presse_jambes",
  "deadlift_tirage_hanche",
  "developpe_couche",
  "developpe_militaire",
  "tirage_traction_dos",
  "poids_de_corps",
];

const RANK_RARITY: Record<RankKey, AchievementRarity> = {
  mortel: "common",
  guerrier: "common",
  heros: "rare",
  titan: "epic",
  olympien: "legendary",
  primordial: "mythic",
};

function tierThreshold(rankIndex: number): number {
  return rankIndex * LEVELS_PER_RANK;
}

function bestTierInFamily(family: ExerciseFamily) {
  return (ctx: Parameters<AchievementDef["evaluate"]>[0]) =>
    ctx.rankProbes
      .filter((p) => p.family === family)
      .reduce((max, p) => Math.max(max, p.rank.tierIndex), 0);
}

const familyRankAchievements: AchievementDef[] = STRENGTH_FAMILIES.flatMap((family) =>
  RANK_TIERS.slice(1).map((tier, i) => {
    const rankIndex = i + 1; // 1..5 (0 = mortel, exclu)
    const threshold = tierThreshold(rankIndex);
    const label = FAMILY_LABELS[family];
    return {
      id: `strength_family_${family}_${tier.key}`,
      category: "strength" as const,
      rarity: RANK_RARITY[tier.key as RankKey],
      title: `${tier.label} — ${label}`,
      description: `Atteins le rang ${tier.label} sur un exercice de ${label.toLowerCase()}.`,
      icon: "Dumbbell",
      xpReward: { common: 40, rare: 80, epic: 160, legendary: 300, mythic: 600 }[
        RANK_RARITY[tier.key as RankKey]
      ],
      evaluate: (ctx) => {
        const best = bestTierInFamily(family)(ctx);
        return {
          unlocked: best >= threshold,
          progress: Math.max(0, Math.min(100, Math.round((best / threshold) * 100))),
        };
      },
    } satisfies AchievementDef;
  }),
);

const totalVolumeAchievements = buildMilestoneSeries({
  idPrefix: "strength_total_volume",
  category: "strength",
  icon: "Dumbbell",
  select: (ctx) => ctx.totalVolumeSample,
  descriptionTemplate: (t) =>
    `Cumule ${t.toLocaleString("fr-FR")} kg de volume soulevé (séances enregistrées).`,
  currentLabel: (v) => `${Math.round(v).toLocaleString("fr-FR")} kg`,
  tiers: [
    { threshold: 5_000, rarity: "common", title: "Premières tonnes" },
    { threshold: 20_000, rarity: "common", title: "Charge sérieuse" },
    { threshold: 50_000, rarity: "rare", title: "Force en construction" },
    { threshold: 100_000, rarity: "rare", title: "Cent tonnes" },
    { threshold: 250_000, rarity: "epic", title: "Force brute" },
    { threshold: 500_000, rarity: "legendary", title: "Titan de fonte" },
    { threshold: 1_000_000, rarity: "mythic", title: "Le million" },
  ],
});

export const strengthAchievements: AchievementDef[] = [
  ...familyRankAchievements,
  ...totalVolumeAchievements,
];
