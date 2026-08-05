// ============================================================
// Logique pure des modèles de séance — zéro React. Sans lien avec Sensei
// (src/lib/fitness/engines/) : un modèle est une structure réutilisable,
// pas un moteur d'analyse.
// ============================================================

export interface SupersetGroupable {
  supersetWithPrevious: boolean;
}

/** Ligne d'exercice telle qu'issue d'une séance passée (table `exercises`). */
export interface PastWorkoutExerciseLike {
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  notes?: string | null;
}

/** Valeurs par défaut dérivées pour un exercice de modèle. */
export interface TemplateSeedExercise {
  name: string;
  default_sets: number | null;
  default_reps: number | null;
  default_weight: number | null;
  notes: string | null;
}

function normalizeKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Convertit les exercices d'une séance PASSÉE en valeurs de départ pour un
 *  nouveau modèle réutilisable — regroupe par nom (insensible aux accents),
 *  compte les séries réellement effectuées, retient la charge la plus
 *  lourde et les reps de la dernière série comme valeurs par défaut (de
 *  simples PLACEHOLDERS, ajustables dans l'éditeur avant création). */
export function workoutToTemplateSeed(
  rows: ReadonlyArray<PastWorkoutExerciseLike>,
): TemplateSeedExercise[] {
  const order: string[] = [];
  const byKey = new Map<string, { name: string; rows: PastWorkoutExerciseLike[] }>();
  for (const r of rows) {
    const name = r.name?.trim();
    if (!name) continue;
    const key = normalizeKey(name);
    if (!byKey.has(key)) {
      byKey.set(key, { name, rows: [] });
      order.push(key);
    }
    byKey.get(key)!.rows.push(r);
  }
  return order.map((key) => {
    const { name, rows: group } = byKey.get(key)!;
    let sets = 0;
    let maxWeight: number | null = null;
    let lastReps: number | null = null;
    let notes: string | null = null;
    for (const r of group) {
      sets += 1;
      if (r.weight != null) {
        maxWeight = maxWeight == null ? r.weight : Math.max(maxWeight, r.weight);
      }
      if (r.reps != null) lastReps = r.reps;
      if (!notes && r.notes) notes = r.notes;
    }
    return {
      name,
      default_sets: sets > 0 ? sets : null,
      default_reps: lastReps,
      default_weight: maxWeight,
      notes,
    };
  });
}

// ── Musculation hybride (2026-08-19) ────────────────────────────────────
// Un modèle est une liste ORDONNÉE d'items hétérogènes (exercice de force
// ou bloc métrique) — voir useWorkoutTemplates.ts pour le contrat complet
// (TemplateItemInput). Les deux tables (workout_template_exercises /
// workout_template_segments) partagent le MÊME espace de valeurs pour
// `position` ; cette fonction fusionne les deux listes pour reconstruire
// l'ordre réel "Bench Press, Course 1000m, Sled Push, Pull-ups, Row 1000m".
// Domaine pur : ne connaît que la FORME des lignes (pas les types
// Supabase/hooks), pour rester testable sans dépendance React/réseau.

export interface OrderedExerciseItem {
  kind: "exercise";
  position: number;
  name: string;
  superset_group: number | null;
  default_sets: number | null;
  default_reps: number | null;
  default_weight: number | null;
  notes: string | null;
}

export interface OrderedSegmentItem {
  kind: "segment";
  position: number;
  label: string;
  discipline: string;
  metric_key: string | null;
  metrics: Record<string, number | string>;
}

export type OrderedTemplateItem = OrderedExerciseItem | OrderedSegmentItem;

/** Fusionne exercices + blocs d'un modèle, triés par `position` — un
 *  template force-only (segments vides) ne retourne que des items
 *  `kind: "exercise"`, dans le même ordre qu'avant cette évolution. */
export function orderedTemplateItems<
  E extends {
    position: number;
    name: string;
    superset_group: number | null;
    default_sets: number | null;
    default_reps: number | null;
    default_weight: number | null;
    notes: string | null;
  },
  S extends {
    position: number;
    label: string;
    discipline: string | null;
    metric_key: string | null;
    metrics: Record<string, number | string>;
  },
>(template: { exercises: readonly E[]; segments: readonly S[] }): OrderedTemplateItem[] {
  const exerciseItems: OrderedTemplateItem[] = template.exercises.map((e) => ({
    kind: "exercise",
    position: e.position,
    name: e.name,
    superset_group: e.superset_group,
    default_sets: e.default_sets,
    default_reps: e.default_reps,
    default_weight: e.default_weight,
    notes: e.notes,
  }));
  const segmentItems: OrderedTemplateItem[] = template.segments.map((s) => ({
    kind: "segment",
    position: s.position,
    label: s.label,
    // Un bloc sans discipline connue ne devrait jamais exister en pratique
    // (toujours écrit avec sa discipline, voir replaceTemplateItems) — repli
    // défensif seulement, jamais une valeur inventée pour l'utilisateur.
    discipline: s.discipline ?? "autre",
    metric_key: s.metric_key,
    metrics: s.metrics,
  }));
  return [...exerciseItems, ...segmentItems].sort((a, b) => a.position - b.position);
}

/** Assigne un groupe de superset à chaque ligne marquée "superset avec
 *  l'exercice précédent" — deux lignes consécutives ainsi liées partagent
 *  le même groupe ; le reste garde `null` (pas de superset). */
export function computeSupersetGroups(
  rows: ReadonlyArray<SupersetGroupable>,
): Array<number | null> {
  const groups: Array<number | null> = new Array(rows.length).fill(null);
  let nextGroup = 1;
  for (let i = 1; i < rows.length; i += 1) {
    if (!rows[i].supersetWithPrevious) continue;
    if (groups[i - 1] == null) {
      groups[i - 1] = nextGroup;
      groups[i] = nextGroup;
      nextGroup += 1;
    } else {
      groups[i] = groups[i - 1];
    }
  }
  return groups;
}
