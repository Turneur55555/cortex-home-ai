import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Apple, BarChart3, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { useActivityStreak } from "@/hooks/useActivityStreak";
import { buildAchievementCollection } from "@/lib/profile/achievements/collection";
import { ProfileRPGData, type ProfileRPGDataValue } from "@/components/profile/rpg/ProfileRPGData";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { RPGProgressionSection } from "@/components/profile/rpg/RPGProgressionSection";
import { ClassCard } from "@/components/profile/ClassCard";
import { TrophyRoomPreview } from "@/components/profile/rpg/TrophyRoomPreview";
import { QuestsPreview } from "@/components/profile/rpg/QuestsPreview";
import { BodyStatusCard } from "@/components/profile/BodyStatusCard";
import { DocumentsSummaryCard } from "@/components/profile/DocumentsSummaryCard";
import { PersonalizationPanel } from "@/components/profile/PersonalizationPanel";
import { SecurityPanel } from "@/components/profile/SecurityPanel";
import { HealthDataPanel } from "@/components/profile/HealthDataPanel";
import { SettingsGroup } from "@/components/profile/SettingsGroup";
import { EditPseudoSheet } from "@/components/profile/EditPseudoSheet";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [
      { title: "Profil — ICORTEX" },
      { name: "description", content: "Le tableau de bord de ta progression." },
    ],
  }),
  component: ProfilPage,
});

function ProfilPage() {
  const { user } = useAuth();
  const fallback = useMemo(() => user?.email?.split("@")[0] ?? "Utilisateur", [user?.email]);
  const { pseudo, avatarUrl, updatePseudo, updateAvatar } = useProfile(fallback);
  const { current: streak } = useActivityStreak();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <ProfileRPGData>
        {(rpg) => (
          <ProfilHub
            rpg={rpg}
            pseudo={pseudo}
            streak={streak}
            avatarUrl={avatarUrl}
            onEdit={() => setEditOpen(true)}
            onAvatarChange={updateAvatar}
          />
        )}
      </ProfileRPGData>

      {/* État du corps — sobre, sans habillage RPG (décision actée) */}
      <BodyStatusCard />

      {/* Documents — carte de résumé renvoyant vers /documents */}
      <DocumentsSummaryCard />

      {/* Mes espaces */}
      <Section title="Mes espaces">
        <div className="grid grid-cols-2 gap-2">
          <SpaceLink
            to="/preferences-alimentaires"
            icon={<Apple className="h-4 w-4" />}
            label="Préférences alim."
          />
          <SpaceLink
            to="/rapports"
            icon={<BarChart3 className="h-4 w-4" />}
            label="Rapports hebdo"
          />
        </div>
      </Section>

      {/* Paramètres — secondaires, tout en bas : l'attention va à la progression */}
      <Section title="Paramètres">
        <SettingsGroup title="Personnalisation">
          <PersonalizationPanel />
        </SettingsGroup>
        <SettingsGroup title="Compte & sécurité">
          <SecurityPanel />
        </SettingsGroup>
        <SettingsGroup title="Données">
          <HealthDataPanel />
        </SettingsGroup>
      </Section>

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
 * Hub RPG du Profil : Hero (qui suis-je) → Progression RPG (où en suis-je)
 * → Classe principale (quel combattant suis-je) → Salle des trophées et
 * Quêtes en aperçu (qu'ai-je accompli / que dois-je faire ensuite). Chaque
 * bloc ouvre son écran dédié — le Profil ne réaffiche plus jamais une copie
 * complète d'un module.
 */
function ProfilHub({
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
        streak={streak}
        avatarUrl={avatarUrl}
        onEdit={onEdit}
        onAvatarChange={onAvatarChange}
        rankAggregate={rankAggregate}
        totalWorkouts={totalWorkouts}
        achievementsUnlocked={collection.unlockedCount}
        achievementsTotal={collection.total}
      />

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

      <QuestsPreview />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SpaceLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-2 rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 px-3 py-3 shadow-card backdrop-blur-xl transition-colors hover:border-primary/40"
    >
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        <span className="text-xs font-semibold">{label}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
