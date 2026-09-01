/**
 * CHANTIER 4 — MAJ-04 : fenêtre de fraîcheur + déduplication des
 * rafraîchissements serveur d'une query offline-first. Logique PURE (zéro
 * React, zéro Supabase) : on lui passe la tâche réseau, elle décide seulement
 * s'il faut l'exécuter.
 *
 * POURQUOI
 * --------
 * Une query offline-first fait, avant de lire IndexedDB, un rafraîchissement
 * serveur best-effort (`refreshWorkoutsFromServer`). C'est correct au montage
 * et au retour du réseau, mais ce même `queryFn` est rejoué à CHAQUE
 * invalidation — notamment après la validation d'une série. Or cette
 * validation vient d'être écrite localement et poussée par la sync queue : le
 * store local est déjà la version la plus récente, et la relecture serveur
 * n'apprend rigoureusement rien. Mesuré avant ce chantier : une validation de
 * série déclenchait 4 lectures serveur (workouts + exercises + exercise_sets +
 * workout_segments), et une clôture de séance jusqu'à 16 (4 queries montées
 * qui rafraîchissent chacune de leur côté).
 *
 * CE QUE ÇA NE FAIT PAS
 * ---------------------
 * Ça ne remplace aucune lecture par une supposition : quand la tâche est
 * ignorée, la `queryFn` lit quand même le store local (source de vérité
 * offline-first) et renvoie donc TOUJOURS un résultat complet. Aucune donnée
 * n'est perdue ni écrasée — seule une relecture réseau redondante disparaît.
 * Les moments où une lecture serveur apporte réellement quelque chose (premier
 * montage, retour du réseau, changement d'utilisateur) restent couverts :
 * `markStale()` rouvre explicitement la fenêtre.
 */

export interface ServerRefreshGate {
  /**
   * Exécute `task` si la fenêtre est ouverte pour cette clé. Deux appels
   * concurrents partagent le MÊME aller-retour (déduplication en vol) : les 4
   * queries montées pendant une séance ne déclenchent qu'un seul refresh.
   */
  run(key: string, task: () => Promise<void>, options?: { force?: boolean }): Promise<void>;
  /** Rouvre la fenêtre — la prochaine exécution ira réellement au serveur. */
  markStale(key?: string): void;
  /** Remise à zéro complète (tests). */
  reset(): void;
}

export function createServerRefreshGate(options: {
  windowMs: number;
  now?: () => number;
}): ServerRefreshGate {
  const now = options.now ?? (() => Date.now());
  const lastSuccessAt = new Map<string, number>();
  const inFlight = new Map<string, Promise<void>>();

  return {
    async run(key, task, runOptions) {
      const pending = inFlight.get(key);
      if (pending) return pending;

      if (!runOptions?.force) {
        const last = lastSuccessAt.get(key);
        if (last != null && now() - last < options.windowMs) return;
      }

      const promise = (async () => {
        try {
          await task();
          // Seul un passage réellement terminé referme la fenêtre : un échec
          // réseau ne doit pas faire croire à une donnée fraîche.
          lastSuccessAt.set(key, now());
        } finally {
          inFlight.delete(key);
        }
      })();
      inFlight.set(key, promise);
      return promise;
    },

    markStale(key) {
      if (key === undefined) lastSuccessAt.clear();
      else lastSuccessAt.delete(key);
    },

    reset() {
      lastSuccessAt.clear();
      inFlight.clear();
    },
  };
}
