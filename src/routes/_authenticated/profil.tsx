import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Apple, BarChart3, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { useActivityStreak } from "@/hooks/useActivityStreak";
import { useUserStats } from "@/hooks/useUserStats";
import { useWorkouts } from "@/hooks/use-fitness";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { useBadgeHighlights } from "@/hooks/useBadgeHighlights";
import { useGoalsWithProgress } from "@/hooks/useGoalsWithProgress";
import { RankAggregator } from "@/components/fitness/RankAggregator";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { AccomplishmentsPanel } from "@/components/profile/AccomplishmentsPanel";
import { GoalsManager } from "@/components/profile/GoalsManager";
import { BadgesStrip } from "@/components/profile/BadgesStrip";
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
  const { data: stats } = useUserStats();
  const [editOpen, setEditOpen] = useState(false);

  // Élevés au niveau de la page pour être partagés entre le Hero et les
  // Accomplissements — aucun nouveau calcul métier, uniquement des hooks/dérivations existants.
  const { data: workouts } = useWorkouts();
  const { topExercises } = useMemo(() => computePRs(workouts ?? []), [workouts]);
  const badgeHighlights = useBadgeHighlights();
  const { goals } = useGoalsWithProgress();
  const questsDone = useMemo(() => goals.filter((g) => g.is_completed).length, [goals]);
  const questsTotal = goals.length;

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <RankAggregator exerciseNames={topExercises}>
        {(rankAggregate) => (
          <>
            {/* Identité — pièce maîtresse de l'écran, fiche de personnage */}
            <ProfileHeroCard
              pseudo={pseudo}
              streak={streak}
              level={stats?.level ?? 1}
              xp={stats?.xp ?? 0}
              avatarUrl={avatarUrl}
              onEdit={() => setEditOpen(true)}
              onAvatarChange={updateAvatar}
              rankAggregate={rankAggregate}
              badgesUnlocked={badgeHighlights.unlockedCount}
              badgesTotal={badgeHighlights.total}
              questsDone={questsDone}
              questsTotal={questsTotal}
            />

            {/* Accomplissements — meilleur rang, rang moyen, exercice principal,
                records récents, prochaine grande récompense, succès le plus rare */}
            <AccomplishmentsPanel rankAggregate={rankAggregate} badgeHighlights={badgeHighlights} />
          </>
        )}
      </RankAggregator>

      {/* Salle des trophées — le cœur du module, véritable espace de collection */}
      <BadgesStrip />

      {/* Quêtes */}
      <GoalsManager />

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

      {/* Documents — carte de résumé renvoyant vers /documents (expérience complète, avec Transfer) */}
      <DocumentsSummaryCard />

      {/* Paramètres — un seul conteneur, 3 sous-groupes */}
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

function SpaceLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
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
