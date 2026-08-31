import type { NetworkMode, Query, QueryMeta } from "@tanstack/react-query";

/**
 * CRIT-05 — POINT UNIQUE de déclaration « cette query sait servir depuis
 * IndexedDB ».
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Le défaut TanStack Query (`networkMode: "online"`, cf. `src/router.tsx`)
 * met une query EN PAUSE tant que `navigator.onLine` est faux : sa `queryFn`
 * n'est jamais appelée. C'est le bon défaut pour une query qui n'a de sens
 * qu'avec le réseau, mais c'est FAUX pour les queries offline-first du projet
 * (`useRecipes`, `useNutrition`, `useShoppingList`, `useWorkouts`...) : leur
 * `queryFn` ne fait qu'un rafraîchissement serveur BEST-EFFORT (déjà gardé
 * par `getIsOnline()` + `try/catch`) avant de lire le store local via
 * `createOfflineRepository`. Mise en pause, elle ne lit jamais IndexedDB :
 * - au premier montage hors ligne (cache React Query vide — il n'est PAS
 *   persisté, cf. rapport chantier 3), l'écran reste bloqué en chargement
 *   alors que la donnée est sur l'appareil ;
 * - après une mutation offline, le refetch d'invalidation reste en pause et
 *   l'écran ne montre jamais ce qui vient pourtant d'être écrit localement.
 *
 * POURQUOI UN OBJET PARTAGÉ PLUTÔT QU'UN DÉFAUT GLOBAL INVERSÉ
 * ------------------------------------------------------------
 * Mettre `networkMode: "always"` en défaut global obligerait à marquer
 * explicitement les ~59 queries réellement online-only (sinon elles
 * passeraient d'un état « en pause, dernières données affichées » à un état
 * `error` hors connexion) : plus de churn ET plus de risque. Le défaut global
 * reste donc `"online"` (= online-only par défaut, cf. `src/router.tsx`) et
 * l'EXCEPTION est déclarée ici, une seule fois, puis étalée dans les ~22
 * queries capables de lire IndexedDB.
 *
 * COMMENT L'UTILISER
 * ------------------
 * ```ts
 * return useQuery({
 *   ...OFFLINE_FIRST_QUERY_OPTIONS,
 *   queryKey: [...],
 *   queryFn: async () => { ...refresh best-effort...; return repo.list(userId); },
 * });
 * ```
 * Une query n'a le droit à ce marqueur QUE si sa `queryFn` aboutit sans
 * réseau (tout appel serveur gardé par `getIsOnline()` et/ou `try/catch`,
 * lecture finale dans un repository offline). Le test de convention
 * `offlineQueryConvention.test.ts` vérifie ce point automatiquement.
 */
export const OFFLINE_FIRST_QUERY_OPTIONS: {
  networkMode: NetworkMode;
  refetchOnReconnect: boolean;
  meta: QueryMeta;
} = {
  // La `queryFn` tourne hors connexion — c'est elle qui décide (via
  // `getIsOnline()`) d'aller ou non sur le réseau, pas TanStack Query.
  networkMode: "always",
  // INDISPENSABLE, ET NON REDONDANT AVEC LE DÉFAUT (chantier 3, phase 7).
  // TanStack Query calcule ce défaut ainsi (`QueryClient.defaultQueryOptions`) :
  //     refetchOnReconnect ??= networkMode !== "always"
  // Autrement dit, marquer une query `networkMode: "always"` DÉSACTIVE
  // silencieusement son rafraîchissement au retour du réseau — logique pour
  // une query qui ignore vraiment le réseau, faux pour les nôtres : leur
  // `queryFn` fait un rafraîchissement serveur best-effort avant de lire
  // IndexedDB, donc la reconnexion est précisément le moment où il faut la
  // rejouer. Sans cette ligne, une session consultée hors ligne restait
  // affichée telle quelle après le retour du réseau (constaté sur les 4
  // queries passées en "always" au chantier 1). `true` conserve le
  // comportement ciblé de TanStack : seules les queries MONTÉES et PÉRIMÉES
  // sont refetchées — jamais tout le cache.
  refetchOnReconnect: true,
  // Marqueur lisible par le reste de l'app (invalidation ciblée après
  // synchronisation, cf. `useOfflineSync`) et par les devtools.
  meta: { offlineFirst: true },
};

/**
 * Vrai pour les queries déclarées offline-first via
 * `OFFLINE_FIRST_QUERY_OPTIONS`. Sert à cibler les invalidations après une
 * synchronisation réussie : seules ces queries lisent le store local que la
 * sync queue vient de mettre à jour — invalider tout le cache provoquerait
 * une rafale de refetch réseau inutiles (cf. chantier 3, phase 7).
 */
export function isOfflineFirstQuery(query: Pick<Query, "meta">): boolean {
  return query.meta?.offlineFirst === true;
}
