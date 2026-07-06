import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { ProfileRPGData } from "@/components/profile/rpg/ProfileRPGData";
import { TrophyRoom } from "@/components/profile/rpg/TrophyRoom";

export const Route = createFileRoute("/_authenticated/trophees")({
  head: () => ({
    meta: [
      { title: "Salle des trophées — ICORTEX" },
      { name: "description", content: "Toute ta collection de succès et de badges." },
    ],
  }),
  component: TropheesPage,
});

function TropheesPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-5">
        <Link
          to="/profil"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Profil
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Salle des trophées</h1>
      </header>

      <ProfileRPGData>
        {({ achievements, legacyBadges }) => (
          <TrophyRoom
            achievements={achievements}
            legacyBadges={legacyBadges}
            isLoading={achievements.isLoading}
          />
        )}
      </ProfileRPGData>
    </main>
  );
}
