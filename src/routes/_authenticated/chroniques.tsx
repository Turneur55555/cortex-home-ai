import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { chroniquesSearchSchema, createChroniquesRouting } from "@/lib/fitness/chroniquesRouting";
import { SeancesTab } from "./fitness/SeancesTab";

// Second étage de « Séances » (E20) : une VRAIE route. Le module actif (`?module=`) et la Chronique
// immersive ouverte (`?seance=`) vivent dans l'URL — retour arrière du navigateur, lien direct et
// reprise après rechargement fonctionnent. Les choix de navigation (remplacer ou empiler, revenir
// en arrière ou remplacer) sont dans `lib/fitness/chroniquesRouting.ts`, pure et testée : cette
// route ne fait que fournir les effets.
export const Route = createFileRoute("/_authenticated/chroniques")({
  head: () => ({
    meta: [
      { title: "Chroniques — ICORTEX" },
      { name: "description", content: "Le livre de vie de ton entraînement." },
    ],
  }),
  validateSearch: chroniquesSearchSchema,
  component: ChroniquesRoute,
});

function ChroniquesRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();

  const routing = createChroniquesRouting({
    search,
    setSearch: (patch, { replace }) =>
      void navigate({ search: (previous) => ({ ...previous, ...patch }), replace }),
    canGoBack: () => router.history.canGoBack(),
    goBack: () => router.history.back(),
  });

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <SeancesTab view="chroniques" chroniques={routing} />
    </main>
  );
}
