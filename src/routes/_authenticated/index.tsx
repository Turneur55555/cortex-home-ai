import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { ProfileRPGData, type ProfileRPGDataValue } from "@/components/profile/rpg/ProfileRPGData";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { ProfileIdentityStrip } from "@/components/profile/ProfileIdentityStrip";
import { RPGProgressionSection } from "@/components/profile/rpg/RPGProgressionSection";
import { ClassCard } from "@/components/profile/ClassCard";
import { EditPseudoSheet } from "@/components/profile/EditPseudoSheet";

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
  const { user } = useAuth();
  const fallback = useMemo(() => user?.email?.split("@")[0] ?? "Utilisateur", [user?.email]);
  const { pseudo, avatarUrl, updatePseudo, updateAvatar } = useProfile(fallback);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-[max(2.75rem,calc(env(safe-area-inset-top)+0.75rem))]">
      <ProfileRPGData>
        {(rpg) => (
          <HomeHub
            rpg={rpg}
            pseudo={pseudo}
            avatarUrl={avatarUrl}
            onEdit={() => setEditOpen(true)}
            onAvatarChange={updateAvatar}
          />
        )}
      </ProfileRPGData>

      <EditPseudoSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        current={pseudo}
        onSave={async (v) => {
          await updatePseudo(v);
          toast.success("Pseudo mis à jour");
        }}
      />
    </main>
  );
}

function HomeHub({
  rpg,
  pseudo,
  avatarUrl,
  onEdit,
  onAvatarChange,
}: {
  rpg: ProfileRPGDataValue;
  pseudo: string;
  avatarUrl?: string | null;
  onEdit: () => void;
  onAvatarChange: (url: string) => Promise<void>;
}) {
  const { rankAggregate, workouts } = rpg;

  // Accueil simplifié (Phase 1) : Hero → Progression RPG → Classe principale.
  // Saisons et Salle des trophées ont été retirées de l'accueil (elles restent
  // disponibles ailleurs). Les Quêtes ne figuraient pas sur l'accueil.
  return (
    <>
      <ProfileIdentityStrip
        pseudo={pseudo}
        avatarUrl={avatarUrl}
        onEdit={onEdit}
        onAvatarChange={onAvatarChange}
      />
      <ProfileHeroCard />

      <RPGProgressionSection />

      <ClassCard workouts={workouts} rankAggregate={rankAggregate} />
    </>
  );
}
