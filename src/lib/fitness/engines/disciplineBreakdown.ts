// ============================================================
// Répartition générique par discipline (Phase 8) — nombre de séances,
// durée totale, dernière séance, PAR discipline. Fonction pure, zéro
// import React, utilisable par n'importe quel écran (Profil aujourd'hui).
//
// Volontairement LIMITÉ à ces 3 métriques génériques (communes à TOUTE
// discipline, cf. Phase 7 "Durée 7j") : pas de rang, pas de records, pas
// de recommandations par discipline ici — Nathan a explicitement dit que
// chaque discipline "pourra posséder PLUS TARD" son propre rang/ses
// propres records/succès/recommandations, sans dépendre des autres. Ce
// fichier est le point de départ générique sur lequel un futur système
// de progression PAR discipline pourra s'appuyer (même `DisciplineId`,
// mêmes données `workouts`), sans qu'aucune donnée ne soit inventée ici.
// ============================================================

import type { DisciplineId } from "./types";

export interface DisciplineBreakdownEntry {
  discipline: DisciplineId;
  sessionsCount: number;
  totalDurationMinutes: number;
  /** Date ISO (YYYY-MM-DD) de la séance la plus récente pour cette discipline. */
  lastSessionDate: string | null;
}

export interface WorkoutForBreakdown {
  date: string;
  duration_minutes: number | null;
  discipline?: string | null;
}

/** Trie par nombre de séances décroissant — "discipline la plus pratiquée" en tête. */
export function computeDisciplineBreakdown(
  workouts: WorkoutForBreakdown[] | null | undefined,
): DisciplineBreakdownEntry[] {
  const byDiscipline = new Map<DisciplineId, DisciplineBreakdownEntry>();
  for (const w of workouts ?? []) {
    const discipline = ((w.discipline as DisciplineId | null) ?? "muscu") as DisciplineId;
    const entry = byDiscipline.get(discipline) ?? {
      discipline,
      sessionsCount: 0,
      totalDurationMinutes: 0,
      lastSessionDate: null,
    };
    entry.sessionsCount += 1;
    entry.totalDurationMinutes += w.duration_minutes ?? 0;
    if (!entry.lastSessionDate || w.date > entry.lastSessionDate) {
      entry.lastSessionDate = w.date;
    }
    byDiscipline.set(discipline, entry);
  }
  return Array.from(byDiscipline.values()).sort((a, b) => b.sessionsCount - a.sessionsCount);
}
