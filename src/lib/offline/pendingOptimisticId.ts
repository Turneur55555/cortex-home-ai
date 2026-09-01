/**
 * Corrélation id optimiste ("tmp-*", assigné avant que l'id réel côté
 * repository soit connu) → id réel une fois la création locale résolue.
 *
 * Corrige le bug "tmp-*" (audit offline module Séance, 28/08/2026) :
 * `useUpdateExerciseSet`/`useDeleteExerciseSet` (use-fitness.ts) ignoraient
 * SILENCIEUSEMENT toute action utilisateur sur une entité dont la création
 * optimiste n'avait pas encore été remplacée par son vrai id dans le cache
 * React Query — fenêtre de course réelle en usage (plusieurs entités créées
 * puis modifiées/supprimées rapidement hors ligne). `resolve()` attend la
 * résolution de la création en cours au lieu d'abandonner l'opération —
 * garantit aussi l'ordre create → update/delete dans la sync queue (le
 * `create()` du repository a nécessairement terminé, donc déjà enfilé son
 * opération, avant que la promesse ne se résolve).
 *
 * Générique et sans dépendance React : utilisable par toute mutation
 * offline-first qui assigne un id optimiste avant la résolution du
 * repository (exercise_sets aujourd'hui, tout futur cas similaire demain).
 */

interface PendingEntry {
  promise: Promise<string>;
  resolve: (id: string) => void;
  reject: (err: unknown) => void;
}

export interface PendingIdResolver {
  /** À appeler dès que l'id optimiste est assigné, AVANT le début de la
   *  création réelle — garantit qu'aucun `resolve()` concurrent ne peut
   *  jamais rater l'entrée. */
  register(tmpId: string): void;
  /** À appeler une fois la création réelle terminée (succès ou échec) —
   *  débloque tout `resolve()` en attente sur ce `tmpId` et libère l'entrée. */
  settle(tmpId: string, result: { ok: true; id: string } | { ok: false; error: unknown }): void;
  /** Résout un id potentiellement optimiste vers son id réel. Un id qui ne
   *  porte pas le préfixe, ou un `tmpId` inconnu (jamais enregistré, ou déjà
   *  résolu et retiré), ressort inchangé — jamais de blocage indéfini sur
   *  une entrée qui n'existe pas. */
  resolve(id: string): Promise<string>;
}

/**
 * Préfixe des ids optimistes, SOURCE UNIQUE de la convention. Exporté depuis
 * le chantier 1 bis : le domaine Fitness doit pouvoir garantir qu'aucun id
 * optimiste n'entre dans les dépendances d'une opération de synchronisation
 * (cf. `lib/fitness/workoutSyncDependencies.ts`) — sans redéclarer « tmp- »
 * de son côté.
 */
export const OPTIMISTIC_ID_PREFIX = "tmp-";

/** Cet id est-il un id optimiste, pas encore résolu vers son id réel ? */
export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

export function createPendingIdResolver(prefix = OPTIMISTIC_ID_PREFIX): PendingIdResolver {
  const pending = new Map<string, PendingEntry>();

  return {
    register(tmpId) {
      let resolveFn!: (id: string) => void;
      let rejectFn!: (err: unknown) => void;
      const promise = new Promise<string>((res, rej) => {
        resolveFn = res;
        rejectFn = rej;
      });
      pending.set(tmpId, { promise, resolve: resolveFn, reject: rejectFn });
    },
    settle(tmpId, result) {
      const entry = pending.get(tmpId);
      if (!entry) return;
      if (result.ok) entry.resolve(result.id);
      else entry.reject(result.error);
      pending.delete(tmpId);
    },
    async resolve(id) {
      if (!id.startsWith(prefix)) return id;
      const entry = pending.get(id);
      if (!entry) return id;
      return entry.promise;
    },
  };
}
