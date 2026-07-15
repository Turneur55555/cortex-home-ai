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

import type {
  LiveSegmentMetricValue,
  LiveSegmentRow,
  LiveSegmentSeed,
  SessionSegment,
  SessionStat,
  WorkoutRecordDraft,
  WorkoutTemplate,
} from "./types";

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

// ============================================================
// Live-tracking générique (Phase A, 15/07/2026) — extension du pilote
// Course (09/07/2026) à Cardio/HYROX/Activité accompagnée/Autre. Réutilise
// le miroir numérique `SessionSegment.metrics` (Phase 1 multi-discipline,
// déjà posé par chaque moteur pour l'historique/records) plutôt que de
// dupliquer un buildLiveSegments/formatLiveSegment par moteur — Course
// garde sa propre implémentation (courseEngine.ts) car elle recalcule les
// métriques depuis metadata plutôt que d'utiliser template.segments
// directement ; les 4 autres moteurs peuvent réutiliser template.segments
// tel quel, ils le construisent déjà avec `metrics` rempli (ou vide pour
// Autre, dont le contenu est du texte libre généré par l'IA — le segment
// reste éditable/reformable en direct même sans métrique numérique
// préremplie, aucune perte fonctionnelle par rapport à avant).
// ============================================================

/** Convertit les segments déjà générés par `engine.generate()` en seeds
 *  éditables pour la séance active. `_draft` n'est pas utilisé ici
 *  (contrairement à courseEngine.ts) car `template.segments` porte déjà
 *  tout ce qu'il faut pour ces moteurs. */
export function genericBuildLiveSegments(
  template: WorkoutTemplate,
  _draft: WorkoutRecordDraft,
): LiveSegmentSeed[] {
  return (template.segments ?? []).map((segment) => ({
    label: segment.label,
    metrics: (segment.metrics ?? {}) as Record<string, LiveSegmentMetricValue>,
  }));
}

/** Reformate un segment live (potentiellement ajouté/édité par
 *  l'utilisateur pendant la séance) en `SessionSegment` d'affichage, pour
 *  resynchroniser `workouts.metadata.segments` à la clôture — même
 *  principe générique que `formatLiveSegmentImpl` dans courseEngine.ts,
 *  sans vocabulaire propre à une discipline (aucune clé de métrique
 *  connue à l'avance, contrairement à Course). */
export function genericFormatLiveSegment(segment: LiveSegmentRow): SessionSegment {
  const stats: SessionStat[] = [];
  const metrics: Record<string, number> = {};
  const raw = segment.metrics ?? {};

  for (const [key, value] of Object.entries(raw)) {
    stats.push({ label: key, value: String(value) });
    if (typeof value === "number") metrics[key] = value;
  }
  if (segment.completed) stats.push({ label: "Statut", value: "Réalisé" });

  return { label: segment.label, stats, metrics };
}
