import { buildMilestoneSeries } from "../tierBuilder";
import type { AchievementDef } from "../types";
import { CATALOG_GROUPS } from "@/lib/fitness/exerciseCatalog";

const setsAchievements = buildMilestoneSeries({
  idPrefix: "hyper_sets",
  category: "hypertrophy",
  icon: "Activity",
  select: (ctx) => ctx.totalSetsSample,
  descriptionTemplate: (t) => `Cumule ${t} séries d'entraînement (séances enregistrées).`,
  currentLabel: (v) => `${v} séries`,
  tiers: [
    { threshold: 50, rarity: "common", title: "Premières séries" },
    { threshold: 150, rarity: "common", title: "Rythme trouvé" },
    { threshold: 400, rarity: "rare", title: "Travailleur assidu" },
    { threshold: 800, rarity: "epic", title: "Bâtisseur de muscle" },
    { threshold: 1_500, rarity: "legendary", title: "Forge corporelle" },
    { threshold: 3_000, rarity: "mythic", title: "Sculpteur infatigable" },
  ],
});

const repsAchievements = buildMilestoneSeries({
  idPrefix: "hyper_reps",
  category: "hypertrophy",
  icon: "Activity",
  select: (ctx) => ctx.totalRepsSample,
  descriptionTemplate: (t) =>
    `Cumule ${t.toLocaleString("fr-FR")} répétitions (séances enregistrées).`,
  currentLabel: (v) => `${v.toLocaleString("fr-FR")} reps`,
  tiers: [
    { threshold: 500, rarity: "common", title: "Compteur lancé" },
    { threshold: 2_000, rarity: "common", title: "Milliers de reps" },
    { threshold: 5_000, rarity: "rare", title: "Cadence solide" },
    { threshold: 10_000, rarity: "epic", title: "Endurance musculaire" },
    { threshold: 25_000, rarity: "legendary", title: "Machine à répétitions" },
    { threshold: 50_000, rarity: "mythic", title: "Sans fin" },
  ],
});

// Deux paliers par groupe musculaire du catalogue (hors Cardio, hors
// Polyarticulaire déjà couvert par Force) — volume cumulé sur ce groupe.
const SPECIALIZATION_GROUPS = CATALOG_GROUPS.filter(
  (g) => g !== "Cardio" && g !== "Polyarticulaire",
);

const muscleGroupAchievements: AchievementDef[] = SPECIALIZATION_GROUPS.flatMap((group) => {
  const tiers: Array<{ threshold: number; rarity: AchievementDef["rarity"] }> = [
    { threshold: 5_000, rarity: "common" },
    { threshold: 20_000, rarity: "rare" },
  ];
  return tiers.map((tier, i) => ({
    id: `hyper_group_${group}_${i + 1}`,
    category: "hypertrophy" as const,
    rarity: tier.rarity,
    title: i === 0 ? `${group} en chantier` : `Spécialiste ${group}`,
    description: `Cumule ${tier.threshold.toLocaleString("fr-FR")} kg de volume sur les exercices ${group.toLowerCase()}.`,
    icon: "Dumbbell",
    xpReward: tier.rarity === "common" ? 40 : 90,
    evaluate: (ctx) => {
      const value = ctx.muscleGroupVolume.get(group) ?? 0;
      return {
        unlocked: value >= tier.threshold,
        progress: Math.max(0, Math.min(100, Math.round((value / tier.threshold) * 100))),
        currentLabel: `${Math.round(value).toLocaleString("fr-FR")} kg`,
      };
    },
  }));
});

const specializationMeta: AchievementDef = {
  id: "hyper_specialization_meta",
  category: "hypertrophy",
  rarity: "epic",
  title: "Spécialisation assumée",
  description: "Un groupe musculaire représente plus de 30 % de ton volume total.",
  icon: "Sparkles",
  xpReward: 120,
  evaluate: (ctx) => {
    if (ctx.totalVolumeSample <= 0 || !ctx.dominantMuscleGroup) {
      return { unlocked: false, progress: 0 };
    }
    const dominant = ctx.muscleGroupVolume.get(ctx.dominantMuscleGroup) ?? 0;
    const pct = (dominant / ctx.totalVolumeSample) * 100;
    return {
      unlocked: pct >= 30,
      progress: Math.max(0, Math.min(100, Math.round((pct / 30) * 100))),
      currentLabel: `${Math.round(pct)} % sur ${ctx.dominantMuscleGroup}`,
    };
  },
};

export const hypertrophyAchievements: AchievementDef[] = [
  ...setsAchievements,
  ...repsAchievements,
  ...muscleGroupAchievements,
  specializationMeta,
];
