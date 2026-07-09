import { createFileRoute, Link } from "@tanstack/react-router";
import { Apple, BarChart3, ChevronRight } from "lucide-react";
import { ProfileRPGData } from "@/components/profile/rpg/ProfileRPGData";
import { QuestsPreview } from "@/components/profile/rpg/QuestsPreview";
import { BodyStatusCard } from "@/components/profile/BodyStatusCard";
import { DisciplineBreakdownCard } from "@/components/profile/DisciplineBreakdownCard";
import { DocumentsSummaryCard } from "@/components/profile/DocumentsSummaryCard";
import { PersonalizationPanel } from "@/components/profile/PersonalizationPanel";
import { SecurityPanel } from "@/components/profile/SecurityPanel";
import { HealthDataPanel } from "@/components/profile/HealthDataPanel";
import { SettingsGroup } from "@/components/profile/SettingsGroup";

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
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <ProfileRPGData>
        {(rpg) => (
          <QuestsPreview />
        )}
      </ProfileRPGData>

      <BodyStatusCard />

      <DisciplineBreakdownCard />

      <DocumentsSummaryCard />

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