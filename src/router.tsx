import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { LoadingScreen } from "@/components/loading-screen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1 * 60 * 1000, // 1 minute
        gcTime: 10 * 60 * 1000, // 10 minutes
        refetchOnWindowFocus: false, // évite les re-fetch sur chaque focus onglet
        retry: 1, // 1 retry au lieu de 3
        // networkMode reste au défaut ("online") pour les queries : pas
        // d'appel réseau inutile hors connexion, le cache déjà chargé
        // continue de s'afficher normalement (comportement existant conservé).
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

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <LoadingScreen />,
    defaultPendingMs: 200,
    defaultPendingMinMs: 300,
  });

  return router;
};
