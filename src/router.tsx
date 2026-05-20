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
