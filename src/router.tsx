import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { LoadingScreen } from "@/components/loading-screen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1 * 60 * 1000,       // 1 minute
        gcTime: 10 * 60 * 1000,          // 10 minutes
        refetchOnWindowFocus: false,      // évite les re-fetch sur chaque focus onglet
        retry: 1,                         // 1 retry au lieu de 3
      },
      mutations: {
        // Offline-first (voir src/lib/offline/) : SANS ceci, React Query v5
        // applique `networkMode: "online"` et MET EN PAUSE toute mutation
        // dès que `navigator.onLine` est faux — `mutationFn` n'est alors
        // jamais appelée, donc le repository n'écrit jamais dans IndexedDB
        // et rien n'est enfilé dans la sync queue. `onMutate` s'exécutant
        // quand même, l'UI affichait la donnée puis la perdait au refresh.
        // Nos mutations n'ont AUCUN besoin du réseau : elles écrivent en
        // local (repository) et c'est le sync engine — lui seul — qui parle
        // à Supabase quand la connexion revient.
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
