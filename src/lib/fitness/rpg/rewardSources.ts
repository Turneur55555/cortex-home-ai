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
