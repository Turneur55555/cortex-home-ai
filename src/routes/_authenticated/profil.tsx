import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Apple, BarChart3, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { useActivityStreak } from "@/hooks/useActivityStreak";
import { useUserStats } from "@/hooks/useUserStats";
import { useWorkouts } from "@/hooks/use-fitness";
import { useBadgeSystem } from "@/hooks/useBadgeSystem";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { computeBroadActivity } from "@/lib/profile/achievements/muscleVolume";
import { useAchievements } from "@/hooks/useAchievements";
import { RankAggregator, type RankAggregate } from "@/components/fitness/RankAggregator";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { RPGProgressionSection } from "@/components/profile/rpg/RPGProgressionSection";
import { BodyStatusCard } from "@/components/profile/BodyStatusCard";
import { DocumentsSummaryCard } from "@/components/profile/DocumentsSummaryCard";
import { PersonalizationPanel } from "@/components/profile/PersonalizationPanel";
import { SecurityPanel } from "@/components/profile/SecurityPanel";
import { HealthDataPanel } from "@/components/profile/HealthDataPanel";
import { SettingsGroup } from "@/components/profile/SettingsGroup";
import { EditPseudoSheet } from "@/components/profile/EditPseudoSheet";
import type { BadgeRarity } from "@/lib/fitness/badges";
import type { BadgeSystemSnapshot } from "@/hooks/useAchievements";

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
  const { data: stats } = useUserStats();
  const [editOpen, setEditOpen] = useState(false);

  // Élevés au niveau de la page pour être partagés entre le Hero et la
  // Progression RPG — aucun nouveau calcul métier, uniquement des
  // hooks/dérivations existants (computePRs, useBadgeSystem, RankAggregator).
  const { data: workouts } = useWorkouts();
  const { prByName, histByName, volByName, nameByKey, topExercises } = useMemo(
    () => computePRs(workouts ?? []),
    [workouts],
  );
  const badgeSystem = useBadgeSystem();

  const workoutsSample = useMemo(
    () =>
      (workouts ?? []).map((w) => ({
        date: w.date,
        exercises: (w.exercises ?? []).map((ex) => ({
          name: ex.name,
          weight: ex.weight,
          sets: ex.sets,
          reps: ex.reps,
        })),
      })),
    [workouts],
  );

  // Liste élargie (jusqu'à 8 exercices) pour une Progression RPG qui reflète
  // vraiment "toutes les données existantes", pas seulement le top 3 utilisé
  // historiquement pour les highlights de la fiche.
  const broadExerciseKeys = useMemo(
    () => computeBroadActivity(workoutsSample, 8).broadExercises,
    [workoutsSample],
  );
  const probeExerciseNames = broadExerciseKeys.length > 0 ? broadExerciseKeys : topExercises;

  const bestPR = useMemo(() => {
    let bestKey: string | null = null;
    let bestWeight = 0;
    for (const [key, weight] of prByName) {
      if (weight > bestWeight) {
        bestWeight = weight;
        bestKey = key;
      }
    }
    if (!bestKey) return null;
    return { name: nameByKey.get(bestKey) ?? bestKey, weight: bestWeight };
  }, [prByName, nameByKey]);

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <RankAggregator exerciseNames={probeExerciseNames}>
        {(rankAggregate) => (
          <ProfilRPGBlock
            rankAggregate={rankAggregate}
            badgeSystem={badgeSystem}
            pseudo={pseudo}
            streak={streak}
            level={stats?.level ?? 1}
            xp={stats?.xp ?? 0}
            avatarUrl={avatarUrl}
            onEdit={() => setEditOpen(true)}
            onAvatarChange={updateAvatar}
            bestPR={bestPR}
            topExercises={topExercises}
            nameByKey={nameByKey}
            histByName={histByName}
            volByName={volByName}
            prByName={prByName}
            workouts={workoutsSample}
          />
        )}
      </RankAggregator>

      {/* État du corps — sobre, sans habillage RPG (décision actée) */}
      <BodyStatusCard />

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

      {/* Documents — carte de résumé renvoyant vers /documents */}
      <DocumentsSummaryCard />

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
 * Rendu comme un vrai composant (et non comme un simple callback) : les
 * hooks appelés à l'intérieur (via useAchievements) doivent être attribués à
 * SON propre rendu React, pas à celui de <RankAggregator>. Appeler des hooks
 * directement dans la fonction "children" d'un render-prop casserait les
 * règles des hooks — passer par un composant dédié est la façon correcte de
 * consommer `rankAggregate` tout en calculant les succès.
 */
function ProfilRPGBlock({
  rankAggregate,
  badgeSystem,
  pseudo,
  streak,
  level,
  xp,
  avatarUrl,
  onEdit,
  onAvatarChange,
  bestPR,
  topExercises,
  nameByKey,
  histByName,
  volByName,
  prByName,
  workouts,
}: {
  rankAggregate: RankAggregate;
  badgeSystem: BadgeSystemSnapshot;
  pseudo: string;
  streak: number;
  level: number;
  xp: number;
  avatarUrl?: string | null;
  onEdit: () => void;
  onAvatarChange: (url: string) => Promise<void>;
  bestPR: { name: string; weight: number } | null;
  topExercises: string[];
  nameByKey: Map<string, string>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
  workouts: Array<{
    date: string;
    exercises: Array<{
      name: string;
      weight: number | null;
      sets: number | null;
      reps: number | null;
    }>;
  }>;
}) {
  const achievements = useAchievements(rankAggregate, badgeSystem);
  const rarest = achievements.rarestUnlocked
    ? {
        title: achievements.rarestUnlocked.def.title,
        rarity: achievements.rarestUnlocked.def.rarity as BadgeRarity,
      }
    : null;

  return (
    <>
      {/* Hero — pièce maîtresse de l'écran, fiche de personnage */}
      <ProfileHeroCard
        pseudo={pseudo}
        streak={streak}
        level={level}
        xp={xp}
        avatarUrl={avatarUrl}
        onEdit={onEdit}
        onAvatarChange={onAvatarChange}
        rankAggregate={rankAggregate}
        totalWorkouts={badgeSystem.stats.workouts_count}
        bestPR={bestPR}
        rarestAchievement={rarest}
      />

      {/* Progression RPG — cœur du Profil : rang, records, Salle des
          trophées (badges + nouveaux succès fusionnés) et Quêtes. */}
      <RPGProgressionSection
        rankAggregate={rankAggregate}
        achievements={achievements}
        legacyBadges={badgeSystem.badgesWithProgress}
        topExercises={topExercises}
        nameByKey={nameByKey}
        histByName={histByName}
        volByName={volByName}
        prByName={prByName}
        workouts={workouts}
      />
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
