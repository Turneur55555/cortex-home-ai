// ============================================================
// Domaine pur — dérive la liste "exercices récents" pour le picker
// générique d'ajout d'exercice (Phase B, 2026-07-15, voir
// docs/architecture/phase-b-carte-exercice-unique.md). Pendant de
// computeRecentExercises (recentExercises.ts, musculation) pour les
// disciplines qui persistent dans workouts.metadata.segments
// (Cardio/HYROX/Guided/Autre) — même principe (dédoublonnage, le plus
// récent gagne), source de donnée différente.
//
// Course (workout_segments, table dédiée) n'est PAS couverte ici — gap
// documenté dans le document de phase : recherche et création libre
// restent pleinement fonctionnelles pour cette discipline, seule la
// liste "récents" est vide.
// ============================================================

export interface SegmentWorkoutLike {
  metadata: { segments?: ReadonlyArray<{ label?: string | null }> } | null;
}

/** `workouts` doit déjà être trié le plus récent en premier (comme
 *  `computeRecentExercises`) — le premier libellé rencontré l'emporte. */
export function computeRecentSegmentLabels(
  workouts: ReadonlyArray<SegmentWorkoutLike> | undefined,
  limit = 20,
): string[] {
  if (!workouts) return [];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const w of workouts) {
    const segs = w.metadata?.segments;
    if (!Array.isArray(segs)) continue;
    for (const seg of segs) {
      const label = seg?.label?.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(label);
      if (labels.length >= limit) return labels;
    }
  }
  return labels;
}
