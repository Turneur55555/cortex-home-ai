// ============================================================
// Sensei briefing (Phase 8) — assemble les informations que le Sensei
// (et demain le Planner Engine) doivent CONNAÎTRE avant de dialoguer :
// dernières disciplines pratiquées, statistiques principales, dernier
// record, récupération disponible.
//
// Fonction PURE (zéro import React, zéro décision) : elle ne choisit
// JAMAIS quelle discipline proposer ni ne pré-remplit aucune réponse —
// c'est exactement la frontière documentée dans SenseiContext (types.ts) :
// "un WorkoutEngine ne décide jamais lui-même quoi proposer". Ce fichier
// prépare seulement les données ; CoachSheet.tsx les AFFICHE (lecture
// seule), il ne les utilise pour rien d'automatique. Le futur Planner
// Engine consommera cette même fonction pour, lui, décider.
//
// "Derniers records" reste honnêtement limité à la musculation (seule
// discipline avec un vrai PR chiffré aujourd'hui — cf. la limite déjà
// documentée en Phase 5 sur "Allure moyenne" pour Course) : pas de
// record inventé pour HYROX/Course/Cardio/Guidé.
// ============================================================

import type { DisciplineId } from "./types";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";

export interface SenseiBriefing {
  /** Disciplines pratiquées récemment, les plus récentes en premier, dédupliquées (max 3). */
  recentDisciplines: Array<{ discipline: DisciplineId; lastDate: string }>;
  /** Sur l'échantillon fourni (borné par useWorkouts(), 60 lignes max) — un
   *  repère pour le Sensei, pas un compteur exact (voir workoutsCountTotal
   *  côté achievements pour le vrai total serveur si besoin un jour). */
  totalSessions: number;
  weeklySessions: number;
  /** Musculation uniquement — voir en-tête de fichier. */
  bestPR: { name: string; weight: number } | null;
  recovery: {
    readyCount: number;
    fatiguedCount: number;
    /** Libellés des muscles les plus fatigués (max 2), pour affichage direct. */
    mostFatigued: string[];
  };
}

export interface BuildSenseiBriefingInput {
  /** Triés du plus récent au plus ancien (ordre natif de useWorkouts()). */
  workouts: Array<{ date: string; discipline?: string | null }>;
  bestPR: { name: string; weight: number } | null;
  recoveryMap: Map<MuscleId, MuscleRecovery>;
}

export function buildSenseiBriefing(input: BuildSenseiBriefingInput): SenseiBriefing {
  const recentDisciplines: Array<{ discipline: DisciplineId; lastDate: string }> = [];
  const seen = new Set<DisciplineId>();
  for (const w of input.workouts) {
    const discipline = ((w.discipline as DisciplineId | null) ?? "muscu") as DisciplineId;
    if (seen.has(discipline)) continue;
    seen.add(discipline);
    recentDisciplines.push({ discipline, lastDate: w.date });
    if (recentDisciplines.length >= 3) break;
  }

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weeklySessions = input.workouts.filter((w) => new Date(w.date) >= weekStart).length;

  let readyCount = 0;
  let fatiguedCount = 0;
  const fatigued: Array<{ label: string; hoursRemaining: number }> = [];
  for (const recovery of input.recoveryMap.values()) {
    if (recovery.status === "ready") readyCount += 1;
    if (recovery.status === "fatigued" || recovery.status === "recovering") {
      fatiguedCount += 1;
      fatigued.push({ label: recovery.label, hoursRemaining: recovery.hoursRemaining ?? 0 });
    }
  }
  const mostFatigued = fatigued
    .sort((a, b) => b.hoursRemaining - a.hoursRemaining)
    .slice(0, 2)
    .map((f) => f.label);

  return {
    recentDisciplines,
    totalSessions: input.workouts.length,
    weeklySessions,
    bestPR: input.bestPR,
    recovery: { readyCount, fatiguedCount, mostFatigued },
  };
}
