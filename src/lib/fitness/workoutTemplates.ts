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
