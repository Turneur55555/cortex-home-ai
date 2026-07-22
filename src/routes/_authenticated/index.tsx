import { createFileRoute } from "@tanstack/react-router";
import { ProfileRPGData, type ProfileRPGDataValue } from "@/components/profile/rpg/ProfileRPGData";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { RPGProgressionSection } from "@/components/profile/rpg/RPGProgressionSection";
import { ClassCard } from "@/components/profile/ClassCard";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ICORTEX — Accueil" },
      { name: "description", content: "Ton tableau de bord personnel." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-4 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.375rem))]">
      <ProfileRPGData>{(rpg) => <HomeHub rpg={rpg} />}</ProfileRPGData>
    </main>
  );
}

function HomeHub({ rpg }: { rpg: ProfileRPGDataValue }) {
  const { rankAggregate, workouts } = rpg;

  // Ordre hiérarchique validé : Classe principale → Hero Card → Progression RPG.
  // Identité du joueur (avatar + pseudo) : uniquement sur l'écran Profil.
  // Cet ordre raconte : Qui suis-je ? → À quel rang j'appartiens ? → Combien me reste-t-il avant d'évoluer ?
  return (
    <>
      <ClassCard workouts={workouts} rankAggregate={rankAggregate} />

      <ProfileHeroCard />

      <RPGProgressionSection />
    </>
  );
}
