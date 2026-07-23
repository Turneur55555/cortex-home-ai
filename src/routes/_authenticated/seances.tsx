import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SeancesTab } from "./fitness/SeancesTab";

// Domicile unique des Chroniques (23/07/2026) : `?chroniques=<module>` permet
// de deep-linker directement sur un module (Légendes/Forge/Progression)
// depuis l'extérieur de l'écran Séances — utilisé par les redirections
// `/trophees` et `/progression` (routes désormais orphelines, voir ces
// fichiers) pour que la Salle des trophées et le Rang par exercice gardent
// un domicile unique sans jamais casser un lien existant.
const chroniquesModuleSchema = z.enum(["legendes", "forge", "progression"]);

export const Route = createFileRoute("/_authenticated/seances")({
  head: () => ({
    meta: [
      { title: "Séances — ICORTEX" },
      { name: "description", content: "Tes séances d'entraînement et ton Coach IA." },
    ],
  }),
  validateSearch: z.object({ chroniques: chroniquesModuleSchema.optional() }),
  component: SeancesPage,
});

function SeancesPage() {
  const { chroniques } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // Capturé une seule fois au premier rendu : un deep-link (`/trophees`,
  // `/progression`) ne doit ouvrir le module concerné qu'à cette entrée-là,
  // jamais "coller" à chaque réouverture manuelle des Chroniques ensuite.
  const [initialChroniques] = useState(chroniques);
  useEffect(() => {
    if (chroniques) navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <SeancesTab initialChroniques={initialChroniques} />
    </main>
  );
}
