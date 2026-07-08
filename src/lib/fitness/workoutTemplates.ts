// ============================================================
// Logique pure des modèles de séance — zéro React. Sans lien avec Sensei
// (src/lib/fitness/engines/) : un modèle est une structure réutilisable,
// pas un moteur d'analyse.
// ============================================================

export interface SupersetGroupable {
  supersetWithPrevious: boolean;
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
