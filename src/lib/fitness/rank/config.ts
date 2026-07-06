// ============================================================
// Configuration par défaut du moteur de Rang / Maîtrise.
// Toutes les pondérations et tous les barèmes sont ici, jamais
// dans engine.ts — on ajuste ce fichier, pas l'algorithme.
// ============================================================

import type { RankEngineConfig } from "./types";

export const DEFAULT_RANK_ENGINE_CONFIG: RankEngineConfig = {
  // Poids relatifs des 3 composantes du score de niveau (rang).
  // relativeStrength pilote l'essentiel ; volume et repQuality n'agissent
  // que comme des modificateurs bornés (cf. computeRankScorePosition).
  rankScoreWeights: {
    relativeStrength: 0.7,
    volume: 0.15,
    repQuality: 0.15,
  },

  // Poids des composantes de la Maîtrise (barre de progression).
  masteryWeights: {
    overload: 0.25,
    reps: 0.15,
    tonnageTrend: 0.15,
    frequency: 0.15,
    consistency: 0.1,
    recentPR: 0.1,
    experience: 0.1,
  },

  // Confirmation des rangs sommet : en dessous du tier 20 (Olympien), une
  // seule séance suffit à être crédité pleinement. Olympien et Primordial
  // exigent chacun une constance démontrée — Primordial nettement plus.
  confirmation: {
    gates: [
      {
        // Primordial (tiers 25-29) : la référence absolue sur l'exercice.
        fromTierIndex: 25,
        sessionsRequired: 5,
        minSpanDays: 60,
        minExperienceSessions: 15,
        lookbackSessions: 20,
      },
      {
        // Olympien (tiers 20-24) : excellent niveau confirmé dans la durée.
        fromTierIndex: 20,
        sessionsRequired: 3,
        minSpanDays: 30,
        minExperienceSessions: 10,
        lookbackSessions: 15,
      },
    ],
  },

  // Décroissance en cas d'arrêt : jamais plus d'un palier de rang par
  // événement de décroissance, quelle que soit la durée d'inactivité.
  inactivity: {
    masteryDecayStartDays: 30,
    rankDecayStartDays: 75,
    maxRankDropPerEvent: 1,
  },

  // Nombre de séances récentes prises en compte pour le plafond potentiel.
  consolidationWindowSessions: 8,

  // Fréquence hebdomadaire "attendue" par famille, pour la composante
  // fréquence de la Maîtrise.
  expectedWeeklyFrequency: {
    squat_presse_jambes: 1,
    deadlift_tirage_hanche: 1,
    developpe_couche: 1.5,
    developpe_militaire: 1,
    tirage_traction_dos: 1.5,
    isolation: 2,
    poids_de_corps: 1.5,
  },

  experienceCapSessions: 20,

  // Barèmes par famille — voir le message de proposition pour la
  // justification de chaque seuil. À ajuster librement ici.
  familyStandards: {
    squat_presse_jambes: { unit: "ratio", boundaries: [0.5, 0.9, 1.3, 1.7, 2.1] },
    deadlift_tirage_hanche: { unit: "ratio", boundaries: [0.6, 1.0, 1.4, 1.8, 2.3] },
    developpe_couche: { unit: "ratio", boundaries: [0.35, 0.6, 0.85, 1.1, 1.4] },
    developpe_militaire: { unit: "ratio", boundaries: [0.25, 0.4, 0.6, 0.8, 1.0] },
    tirage_traction_dos: { unit: "ratio", boundaries: [0.4, 0.6, 0.85, 1.1, 1.4] },
    isolation: { unit: "ratio", boundaries: [0.15, 0.3, 0.45, 0.6, 0.8] },
    poids_de_corps: { unit: "reps", boundaries: [3, 7, 12, 18, 25] },
  },
};
