/**
 * E19 — LE RÉSUMÉ DE L'OBJECTIF PHYSIQUE : LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB, zéro couleur). Ce qu'on lit d'un coup
 * d'œil sur la carte Corps du Profil, sans rien ouvrir : l'objectif, depuis quand, et où en est le
 * poids par rapport à son point de départ et à sa cible.
 *
 * ── Des faits, jamais une estimation ──
 * Tout se lit dans l'objectif et dans la dernière pesée : le poids de départ, la cible, le poids
 * actuel, la date de début. AUCUNE projection (« dans la cible », « encore N semaines ») : celles-ci
 * dépendent du TDEE adaptatif et vivent dans l'onglet Objectif de l'écran Corps, calculées une seule
 * fois. Ce résumé ne les recalcule JAMAIS.
 *
 * ── Un objectif sans poids de départ n'a pas de progression ──
 * `progress` vaut `null` quand il manque le départ, la cible ou le poids actuel, quand la cible
 * égale le départ, et pour un objectif de maintien (aucun trajet à parcourir). La carte n'affiche
 * alors pas de barre plutôt qu'une barre inventée.
 */

import { daysBetweenYMD } from "@/lib/fitness/todayCard";

export type GoalKind = "fat_loss" | "maintenance" | "muscle_gain";

export const GOAL_LABELS: Record<GoalKind, string> = {
  fat_loss: "Perte de gras",
  muscle_gain: "Prise de masse",
  maintenance: "Maintien",
};

export interface GoalSummaryInput {
  goal: GoalKind;
  /** Date de début de l'objectif — `started_at` : un horodatage ISO ou une date yyyy-MM-dd. */
  startedAt: string;
  startingWeightKg: number | null;
  targetWeightKg: number | null;
  /** La dernière pesée connue, `null` s'il n'y en a aucune. */
  currentWeightKg: number | null;
  /** Aujourd'hui, date locale yyyy-MM-dd. */
  todayDate: string;
}

export interface GoalSummary {
  label: string;
  /** Semaines COMPLÈTES depuis le début (0 la première semaine). */
  weeksSince: number;
  /** « depuis 7 semaines », « cette semaine » — jamais « 0 semaine ». */
  sinceLabel: string;
  /** Poids actuel − poids de départ, en kg à une décimale (négatif = perdu) ; `null` sans départ ou sans pesée. */
  changeKg: number | null;
  /** Cible − départ, à une décimale ; `null` sans départ ou sans cible, et pour le maintien. */
  targetChangeKg: number | null;
  /** Part du chemin parcourue, 0..1 ; `null` quand elle n'est pas calculable (voir l'en-tête). */
  progress: number | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function localDateOf(startedAt: string): string | null {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return null;
  // Un `started_at` est un horodatage UTC : on le ramène au jour LOCAL, comme toute date métier
  // (lib/dates.ts) — jamais `toISOString().slice(0, 10)`, qui décale d'un jour la nuit.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function describeSince(weeksSince: number): string {
  if (weeksSince <= 0) return "cette semaine";
  return `depuis ${weeksSince} semaine${weeksSince > 1 ? "s" : ""}`;
}

export function summarizeGoal(input: GoalSummaryInput): GoalSummary {
  const startDate = localDateOf(input.startedAt);
  const days = startDate === null ? 0 : Math.max(0, daysBetweenYMD(startDate, input.todayDate));
  const weeksSince = Math.floor(days / 7);

  const { startingWeightKg: start, targetWeightKg: target, currentWeightKg: current } = input;
  const changeKg = start !== null && current !== null ? round1(current - start) : null;
  const targetChangeKg =
    input.goal !== "maintenance" && start !== null && target !== null
      ? round1(target - start)
      : null;

  let progress: number | null = null;
  if (changeKg !== null && targetChangeKg !== null && targetChangeKg !== 0) {
    // Dans le mauvais sens (poids qui monte pour une perte de gras) : 0, jamais une barre négative.
    // Arrondie au millième : `-4,2 / -6` donne 0,7000000000000001 en flottant, et un bruit de cet
    // ordre n'a rien à faire dans une valeur que l'écran compare ou affiche.
    progress = Math.round(Math.min(1, Math.max(0, changeKg / targetChangeKg)) * 1000) / 1000;
  }

  return {
    label: GOAL_LABELS[input.goal],
    weeksSince,
    sinceLabel: describeSince(weeksSince),
    changeKg,
    targetChangeKg,
    progress,
  };
}

/** « −4,2 » / « +1,5 » / « 0 » — virgule décimale, vrai signe moins (U+2212), jamais « -0 ». */
export function formatSignedKg(kg: number): string {
  const value = round1(kg);
  if (value === 0) return "0";
  const text = Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return `${value < 0 ? "−" : "+"}${text}`;
}

/** « 78,4 » — le poids, virgule décimale. */
export function formatWeightKg(kg: number): string {
  return kg.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}
