import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, Apple, ChevronRight, BarChart3 } from "lucide-react";
import { ProfileCompletionCard } from "@/components/profile/ProfileCompletionCard";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { useStreak } from "@/hooks/useStreak";
import { useUserStats } from "@/hooks/useUserStats";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { GoalsManager } from "@/components/profile/GoalsManager";
import { BadgesStrip } from "@/components/profile/BadgesStrip";
import { ActivityTimeline } from "@/components/profile/ActivityTimeline";
import { BodyMeasurementsHistory } from "@/components/profile/BodyMeasurementsHistory";
import { PersonalizationPanel } from "@/components/profile/PersonalizationPanel";
import { PdfPanel } from "@/components/profile/PdfPanel";
import { SecurityPanel } from "@/components/profile/SecurityPanel";
import { HealthDataPanel } from "@/components/profile/HealthDataPanel";
import { EditPseudoSheet } from "@/components/profile/EditPseudoSheet";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [
      { title: "Profil — ICORTEX" },
      { name: "description", content: "Votre compte, progression, espaces et préférences." },
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
    try {
      return localStorage.getItem(AVATAR_KEY);
    } catch {
      return null;
    }
  });

  const onAvatarChange = (url: string) => {
    setAvatarUrl(url);
    try {
      localStorage.setItem(AVATAR_KEY, url);
    } catch {
      /* ignore */
    }
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

      {/* Profil complété */}
      <Section title="Progression du profil">
        <ProfileCompletionCard
          hasAvatar={!!avatarUrl}
          hasCustomPseudo={pseudo !== fallback}
        />
      </Section>

      {/* Objectifs fitness */}
      <Section title="Objectifs fitness">
        <GoalsManager />
      </Section>

      {/* Badges & succès */}
      <Section title="Badges & succès">
        <BadgesStrip />
      </Section>

      {/* Mes espaces */}
      <Section title="Mes espaces">
        <div className="grid grid-cols-2 gap-2">
          <SpaceLink to="/documents" icon={<FileText className="h-4 w-4" />} label="Documents" />
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

      {/* Habitudes & activité */}
      <Section title="Habitudes & activité">
        <ActivityTimeline />
        <BodyMeasurementsHistory />
      </Section>

      {/* Paramètres & notifications */}
      <Section title="Paramètres & notifications">
        <PersonalizationPanel />
      </Section>

      {/* Données personnelles */}
      <Section title="Données personnelles">
        <PdfPanel />
        <div className="mt-4">
          <SecurityPanel />
        </div>
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
