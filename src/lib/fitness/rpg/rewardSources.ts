// ============================================================
// Reward Engine — clés de sources whitelistées côté client.
//
// Miroir de typage TS de `reward_catalog` (Supabase) : ce fichier ne
// contient AUCUN montant d'XP (le montant est une décision 100% serveur,
// lue dans `reward_catalog`). Il sert uniquement à typer les appels à la
// RPC générique `award_reward_event` et à documenter les sources connues.
//
// Philosophie (validée par Nathan, P1.7) : l'XP ne représente QUE la
// progression réelle d'entraînement. Badges/Achievements/Goals sont des
// couches de prestige/collection/suivi personnel — ils ne versent plus
// d'XP. Cinq familles seulement composent l'économie XP.
// ============================================================

export const REWARD_SOURCES = {
  workoutMuscu: "workout_muscu",
  workoutSupport: "workout_support",
  streak: "streak",
} as const;

export type RewardSourceKey = (typeof REWARD_SOURCES)[keyof typeof REWARD_SOURCES];

/**
 * Sources versées par des chemins dédiés (server-only ou Edge Function,
 * jamais via `award_reward_event` générique) — documentées ici pour mémoire :
 *  - `exercise_progress_record` : UNE seule récompense par exercice et par
 *    séance, quel que soit le nombre de métriques battues (poids/reps/
 *    volume/1RM) — détecté 100% serveur à la clôture de séance
 *    (`award_xp_on_workout_complete`), rendement décroissant hebdomadaire
 *    partagé ('exercise_progress').
 *  - `exercise_rank_up_<titre>` (mortel/guerrier/heros/titan/olympien/primordial) :
 *    déclenché automatiquement à la clôture de séance
 *    (`useVerifyExerciseRanksForSession`), jamais par une action manuelle.
 *
 * Badges (`unlock_user_badge`), Achievements (`claim_achievement`) et Goals
 * (`award_goal_xp`) ne versent plus d'XP (prestige/collection/suivi
 * personnel uniquement) — ne plus les référencer comme sources XP.
 */
