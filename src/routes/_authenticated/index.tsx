import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { useActivityStreak } from "@/hooks/useActivityStreak";
import { buildAchievementCollection } from "@/lib/profile/achievements/collection";
import { ProfileRPGData, type ProfileRPGDataValue } from "@/components/profile/rpg/ProfileRPGData";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { HeroStatsStrip } from "@/components/profile/HeroStatsStrip";
import { SeasonTrackCard } from "@/components/profile/rpg/SeasonTrackCard";
import { RPGProgressionSection } from "@/components/profile/rpg/RPGProgressionSection";
import { ClassCard } from "@/components/profile/ClassCard";
import { TrophyRoomPreview } from "@/components/profile/rpg/TrophyRoomPreview";
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
  const { current: streak } = useActivityStreak();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-[max(2.75rem,calc(env(safe-area-inset-top)+0.75rem))]">
      <ProfileRPGData>
        {(rpg) => (
          <HomeHub
            rpg={rpg}
            pseudo={pseudo}
            streak={streak}
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
  streak,
  avatarUrl,
  onEdit,
  onAvatarChange,
}: {
  rpg: ProfileRPGDataValue;
  pseudo: string;
  streak: number;
  avatarUrl?: string | null;
  onEdit: () => void;
  onAvatarChange: (url: string) => Promise<void>;
}) {
  const {
    rankAggregate,
    achievements,
    legacyBadges,
    topExercises,
    nameByKey,
    histByName,
    volByName,
    prByName,
    workouts,
    totalWorkouts,
  } = rpg;

  const collection = useMemo(
    () => buildAchievementCollection(achievements, legacyBadges),
    [achievements, legacyBadges],
  );

  return (
    <>
      <ProfileHeroCard
        pseudo={pseudo}
        avatarUrl={avatarUrl}
        onEdit={onEdit}
        onAvatarChange={onAvatarChange}
        rankAggregate={rankAggregate}
      />

      <HeroStatsStrip
        streak={streak}
        totalWorkouts={totalWorkouts}
        achievementsUnlocked={collection.unlockedCount}
        achievementsTotal={collection.total}
      />

      <SeasonTrackCard />

      <RPGProgressionSection
        rankAggregate={rankAggregate}
        achievements={achievements}
        topExercises={topExercises}
        nameByKey={nameByKey}
        histByName={histByName}
        volByName={volByName}
        prByName={prByName}
      />

      <ClassCard workouts={workouts} rankAggregate={rankAggregate} />

      <TrophyRoomPreview achievements={achievements} legacyBadges={legacyBadges} />
    </>
  );
}
