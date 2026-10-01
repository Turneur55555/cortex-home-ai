import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CHRONIQUES_MODULE_KEYS } from "@/lib/fitness/chroniquesModules";
import { SeancesTab } from "./fitness/SeancesTab";

// Les Chroniques ont désormais leur propre route (`/chroniques`, E20). L'ancien lien
// `/seances?chroniques=<module>` (Légendes/Forge/Progression) continue de fonctionner : il est
// redirigé avant même le rendu — un lien existant ne casse jamais.
const chroniquesModuleSchema = z.enum(CHRONIQUES_MODULE_KEYS);

// `?demarrer=nouvelle` : la Carte du jour de l'Accueil renvoie ici pour ouvrir
// « Choisir une épreuve » (le parcours de séance vit tout entier sur cet écran).
const demarrerSchema = z.literal("nouvelle");

export const Route = createFileRoute("/_authenticated/seances")({
  head: () => ({
    meta: [
      { title: "Séances — ICORTEX" },
      { name: "description", content: "Tes séances d'entraînement et ton Coach IA." },
    ],
  }),
  validateSearch: z.object({
    chroniques: chroniquesModuleSchema.optional(),
    demarrer: demarrerSchema.optional(),
  }),
  beforeLoad: ({ search }) => {
    if (search.chroniques) {
      throw redirect({ to: "/chroniques", search: { module: search.chroniques }, replace: true });
    }
  },
  component: SeancesPage,
});

function SeancesPage() {
  const { demarrer } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // `?demarrer=` lu une fois au premier rendu, puis retiré de l'URL : un rafraîchissement ne
  // rouvre pas la feuille.
  const [initialNewSession] = useState(demarrer === "nouvelle");
  useEffect(() => {
    if (demarrer) navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <SeancesTab initialNewSession={initialNewSession} />
    </main>
  );
}
