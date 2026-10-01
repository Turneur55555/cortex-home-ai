import { createFileRoute } from "@tanstack/react-router";
import { CorpsScreen } from "@/components/corps/CorpsScreen";
import { corpsSearchSchema } from "@/lib/fitness/corpsTabs";

// Corps : trois onglets (Objectif | Mesures | Santé, E19) dans l'URL (`?onglet=`). Santé nutritionnelle,
// autrefois une page à part, en est le troisième onglet.
export const Route = createFileRoute("/_authenticated/corps")({
  head: () => ({
    meta: [
      { title: "Corps — ICORTEX" },
      {
        name: "description",
        content: "Ton objectif, ta composition corporelle, tes mensurations et ta santé.",
      },
    ],
  }),
  validateSearch: corpsSearchSchema,
  component: CorpsPage,
});

function CorpsPage() {
  const { onglet } = Route.useSearch();
  return <CorpsScreen onglet={onglet} />;
}
