import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { useStreak } from "@/hooks/useStreak";
import { useUserStats } from "@/hooks/useUserStats";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProgressionCard } from "@/components/profile/ProgressionCard";
import { GoalsManager } from "@/components/profile/GoalsManager";
import { BadgesStrip } from "@/components/profile/BadgesStrip";
import { ActivityTimeline } from "@/components/profile/ActivityTimeline";
import { PersonalizationPanel } from "@/components/profile/PersonalizationPanel";
import { SecurityPanel } from "@/components/profile/SecurityPanel";
import { EditPseudoSheet } from "@/components/profile/EditPseudoSheet";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [
      { title: "Profil — ICORTEX" },
      { name: "description", content: "Votre compte, progression et préférences." },
    ],
  }),
  component: ProfilPage,
});

const AVATAR_KEY = "icortex.avatar_url";

function ProfilPage() {
  const { user } = useAuth();
  const fallback = useMemo(() => user?.email?.split("@")[0] ?? "Utilisateur", [user?.email]);
  const { pseudo, updatePseudo } = useProfile(fallback);
  const { current: streak } = useStreak();
  const { data: stats } = useUserStats();
  const [editOpen, setEditOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(AVATAR_KEY); } catch { return null; }
  });

  const onAvatarChange = (url: string) => {
    setAvatarUrl(url);
    try { localStorage.setItem(AVATAR_KEY, url); } catch { /* ignore */ }
  };

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <ProfileHeader
        pseudo={pseudo}
        email={user?.email ?? undefined}
        streak={streak}
        level={stats?.level ?? 1}
        avatarUrl={avatarUrl}
        onEdit={() => setEditOpen(true)}
        onAvatarChange={onAvatarChange}
      />

      <ProgressionCard />
      <GoalsManager />
      <BadgesStrip />
      <ActivityTimeline />
      <PersonalizationPanel />
      <SecurityPanel />

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
