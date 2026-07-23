import { createFileRoute, redirect } from "@tanstack/react-router";

// Domicile unique de la Salle des trophées (23/07/2026) : Chroniques →
// Progression (voir SeancesTab/ChroniquesPage/ProgressionModule, qui monte
// <TrophyRoom> — badges ⊕ succès unifiés). Cette route ne rend plus rien
// elle-même : elle ne fait que rediriger, pour qu'un lien ou un favori
// existant vers /trophees continue de fonctionner au lieu de dupliquer le
// contenu ou de 404. Même pattern que /_authenticated/fitness/index.tsx.
export const Route = createFileRoute("/_authenticated/trophees")({
  beforeLoad: () => {
    throw redirect({ to: "/seances", search: { chroniques: "progression" } });
  },
});
