import { QueryClient } from "@tanstack/react-query";

/**
 * Configuration React Query de l'application — SOURCE UNIQUE, partagée par
 * le point d'entrée normal (`src/router.tsx`) et le shell offline
 * (`src/offline-client.tsx` passe par le même `getRouter`). Extraite du
 * routeur pour être testable directement (`offlineQueries.test.ts`) sans
 * monter tout l'arbre de routes : le comportement offline global du projet
 * se lit et se vérifie ici.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1 * 60 * 1000, // 1 minute
        gcTime: 10 * 60 * 1000, // 10 minutes
        refetchOnWindowFocus: false, // évite les re-fetch sur chaque focus onglet
        retry: 1, // 1 retry au lieu de 3
        // RÈGLE GLOBALE (chantier 3 / CRIT-05) : le défaut du projet est
        // ONLINE-ONLY. `networkMode` reste au défaut TanStack ("online") —
        // une query non marquée n'a aucune représentation IndexedDB, elle
        // est donc mise en pause hors connexion (aucun appel réseau inutile,
        // les données déjà en cache restent affichées) et TanStack la reprend
        // tout seul au retour du réseau.
        //
        // L'EXCEPTION — les queries capables de servir depuis IndexedDB —
        // est déclarée en UN SEUL endroit :
        // `src/lib/offline/offlineQuery.ts` → `OFFLINE_FIRST_QUERY_OPTIONS`
        // (`networkMode: "always"` + `meta.offlineFirst`), étalé dans les
        // queries offline-first. Voir ce module pour le raisonnement complet
        // (pourquoi l'exception est déclarée côté queries locales plutôt que
        // l'inverse) et `offlineQueryConvention.test.ts` pour le garde-fou.
        //
        // `refetchOnReconnect` reste au défaut (true) : c'est lui qui, au
        // retour du réseau, refetch UNIQUEMENT les queries montées et
        // périmées — le rafraîchissement ciblé attendu, sans invalidation
        // massive du cache.
      },
      mutations: {
        // CRITIQUE (audit offline + test terrain réel, 28/08/2026) : sans ce
        // réglage, TanStack Query utilise `networkMode: "online"` par défaut
        // aussi pour les MUTATIONS — la fonction de mutation n'est alors
        // jamais exécutée tant que `navigator.onLine` est faux, quelle que
        // soit sa logique interne. Résultat mesuré en navigateur réel :
        // `useStartWorkout`/`useAddExerciseSet`/etc. restent "en pause"
        // indéfiniment hors ligne SANS JAMAIS appeler `workoutsRepo`, donc
        // sans jamais écrire dans IndexedDB — et si l'app se ferme pendant
        // cette pause (mutation en mémoire uniquement, jamais persistée),
        // l'action utilisateur est perdue sans trace. Ceci neutralisait
        // silencieusement TOUTE l'architecture offline-first (repository →
        // IndexedDB → syncQueue), qui elle-même n'a jamais besoin du réseau.
        // `networkMode: "always"` fait tourner la mutation immédiatement,
        // que le navigateur soit en ligne ou non — chaque mutation offline-
        // first (voir use-fitness.ts / useGenericActiveSession.ts /
        // useWorkoutTemplates.ts) reste elle-même 100% locale en premier
        // lieu, donc ce réglage ne fait qu'arrêter de la bloquer à tort.
        networkMode: "always",
      },
    },
  });
}
