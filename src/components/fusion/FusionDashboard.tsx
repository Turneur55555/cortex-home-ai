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

// ─── Types ───────────────────────────────────────────────────────────────────

interface FusionDashboardProps {
  name: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — Accueil displays Profil's first 3 cards
// Moved from profil.tsx: Hero, Progression RPG, Classe
// ═════════════════════════════════════════════════════════════════════════════

export function FusionDashboard({ name }: FusionDashboardProps) {
  const { user } = useAuth();
  const fallback = useMemo(() => user?.email?.split("@")[0] ?? "Utilisateur", [user?.email]);
  const { pseudo, avatarUrl, updatePseudo, updateAvatar } = useProfile(fallback);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-[max(2.75rem,calc(env(safe-area-inset-top)+0.75rem))]">
      <ProfileRPGData>
        {(rpg) => (
          <DashboardHub
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

/**
 * Hub Accueil — les 3 premières cartes du Profil (déplacées).
 * Aucune modification de design, logique ou animations.
 * Note: TrophyRoomPreview reste sur Profil comme première carte.
 */
function DashboardHub({
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

  return (
    <>
      <ProfileIdentityStrip
        pseudo={pseudo}
        avatarUrl={avatarUrl}
        onEdit={onEdit}
        onAvatarChange={onAvatarChange}
      />
      <ProfileHeroCard rankAggregate={rankAggregate} />

      <RPGProgressionSection rankAggregate={rankAggregate} />

      <ClassCard workouts={workouts} rankAggregate={rankAggregate} />
    </>
  );
}
