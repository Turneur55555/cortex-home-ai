import { createFileRoute, redirect } from "@tanstack/react-router";

// Domicile unique du Rang par exercice / de la maîtrise (23/07/2026) :
// Chroniques → Les Légendes (voir SeancesTab/ChroniquesPage/LegendesModule +
// FamilyDetailSheet, qui affiche le rang par groupe musculaire puis, au
// clic, le détail par exercice via ExerciseRankStrip). Cette route ne rend
// plus rien elle-même : elle ne fait que rediriger, pour qu'un lien ou un
// favori existant vers /progression continue de fonctionner au lieu de
// dupliquer le contenu ou de 404. Même pattern que /trophees.
export const Route = createFileRoute("/_authenticated/progression")({
  beforeLoad: () => {
    throw redirect({ to: "/seances", search: { chroniques: "legendes" } });
  },
});
