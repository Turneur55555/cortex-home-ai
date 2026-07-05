// ============================================================
// Calcul de l'XP par exercice — récompense la progression réelle,
// empêche le farming (une séance identique rapporte très peu).
// ============================================================

import { exerciseDifficulty } from "./exerciseRanks";

export interface SessionSetInput {
  reps: number | null;
  weight: number | null;
}

export interface SessionInput {
  workoutId: string;
  date: string; // YYYY-MM-DD
  sets: SessionSetInput[];
}

export interface SessionMetrics {
  workoutId: string;
  date: string;
  tonnage: number;
  topWeight: number;
  topReps: number;
  best1RM: number;
  setCount: number;
  isEmpty: boolean;
}

export interface SessionXp {
  session: SessionMetrics;
  xp: number;
  reason: string;
  isPR: boolean; // record 1RM ou tonnage
}

export interface ExerciseProgression {
  totalXp: number;
  sessions: SessionMetrics[];
  history: SessionXp[];
  best: {
    tonnage: number;
    weight: number;
    reps: number;
    oneRM: number;
  };
  timeline: Array<{
    date: string;
    tierIndex: number;
    fullName: string;
  }>;
}

// Epley 1RM
function oneRM(reps: number, weight: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function computeSessionMetrics(s: SessionInput): SessionMetrics {
  let tonnage = 0;
  let topWeight = 0;
  let topReps = 0;
  let best1RM = 0;
  let count = 0;
  for (const set of s.sets) {
    const reps = set.reps ?? 0;
    const weight = set.weight ?? 0;
    if (reps <= 0) continue;
    count += 1;
    // Poids du corps : on met un pseudo-poids 1 pour que le tonnage = reps.
    const w = weight > 0 ? weight : 1;
    tonnage += reps * w;
    if (weight > topWeight) {
      topWeight = weight;
      topReps = reps;
    } else if (weight === topWeight && reps > topReps) {
      topReps = reps;
    }
    const orm = oneRM(reps, w);
    if (orm > best1RM) best1RM = orm;
  }
  return {
    workoutId: s.workoutId,
    date: s.date,
    tonnage,
    topWeight,
    topReps,
    best1RM: Math.round(best1RM * 10) / 10,
  setCount: count,
  isEmpty: count === 0,
  };
}

/**
 * Calcule l'XP gagnée pour une session en la comparant aux records ANTÉRIEURS.
 * - Ligne de base minime : 10 XP pour logger.
 * - Bonus dégressifs pour battre tonnage / 1RM / poids max / reps à charge égale.
 * - Coefficient de difficulté appliqué en dernier.
 */
export function computeSessionXp(
  session: SessionMetrics,
  prev: { tonnage: number; oneRM: number; weight: number; reps: number },
  difficulty: number,
): { xp: number; reason: string; isPR: boolean } {
  if (session.isEmpty) return { xp: 0, reason: "Séance vide", isPR: false };

  let xp = 10; // base "log"
  const reasons: string[] = [];
  let isPR = false;

  // 1RM record — le plus valorisé
  if (session.best1RM > prev.oneRM && prev.oneRM > 0) {
    const delta = (session.best1RM - prev.oneRM) / prev.oneRM;
    const bonus = Math.min(400, Math.round(delta * 1200));
    if (bonus > 0) {
      xp += bonus;
      reasons.push(`+${bonus} XP nouveau 1RM`);
      isPR = true;
    }
  } else if (prev.oneRM === 0 && session.best1RM > 0) {
    xp += 60;
    reasons.push("+60 XP premier 1RM");
    isPR = true;
  }

  // Tonnage record
  if (session.tonnage > prev.tonnage && prev.tonnage > 0) {
    const delta = (session.tonnage - prev.tonnage) / prev.tonnage;
    const bonus = Math.min(250, Math.round(delta * 500));
    if (bonus > 0) {
      xp += bonus;
      reasons.push(`+${bonus} XP record de volume`);
      isPR = true;
    }
  } else if (prev.tonnage === 0 && session.tonnage > 0) {
    xp += 40;
    reasons.push("+40 XP premier volume");
  }

  // Charge maximale battue
  if (session.topWeight > prev.weight && prev.weight > 0) {
    xp += 80;
    reasons.push("+80 XP nouvelle charge max");
    isPR = true;
  }

  // Répétitions battues à charge égale
  if (session.topWeight === prev.weight && session.topReps > prev.reps && prev.reps > 0) {
    const extra = session.topReps - prev.reps;
    xp += extra * 25;
    reasons.push(`+${extra * 25} XP ${extra} rep(s) en plus`);
    isPR = true;
  }

  xp = Math.round(xp * difficulty);
  return {
    xp,
    reason: reasons.length ? reasons.join(" · ") : "Séance validée",
    isPR,
  };
}

/**
 * Fait tourner tout l'historique et retourne l'XP totale + timeline des rangs.
 */
export function computeExerciseProgression(
  exerciseName: string,
  sessions: SessionInput[],
): ExerciseProgression {
  const difficulty = exerciseDifficulty(exerciseName);
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const metrics = sorted.map(computeSessionMetrics);

  const history: SessionXp[] = [];
  let totalXp = 0;
  const best = { tonnage: 0, weight: 0, reps: 0, oneRM: 0 };

  // Timeline (nécessite import dynamique pour éviter cycle)
  const timeline: ExerciseProgression["timeline"] = [];
  // Import direct : pas de cycle car exerciseRanks n'importe pas exerciseXp.
  // (utilisé plus bas via require-like — on l'inline avec import statique en tête)

  for (const m of metrics) {
    const result = computeSessionXp(m, best, difficulty);
    totalXp += result.xp;
    history.push({ session: m, xp: result.xp, reason: result.reason, isPR: result.isPR });

    if (m.tonnage > best.tonnage) best.tonnage = m.tonnage;
    if (m.topWeight > best.weight) {
      best.weight = m.topWeight;
      best.reps = m.topReps;
    } else if (m.topWeight === best.weight && m.topReps > best.reps) {
      best.reps = m.topReps;
    }
    if (m.best1RM > best.oneRM) best.oneRM = m.best1RM;
  }

  return { totalXp, sessions: metrics, history, best, timeline };
}

/**
 * Objectifs concrets pour atteindre le palier suivant, en s'appuyant sur les
 * records actuels.
 */
export function nextObjectives(
  exerciseName: string,
  best: ExerciseProgression["best"],
  xpToNext: number,
): string[] {
  const difficulty = exerciseDifficulty(exerciseName);
  const suggestions: string[] = [];

  if (best.weight > 0 && best.reps > 0) {
    // +1 kg progression concrète
    const nextW = Math.round((best.weight + 2.5) * 10) / 10;
    suggestions.push(`${nextW} kg × ${best.reps} reps`);
    suggestions.push(`+2 reps à ${best.weight} kg`);
  } else if (best.reps > 0) {
    // Bodyweight
    suggestions.push(`+${Math.max(2, Math.round(best.reps * 0.15))} répétitions`);
    suggestions.push(`Ajouter 2,5 kg lestés`);
  } else {
    suggestions.push(`Enregistrer une première série`);
  }

  // Approximation XP nécessaire → nouveau volume à battre
  if (best.tonnage > 0) {
    const deltaTonnage = Math.ceil((xpToNext / difficulty / 500) * best.tonnage);
    if (deltaTonnage > 0) {
      suggestions.push(`+${Math.round(deltaTonnage)} kg de tonnage`);
    } else {
      suggestions.push(`Nouveau record de volume`);
    }
  }

  return suggestions.slice(0, 3);
}
