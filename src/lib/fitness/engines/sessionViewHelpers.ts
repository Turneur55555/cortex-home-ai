// ============================================================
// Helpers partagés pour toSessionView() — extraits en Phase 4 après
// que Cardio ait validé le pattern, avant d'écrire HYROX, pour que
// Course et Activités accompagnées n'aient elles non plus qu'à les
// appeler plutôt qu'à réinventer leur propre logique de présentation.
//
// Convention (documentée, pas imposée par les types car `metadata`
// reste volontairement libre par discipline — voir types.ts) : tout
// moteur non-force stocke ses segments générés sous la clé
// `metadata.segments`, dans le même format que `WorkoutTemplate.segments`
// (voir types.ts). `toWorkoutRecord` les copie tels quels depuis le
// template ; `toSessionView` les relit tels quels depuis `metadata` —
// AUCUNE re-dérivation de logique métier ne doit vivre dans ces deux
// fonctions, seulement du transport de données.
// ============================================================

import type { SessionSegment, SessionStat, WorkoutRecordDraft } from "./types";

/** Relit les segments stockés dans metadata.segments (voir convention
 *  ci-dessus). Retourne [] si absents ou malformés — ne doit jamais
 *  planter l'affichage sur une ligne historique ancienne/inattendue. */
export function segmentsFromMetadata(record: WorkoutRecordDraft): SessionSegment[] {
  const raw = (record.metadata as { segments?: unknown } | undefined)?.segments;
  return Array.isArray(raw) ? (raw as SessionSegment[]) : [];
}

/** Stat "Durée" commune à toute discipline, + stats additionnelles
 *  propres au moteur appelant (ex: "Activité", "Type de séance"). */
export function baseSummaryStats(
  record: WorkoutRecordDraft,
  extra: SessionStat[] = [],
): SessionStat[] {
  return [{ label: "Durée", value: `${record.duration_minutes} min` }, ...extra];
}
