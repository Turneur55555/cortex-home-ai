/**
 * CHANTIER 8 (A1, volet 3) — ATTRIBUTION DU NUMÉRO DE SÉRIE.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB), conformément à
 * `/src/lib` : on lui passe les séries existantes, elle renvoie un numéro ; et
 * elle sérialise l'allocation, sans jamais savoir ce qu'est un « store ».
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * `exercise_sets` porte `UNIQUE (exercise_id, set_number)` et le numéro est
 * choisi CÔTÉ CLIENT — il le faut, puisqu'une série doit pouvoir être créée
 * entièrement hors ligne. Deux collisions différentes sont donc possibles, et
 * elles ne se corrigent PAS au même endroit :
 *
 * 1. DANS LE MÊME CONTEXTE (même onglet, même store local). `useAddExerciseSet`
 *    LIT le store, puis `await`, puis ÉCRIT. Deux appels rapprochés — double
 *    tap sur « + Série », restauration de la séance précédente, ou simplement
 *    deux mutations React Query lancées sans être attendues — lisent tous
 *    deux l'état d'AVANT la première écriture et calculent le MÊME numéro.
 *    C'est la collision la plus probable en usage réel, et elle est
 *    entièrement évitable localement : c'est l'objet de `allocateSetNumber`.
 *
 * 2. ENTRE DEUX CONTEXTES (deux appareils, ou un appareil dont l'hydratation
 *    n'a pas encore rapatrié la série de l'autre). Aucun calcul local ne peut
 *    la prévenir : les deux stores sont légitimement différents. Elle est
 *    traitée à la SYNCHRONISATION, par le remappage du moteur
 *    (`lib/offline/uniqueSequenceRemap.ts`).
 *
 * Les deux volets sont complémentaires : le premier évite la collision quand
 * c'est possible, le second la résout sans perte quand ça ne l'est pas.
 */

/**
 * Numéro à donner à une nouvelle série : le plus grand déjà utilisé + 1.
 *
 * `fallback` (le numéro proposé par l'appelant, calculé depuis l'écran) ne
 * sert QUE lorsqu'aucune série exploitable n'existe — le store local reste la
 * référence dès qu'il dit quelque chose. Le résultat ne descend jamais sous 1,
 * le `CHECK (set_number >= 1)` de la base l'exigeant.
 *
 * `reduce` plutôt que `Math.max(...tableau)` : ce dernier passe chaque élément
 * en argument et dépasse la pile d'appels sur un grand tableau.
 */
export function nextSetNumber(params: {
  existing: ReadonlyArray<{ set_number: number }>;
  fallback: number;
}): number {
  const highest = params.existing.reduce(
    (max, set) => (Number.isFinite(set.set_number) ? Math.max(max, set.set_number) : max),
    0,
  );
  if (highest > 0) return highest + 1;
  return Number.isFinite(params.fallback) ? Math.max(1, Math.floor(params.fallback)) : 1;
}

/**
 * Chaîne de promesses par exercice — une seule allocation en vol à la fois
 * pour un exercice donné. L'entrée est retirée dès que la chaîne est
 * retombée au repos : la table ne grossit pas avec le nombre d'exercices
 * rencontrés dans la session.
 */
const chains = new Map<string, Promise<unknown>>();

/**
 * Exécute `task` en EXCLUSION MUTUELLE pour cet exercice : le calcul du numéro
 * et l'écriture qui le consomme forment une section critique, si bien que la
 * lecture suivante voit toujours l'écriture précédente.
 *
 * Strictement LOCAL et sans réseau : une séance reste entièrement utilisable
 * hors ligne. La sérialisation est par exercice, jamais globale — ajouter une
 * série à un exercice n'attend jamais un autre exercice.
 *
 * Un échec de `task` est propagé à SON appelant et n'empoisonne pas la chaîne :
 * l'allocation suivante démarre normalement.
 */
export function allocateSetNumber<T>(exerciseId: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(exerciseId) ?? Promise.resolve();
  // `catch` sur le maillon précédent uniquement : l'erreur a déjà été rendue à
  // son propre appelant, elle ne doit ni se propager ici ni interrompre la file.
  const result = previous.then(task, task);
  const chained = result.catch(() => undefined);
  chains.set(exerciseId, chained);
  void chained.then(() => {
    // Ne libère que si personne ne s'est enchaîné entre-temps.
    if (chains.get(exerciseId) === chained) chains.delete(exerciseId);
  });
  return result;
}
