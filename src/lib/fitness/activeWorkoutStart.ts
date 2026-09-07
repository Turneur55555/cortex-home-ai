/**
 * CHANTIER FINAL (AUD-06) — DÉMARRAGE DE SÉANCE SÉRIALISÉ.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB), conformément à
 * `/src/lib` : on lui passe la tâche qui vérifie ET crée, elle garantit
 * qu'une seule s'exécute à la fois pour un utilisateur donné.
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Les cinq points de démarrage d'une séance (`useStartWorkout`,
 * `useStartHybridStrengthWorkout`, `useStartWorkoutFromTemplate`,
 * `useStartWorkoutFromSavedTemplate`, `useStartGenericActiveWorkout`) font
 * tous la même chose : `assertNoActiveWorkout()` LIT le store local, puis
 * `await`, puis `workoutsRepo.create()` ÉCRIT. Entre la lecture et
 * l'écriture, la boucle d'événements rend la main : deux déclenchements
 * rapprochés — double tap sur « Démarrer », deux mutations React Query
 * lancées sans être attendues, ou deux écrans qui démarrent la même séance —
 * lisent tous deux l'état d'AVANT la première écriture, concluent tous deux
 * « aucune séance active » et créent DEUX séances actives locales.
 *
 * Les conséquences sont exactement celles que la contrainte serveur est
 * censée empêcher, mais trop tard : l'écran de séance active choisit
 * arbitrairement la plus récente (`useActiveWorkout`), l'autre reste
 * invisible en local, et à la synchronisation l'index unique
 * `workouts_one_active_per_user` rejette la seconde — une opération en échec
 * définitif, donc `blocked`, donc une barrière de clôture qui retient la
 * récompense XP d'une séance que l'utilisateur croyait normale.
 *
 * MÊME PRINCIPE QUE `allocateSetNumber` (chantier 8, `setNumberAllocation.ts`)
 * ------------------------------------------------------------------------
 * Le défaut est le même (lecture-puis-écriture non atomique dans un contexte
 * unique) et le remède est le même : une chaîne de promesses qui sérialise
 * la section critique. La clé de sérialisation, elle, n'est PAS la même —
 * l'exercice là-bas, l'utilisateur ici — et `setNumberAllocation.ts` fait
 * partie du périmètre `set_number` gelé : on n'y touche pas, on reprend son
 * principe dans un module dédié plutôt que d'en détourner le sens.
 *
 * CE QUE ÇA NE FAIT PAS
 * ---------------------
 * - Aucun réseau : la sérialisation est strictement locale, un démarrage
 *   reste possible hors connexion, exactement comme avant.
 * - Aucune modification de la contrainte serveur : l'index unique
 *   `workouts_one_active_per_user` reste le garde-fou FINAL pour la course
 *   entre DEUX APPAREILS (ou deux onglets), qu'aucun verrou en mémoire ne
 *   peut couvrir — même limite déjà documentée et assumée par
 *   `assertNoActiveWorkout`. Ce module ferme la course la plus probable en
 *   usage réel : celle qui a lieu dans un seul contexte d'exécution.
 */

/**
 * Chaîne de promesses par utilisateur — un seul démarrage en vol à la fois.
 * L'entrée est retirée dès que la chaîne retombe au repos : la table ne
 * grossit pas avec le nombre de comptes rencontrés dans la session.
 */
const chains = new Map<string, Promise<unknown>>();

/**
 * Exécute `task` en EXCLUSION MUTUELLE pour cet utilisateur : la
 * vérification « aucune séance active » et la création qui la consomme
 * forment une section critique, si bien que la vérification suivante voit
 * toujours la création précédente — et échoue proprement sur le message de
 * conflit déjà connu de l'utilisateur, au lieu de créer un doublon.
 *
 * La sérialisation est par utilisateur, jamais globale : rien ne justifie de
 * faire attendre le démarrage d'un compte pour un autre.
 *
 * Un échec de `task` est propagé à SON appelant et n'empoisonne pas la
 * chaîne : le démarrage suivant (nouvelle tentative après une erreur réseau,
 * par exemple) part normalement.
 */
export function startActiveWorkoutExclusively<T>(
  userId: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = chains.get(userId) ?? Promise.resolve();
  // `catch` sur le maillon précédent uniquement : son erreur a déjà été
  // rendue à son propre appelant, elle ne doit ni se propager ici ni
  // interrompre la file.
  const result = previous.then(task, task);
  const chained = result.catch(() => undefined);
  chains.set(userId, chained);
  void chained.then(() => {
    // Ne libère que si personne ne s'est enchaîné entre-temps.
    if (chains.get(userId) === chained) chains.delete(userId);
  });
  return result;
}
