import { createFileRoute, redirect } from "@tanstack/react-router";

// « Santé nutritionnelle » est le troisième onglet de l'écran Corps (E19). L'ancienne adresse
// continue de fonctionner : elle est redirigée avant même le rendu — un lien existant ne casse jamais.
export const Route = createFileRoute("/_authenticated/sante-nutritionnelle")({
  beforeLoad: () => {
    throw redirect({ to: "/corps", search: { onglet: "sante" }, replace: true });
  },
});
