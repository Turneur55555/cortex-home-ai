// ============================================================
// Reward Engine — clés de sources whitelistées côté client.
//
// Miroir de typage TS de `reward_catalog` (Supabase) : ce fichier ne
// contient AUCUN montant d'XP (le montant est une décision 100% serveur,
// lue dans `reward_catalog`). Il sert uniquement à typer les appels à la
// RPC générique `award_reward_event` et à documenter les sources connues.
//
// Ajouter une future source (Chronique, défi, succès, saison, rang
// d'exercice...) = une ligne ici (typage) + une ligne dans le catalogue
// serveur (montant) — jamais une nouvelle RPC ni un nouveau moteur.
// ============================================================

export const REWARD_SOURCES = {
  workoutMuscu: "workout_muscu",
  workoutSupport: "workout_support",
  prMuscu: "pr_muscu",
  streak: "streak",
} as const;

export type RewardSourceKey = (typeof REWARD_SOURCES)[keyof typeof REWARD_SOURCES];

/**
 * Sources versées par des chemins dédiés (server-only ou RPC spécifique,
 * jamais via `award_reward_event` générique) — documentées ici pour mémoire,
 * pas pour typer un appel client :
 *  - `exercise_weight_record` / `exercise_reps_record` / `exercise_volume_record`
 *    / `exercise_1rm_record` : détectés 100% serveur à la clôture de séance
 *    (voir `award_xp_on_workout_complete`), rendement décroissant partagé
 *    ('exercise_progress').
 *  - `exercise_rank_up_<titre>` (mortel/guerrier/heros/titan/olympien/primordial) :
 *    voir `useAwardExerciseRankUp`.
 *  - `badge_<badge_key>` / `goal_<goal_id>` / `achievement_<achievement_id>` :
 *    préfixes dynamiques, versés par `unlock_user_badge` / `award_goal_xp` /
 *    `claim_achievement`.
 */
