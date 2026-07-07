// ============================================================
// Catégorie HYROX — réécrite en Phase 8 avec de VRAIES données.
//
// Le 06/06 (avant que HyroxWorkoutEngine existe), ces 4 succès étaient
// intégralement stubbés `comingSoon` faute de toute donnée HYROX dans
// l'app. Depuis la Phase 4 (07/07), le Sensei génère et enregistre de
// vraies séances HYROX (workouts.discipline='hyrox', metadata.objective/
// station — voir hyroxEngine.ts). Cette réécriture n'invente AUCUNE
// donnée : elle exploite exactement ce que le moteur produit déjà.
//
// Ce qui devient réel : le nombre de simulations complètes générées, et
// le nombre de postes DIFFÉRENTS travaillés en mode "spécifique" (sur 9).
//
// Ce qui reste honnêtement `comingSoon` (raison mise à jour — ce n'est
// PLUS "HYROX n'existe pas", c'est "cette donnée précise n'est pas
// capturée aujourd'hui") :
//   - hyrox_first_event : aucune distinction entre une simulation
//     d'entraînement et un événement officiel chronométré n'existe dans
//     le modèle de données (le moteur ne fait que prescrire/décrire).
//   - hyrox_time_progress : aucun temps RÉALISÉ n'est saisi nulle part
//     (le moteur génère un plan, pas un chrono de performance).
//   - hyrox_goal : le système d'objectifs (goals) est générique
//     (workouts_weekly/protein_daily/weight_loss/custom) sans type
//     structuré "objectif HYROX" — matcher sur le texte libre du titre
//     serait fragile, pas une vraie donnée fiable.
// ============================================================

import { buildMilestoneSeries } from "../tierBuilder";
import type { AchievementDef } from "../types";

function comingSoon(
  id: string,
  title: string,
  description: string,
  rarity: AchievementDef["rarity"],
): AchievementDef {
  return {
    id,
    category: "hyrox",
    rarity,
    title,
    description,
    icon: "Shield",
    xpReward: 0,
    comingSoon: true,
    evaluate: () => ({ unlocked: false, progress: 0 }),
  };
}

const simulationAchievements = buildMilestoneSeries({
  idPrefix: "hyrox_simulations",
  category: "hyrox",
  icon: "Shield",
  select: (ctx) => ctx.hyroxSimulationsCount,
  descriptionTemplate: (t) => `Génère et enregistre ${t} simulation(s) HYROX complète(s).`,
  currentLabel: (v) => `${v} simulation(s)`,
  tiers: [
    { threshold: 1, rarity: "common", title: "Première simulation" },
    { threshold: 5, rarity: "rare", title: "Habitué du format complet" },
    { threshold: 15, rarity: "epic", title: "Vétéran HYROX" },
  ],
});

const stationExplorerAchievement: AchievementDef = {
  id: "hyrox_station_explorer",
  category: "hyrox",
  rarity: "rare",
  title: "Tour des postes",
  description: "Travaille spécifiquement au moins 5 postes HYROX différents (sur les 9 possibles).",
  icon: "Shield",
  xpReward: 80,
  evaluate: (ctx) => {
    const threshold = 5;
    const value = ctx.hyroxDistinctStationsCount;
    return {
      unlocked: value >= threshold,
      progress: Math.min(100, Math.round((value / threshold) * 100)),
      currentLabel: `${value}/9 postes`,
    };
  },
};

export const hyroxAchievements: AchievementDef[] = [
  ...simulationAchievements,
  stationExplorerAchievement,
  comingSoon(
    "hyrox_first_event",
    "Premier événement",
    "Participe à ton premier événement HYROX officiel.",
    "rare",
  ),
  comingSoon(
    "hyrox_time_progress",
    "Contre la montre",
    "Améliore ton temps HYROX personnel.",
    "epic",
  ),
  comingSoon(
    "hyrox_goal",
    "Objectif HYROX",
    "Termine un objectif HYROX que tu t'es fixé.",
    "legendary",
  ),
];
