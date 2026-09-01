import type { Query, QueryMeta } from "@tanstack/react-query";

/**
 * CHANTIER 4 (MAJ-08 / CRIT-03) — POINT UNIQUE de déclaration « cette query
 * lit une valeur que SEUL le serveur peut produire à partir de ce que la sync
 * queue lui a poussé ».
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Le chantier 3 a rendu l'invalidation post-synchronisation CIBLÉE : après un
 * passage réussi de la queue, `useOfflineSync` n'invalide que les queries
 * offline-first (`meta.offlineFirst`, cf. `offlineQuery.ts`), c'est-à-dire
 * celles qui lisent le store IndexedDB que la synchronisation vient de mettre
 * à jour. C'était le bon périmètre… pour les données locales.
 *
 * Mais une partie de l'état RPG n'est PAS produite localement : l'XP
 * (`user_stats`), l'historique de promotions (`rank_promotions`) et le
 * récapitulatif de récompense d'une séance (`xp_events`,
 * `workouts.xp_before/xp_after`) sont écrits par des TRIGGERS SERVEUR
 * déclenchés par l'arrivée de nos opérations (`award_xp_on_workout_complete`,
 * `record_rank_promotions`). Ces queries ne lisent pas IndexedDB : elles
 * n'étaient donc jamais invalidées après une synchronisation. Conséquence
 * constatée (MAJ-08) : une séance terminée hors ligne puis synchronisée au
 * retour du réseau laissait le Niveau/Rang affichés sur la valeur d'avant,
 * jusqu'à un remontage d'écran ou l'expiration du `staleTime`.
 *
 * Ce marqueur déclare la SECONDE catégorie légitime à rafraîchir après une
 * synchronisation réussie. Il ne remplace pas `offlineFirst` et ne change
 * rien au comportement réseau de la query (pas de `networkMode` ici) : c'est
 * uniquement une étiquette d'invalidation.
 *
 * COMMENT L'UTILISER
 * ------------------
 * ```ts
 * return useQuery({
 *   ...SERVER_CONFIRMED_QUERY_OPTIONS,
 *   queryKey: ["user_stats", userId],
 *   queryFn: async () => { ...lecture serveur... },
 * });
 * ```
 * Une query n'a le droit à ce marqueur QUE si sa valeur dépend d'une écriture
 * que la sync queue pousse (sinon on la rafraîchirait pour rien à chaque
 * passage de queue).
 */
export const SERVER_CONFIRMED_QUERY_OPTIONS: { meta: QueryMeta } = {
  meta: { serverConfirmed: true },
};

/**
 * Vrai pour les queries déclarées via `SERVER_CONFIRMED_QUERY_OPTIONS`.
 * Utilisé par `useOfflineSync` pour cibler l'invalidation post-synchronisation
 * (avec `isOfflineFirstQuery`), sans jamais retomber dans un
 * `invalidateQueries()` global.
 */
export function isServerConfirmedQuery(query: Pick<Query, "meta">): boolean {
  return query.meta?.serverConfirmed === true;
}
