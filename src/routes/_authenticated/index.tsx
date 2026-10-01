import { createFileRoute } from "@tanstack/react-router";
import { CorpsShortcutTile } from "@/components/home/CorpsShortcutTile";
import { TodayCard } from "@/components/home/TodayCard";
import { WeekPlanCard } from "@/components/fitness/plan/WeekPlanCard";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { RPGProgressionSection } from "@/components/profile/rpg/RPGProgressionSection";

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
//   Carte du jour → ta semaine → illustration du Titre → progression → Corps.
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
      <div className="mb-4 empty:hidden">
        <WeekPlanCard hideInvitation />
      </div>
      <ProfileHeroCard />
      <RPGProgressionSection />
      <CorpsShortcutTile />
    </main>
  );
}
