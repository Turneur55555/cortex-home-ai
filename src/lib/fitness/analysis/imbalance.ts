// ============================================================
// Détection de déséquilibres (domaine pur).
// Déduite UNIQUEMENT des données existantes : la carte de récupération
// (déjà calculée par le domaine à partir de tout l'historique) fournit,
// pour chaque muscle, la dernière sollicitation. On en dérive les muscles
// négligés, les déséquilibres poussée/tirage et haut/bas du corps, la
// progression insuffisante et la récupération incomplète.
// ============================================================

import { MUSCLE_META, type MuscleId } from "../muscleMapping";
import type { RecoveryStatus } from "../recovery";
import type { Imbalance, ProgressState } from "./types";

export interface MuscleState {
  id: MuscleId;
  status: RecoveryStatus;
  hoursSinceLast: number | null;
}

export interface ImbalanceInput {
  /** État de tous les muscles (issu de la recovery map). */
  muscles: ReadonlyArray<MuscleState>;
  /** Muscles principaux de l'exercice analysé. */
  primary: ReadonlyArray<MuscleId>;
  /** État global de progression de cet exercice. */
  progressState: ProgressState;
}

const PUSH: MuscleId[] = ["pectoraux", "epaules", "triceps"];
const PULL: MuscleId[] = ["dos", "biceps", "trapeze", "avant-bras"];
const LOWER: MuscleId[] = ["quadriceps", "ischio", "fessiers", "mollets"];
const UPPER: MuscleId[] = [...PUSH, ...PULL];

const NEGLECT_HOURS = 24 * 7; // 7 jours sans stimulus = négligé.

function neglectScore(m: MuscleState): number {
  if (m.status === "unknown") return 1; // jamais entraîné (sur la fenêtre connue)
  if (m.hoursSinceLast != null && m.hoursSinceLast >= NEGLECT_HOURS) return 1;
  return 0;
}

function groupNeglect(
  byId: Map<MuscleId, MuscleState>,
  group: MuscleId[],
): { neglected: MuscleId[]; ratio: number } {
  const neglected: MuscleId[] = [];
  for (const id of group) {
    const m = byId.get(id);
    if (m && neglectScore(m) > 0) neglected.push(id);
  }
  return { neglected, ratio: group.length ? neglected.length / group.length : 0 };
}

function labels(ids: MuscleId[]): string {
  return ids.map((id) => MUSCLE_META[id].label).join(", ");
}

/**
 * Détecte les déséquilibres exploitables. Retourne une liste (éventuellement
 * vide — l'absence de déséquilibre est une information valable en soi que
 * l'UI peut afficher positivement).
 */
export function detectImbalances(input: ImbalanceInput): Imbalance[] {
  const byId = new Map(input.muscles.map((m) => [m.id, m] as const));
  const out: Imbalance[] = [];

  // 1. Muscles moteurs de CET exercice actuellement fatigués.
  const fatiguedPrimary = input.primary.filter(
    (id) => byId.get(id)?.status === "fatigued",
  );
  if (fatiguedPrimary.length > 0) {
    out.push({
      type: "recuperation_incomplete",
      severity: "warning",
      text: `Muscle(s) moteur(s) encore en récupération : ${labels(fatiguedPrimary)}.`,
      recommendation:
        "Espace davantage cet exercice ou allège la charge tant que la récupération n'est pas complète.",
    });
  }

  // 2. Poussée vs tirage.
  const push = groupNeglect(byId, PUSH);
  const pull = groupNeglect(byId, PULL);
  if (Math.abs(push.ratio - pull.ratio) >= 0.5) {
    const weaker = push.ratio > pull.ratio ? "poussée" : "tirage";
    const neglected = push.ratio > pull.ratio ? push.neglected : pull.neglected;
    out.push({
      type: "push_pull",
      severity: "warning",
      text: `Déséquilibre poussée/tirage : la chaîne de ${weaker} est en retard (${labels(neglected)} peu sollicités).`,
      recommendation:
        weaker === "tirage"
          ? "Ajoute du volume de tirage (rowing, tractions) pour équilibrer les épaules et protéger la posture."
          : "Rééquilibre avec du volume de poussée (développés, dips).",
    });
  }

  // 3. Haut vs bas du corps.
  const upper = groupNeglect(byId, UPPER);
  const lower = groupNeglect(byId, LOWER);
  if (lower.ratio - upper.ratio >= 0.5) {
    out.push({
      type: "haut_bas",
      severity: "warning",
      text: `Le bas du corps est nettement sous-travaillé (${labels(lower.neglected)}).`,
      recommendation:
        "Programme au moins une séance jambes par semaine (squat, presse, soulevé de terre) pour équilibrer le développement.",
    });
  } else if (upper.ratio - lower.ratio >= 0.6) {
    out.push({
      type: "haut_bas",
      severity: "info",
      text: "Le haut du corps est peu sollicité ces derniers temps.",
      recommendation: "Ajoute du volume sur le haut du corps pour un développement harmonieux.",
    });
  }

  // 4. Muscle moteur négligé (retard de fréquence sur cet exercice précis).
  const neglectedPrimary = input.primary.filter((id) => {
    const m = byId.get(id);
    return m && neglectScore(m) > 0 && m.status !== "unknown";
  });
  if (neglectedPrimary.length > 0) {
    out.push({
      type: "muscle_neglige",
      severity: "info",
      text: `${labels(neglectedPrimary)} n'a pas été stimulé depuis plus d'une semaine.`,
      recommendation: "Une fréquence de 2×/semaine par groupe musculaire optimise la progression.",
    });
  }

  // 5. Progression insuffisante sur cet exercice.
  if (input.progressState === "stagnation" || input.progressState === "regression") {
    out.push({
      type: "progression_insuffisante",
      severity: input.progressState === "regression" ? "warning" : "info",
      text:
        input.progressState === "regression"
          ? "Progression en recul sur cet exercice."
          : "Progression à l'arrêt sur cet exercice.",
      recommendation:
        "Applique une variable de surcharge (charge, reps, série ou tempo) ou vérifie récupération et sommeil.",
    });
  }

  return out;
}
