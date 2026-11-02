import { createFileRoute } from "@tanstack/react-router";
import { CorpsShortcutTile } from "@/components/home/CorpsShortcutTile";
import { TodayCard } from "@/components/home/TodayCard";
import { TodayOutfitTile } from "@/components/home/TodayOutfitTile";
import { WeekReportTeaser } from "@/components/week/WeekReportTeaser";
import { WeekPlanCard } from "@/components/fitness/plan/WeekPlanCard";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ICORTEX — Accueil" },
      { name: "description", content: "Ton tableau de bord personnel." },
    ],
  }),
  component: HomePage,
});

// Accueil : l'ACTION D'ABORD (décision de Nathan, 30/09/2026), puis le Rang.
//   Carte du jour → (bandeau « Ta semaine est prête », lundi et mardi) → fiche de personnage →
//   ta semaine → Corps → Tenue du jour (Dressing, invisible si vide).
// La fiche de personnage (01/11/2026) fond l'illustration du Titre et la carte de progression
// en un seul objet, placé JUSTE sous la Carte du jour pour être vu sans défiler : avant, la
// barre « Plus que X XP avant … » tombait sous la ligne de flottaison d'un iPhone.
// La Carte du jour dit quoi faire aujourd'hui, uniquement par des faits (voir
// lib/fitness/todayCard.ts) ; la semaine n'apparaît que si un plan existe (sans
// plan, c'est la Carte du jour qui invite à en créer un).
//
// La Classe principale a déménagé en tête du Livre des Chroniques
// (LivreChroniquesPage), l'identité du joueur (avatar + pseudo) reste sur
// l'écran Profil uniquement. Aucune des cartes ci-dessous n'a besoin de
// ProfileRPGData (chacune lit ses propres données via ses hooks internes).
function HomePage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-4 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.375rem))]">
      <TodayCard />
      <WeekReportTeaser />
      <ProfileHeroCard />
      <div className="empty:hidden">
        <WeekPlanCard hideInvitation />
      </div>
      <CorpsShortcutTile />
      <TodayOutfitTile />
    </main>
  );
}
