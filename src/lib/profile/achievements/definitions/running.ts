// ============================================================
// Catégorie Course — réécrite en Phase 8 avec de VRAIES données.
//
// Le 06/06, ces succès étaient stubbés `comingSoon` faute de tout module
// de course dans l'app. Depuis la Phase 5 (07/07), CourseWorkoutEngine
// génère et enregistre de vraies séances (workouts.discipline='course',
// metadata.sessionType — voir courseEngine.ts). Cette réécriture
// n'invente AUCUNE donnée.
//
// Nuance IMPORTANTE, assumée : "running_first_5k" (etc.) vérifie qu'AU
// MOINS UNE séance de PRÉPARATION de ce type a été générée par le
// Sensei — PAS qu'une vraie course de 5 km a été couRUE et chronométrée
// (cette donnée n'existe pas : le moteur prescrit une séance, il ne
// capture aucune performance réalisée — voir la limite "Allure moyenne"
// déjà documentée en Phase 5). Le libellé garde l'intitulé d'origine
// (court), la description est reformulée pour rester honnête sur ce qui
// est réellement vérifié.
//
// Reste `comingSoon` (raison mise à jour, pas "Course n'existe pas") :
//   - running_pr : aucune performance réelle (temps/allure réalisée)
//     n'est capturée nulle part aujourd'hui — même limite que ci-dessus.
// ============================================================

import { buildMilestoneSeries } from "../tierBuilder";
import type { AchievementDef, AchievementContext, AchievementRarity } from "../types";

function comingSoon(
  id: string,
  title: string,
  description: string,
  rarity: AchievementRarity,
): AchievementDef {
  return {
    id,
    category: "running",
    rarity,
    title,
    description,
    icon: "Activity",
    xpReward: 0,
    comingSoon: true,
    evaluate: () => ({ unlocked: false, progress: 0 }),
  };
}

function racePrepAchievement(
  id: string,
  title: string,
  distanceLabel: string,
  rarity: AchievementRarity,
  xpReward: number,
  select: (ctx: AchievementContext) => boolean,
): AchievementDef {
  return {
    id,
    category: "running",
    rarity,
    title,
    description: `Génère et enregistre au moins une séance de préparation ${distanceLabel} via le Sensei.`,
    icon: "Activity",
    xpReward,
    evaluate: (ctx) => {
      const unlocked = select(ctx);
      return { unlocked, progress: unlocked ? 100 : 0 };
    },
  };
}

const sessionsAchievements = buildMilestoneSeries({
  idPrefix: "running_sessions",
  category: "running",
  icon: "Activity",
  select: (ctx) => ctx.courseSessionsCount,
  descriptionTemplate: (t) => `Génère et enregistre ${t} séance(s) de course via le Sensei.`,
  currentLabel: (v) => `${v} séance(s)`,
  tiers: [
    { threshold: 1, rarity: "common", title: "Premiers pas de coureur" },
    { threshold: 10, rarity: "rare", title: "Coureur régulier" },
    { threshold: 30, rarity: "epic", title: "Fondu de course à pied" },
  ],
});

export const runningAchievements: AchievementDef[] = [
  ...sessionsAchievements,
  racePrepAchievement(
    "running_first_5k",
    "Premier 5 km",
    "5 km",
    "common",
    30,
    (ctx) => ctx.coursePrep5kDone,
  ),
  racePrepAchievement(
    "running_first_10k",
    "Premier 10 km",
    "10 km",
    "rare",
    60,
    (ctx) => ctx.coursePrep10kDone,
  ),
  racePrepAchievement(
    "running_half_marathon",
    "Semi-marathon",
    "semi-marathon",
    "epic",
    120,
    (ctx) => ctx.coursePrepSemiDone,
  ),
  racePrepAchievement(
    "running_marathon",
    "Marathon",
    "marathon",
    "legendary",
    250,
    (ctx) => ctx.coursePrepMarathonDone,
  ),
  comingSoon(
    "running_pr",
    "Record personnel",
    "Bats ton record personnel sur une distance de course.",
    "rare",
  ),
];
