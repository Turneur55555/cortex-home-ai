import { createFileRoute } from "@tanstack/react-router";
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

// Accueil épuré : uniquement Hero Card → Progression RPG. La Classe
// principale a déménagé en tête du Livre des Chroniques (LivreChroniquesPage),
// l'identité du joueur (avatar + pseudo) reste sur l'écran Profil uniquement.
// Ni l'une ni l'autre carte restante n'a besoin de ProfileRPGData (chacune
// lit ses propres données via ses hooks internes), d'où sa suppression ici.
function HomePage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-4 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.375rem))]">
      <ProfileHeroCard />
      <RPGProgressionSection />
    </main>
  );
}
