/**
 * Exclusion mutuelle PAR CLÉ — logique pure (zéro React, Supabase, IndexedDB).
 *
 * Une section critique « lire l'état local, décider, écrire » n'est pas
 * atomique : entre la lecture et l'écriture, la boucle d'événements rend la
 * main. Deux déclenchements rapprochés (double tap, deux mutations lancées
 * sans être attendues) lisent alors tous deux l'état d'AVANT la première
 * écriture et décident la même chose — deux créations au lieu d'une.
 *
 * `runExclusively(key, task)` enchaîne les tâches d'une même clé : la
 * suivante part quand la précédente est terminée, et voit donc son écriture.
 *
 * Même PRINCIPE que `activeWorkoutStart.ts` (clé = utilisateur, séances) et
 * `setNumberAllocation.ts` (clé = exercice, séries) — volontairement un module
 * distinct : ces deux-là sont des sections critiques du moteur de séance,
 * vérifiées et gelées, qu'on ne détourne pas ; et une table de chaînes
 * PARTAGÉE ferait attendre l'écriture d'un planning derrière le démarrage
 * d'une séance, sans aucun rapport entre les deux. Chaque domaine garde donc
 * sa propre table, en passant par cette fonction.
 *
 * Strictement local, sans réseau : rien ne devient impossible hors connexion.
 * Ne couvre pas deux appareils ni deux onglets — aucun verrou en mémoire ne le
 * peut ; c'est à la couche de données de tolérer ce cas.
 */

/** Une table de chaînes par domaine : voir `createExclusiveRunner`. */
export type ExclusiveRunner = <T>(key: string, task: () => Promise<T>) => Promise<T>;

/**
 * Crée un exécuteur exclusif DOMAINE-SPÉCIFIQUE. Chaque appel renvoie sa propre
 * table de chaînes, jamais partagée avec un autre exécuteur.
 *
 * L'entrée d'une clé est retirée dès que sa chaîne retombe au repos : la table
 * ne grossit pas avec le nombre de comptes rencontrés dans la session.
 *
 * Un échec de `task` est rendu à SON appelant et n'empoisonne pas la chaîne :
 * la tâche suivante (nouvelle tentative après une erreur, par exemple) part
 * normalement.
 */
export function createExclusiveRunner(): ExclusiveRunner {
  const chains = new Map<string, Promise<unknown>>();

  return function runExclusively<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve();
    // `then(task, task)` : l'erreur du maillon précédent a déjà été rendue à son
    // propre appelant ; elle ne doit ni se propager ici ni interrompre la file.
    const result = previous.then(task, task);
    const chained = result.catch(() => undefined);
    chains.set(key, chained);
    void chained.then(() => {
      // Ne libère que si personne ne s'est enchaîné entre-temps.
      if (chains.get(key) === chained) chains.delete(key);
    });
    return result;
  };
}
