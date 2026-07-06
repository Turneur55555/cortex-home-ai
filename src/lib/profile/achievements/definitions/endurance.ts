import { buildMilestoneSeries } from "../tierBuilder";
import type { AchievementDef } from "../types";

const workoutCountAchievements = buildMilestoneSeries({
  idPrefix: "endurance_workouts",
  category: "endurance",
  icon: "Flame",
  select: (ctx) => ctx.workoutsCountTotal,
  descriptionTemplate: (t) => `Enregistre ${t} séances au total.`,
  currentLabel: (v) => `${v} séances`,
  tiers: [
    { threshold: 5, rarity: "common", title: "Ça commence" },
    { threshold: 10, rarity: "common", title: "Sur les rails" },
    { threshold: 25, rarity: "common", title: "Habitude prise" },
    { threshold: 50, rarity: "rare", title: "Régulier" },
    { threshold: 100, rarity: "rare", title: "Centurion" },
    { threshold: 200, rarity: "epic", title: "Vétéran de la salle" },
    { threshold: 350, rarity: "epic", title: "Increvable" },
    { threshold: 500, rarity: "legendary", title: "Légende de la salle" },
    { threshold: 1_000, rarity: "mythic", title: "Immortel du fer" },
  ],
});

const streakAchievements = buildMilestoneSeries({
  idPrefix: "endurance_streak",
  category: "endurance",
  icon: "Flame",
  select: (ctx) => ctx.streakDays,
  descriptionTemplate: (t) => `Atteins une série de ${t} jours d'activité consécutifs.`,
  currentLabel: (v) => `${v} j`,
  tiers: [
    { threshold: 3, rarity: "common", title: "Étincelle" },
    { threshold: 7, rarity: "common", title: "Une semaine de feu" },
    { threshold: 14, rarity: "rare", title: "Deux semaines sans faille" },
    { threshold: 21, rarity: "rare", title: "Habitude ancrée" },
    { threshold: 30, rarity: "epic", title: "Un mois sans interruption" },
    { threshold: 60, rarity: "epic", title: "Deux mois de discipline" },
    { threshold: 100, rarity: "legendary", title: "Flamme centenaire" },
    { threshold: 180, rarity: "legendary", title: "Six mois de constance" },
    { threshold: 365, rarity: "mythic", title: "Une année entière" },
  ],
});

const monthsActiveAchievements = buildMilestoneSeries({
  idPrefix: "endurance_months_active",
  category: "endurance",
  icon: "Flame",
  select: (ctx) => ctx.distinctMonthsActive,
  descriptionTemplate: (t) => `Sois actif sur ${t} mois calendaires distincts.`,
  currentLabel: (v) => `${v} mois`,
  tiers: [
    { threshold: 1, rarity: "common", title: "Premier mois" },
    { threshold: 3, rarity: "rare", title: "Trimestre complet" },
    { threshold: 6, rarity: "epic", title: "Semestre d'assiduité" },
    { threshold: 12, rarity: "legendary", title: "Une année de présence" },
  ],
});

export const enduranceAchievements: AchievementDef[] = [
  ...workoutCountAchievements,
  ...streakAchievements,
  ...monthsActiveAchievements,
];
