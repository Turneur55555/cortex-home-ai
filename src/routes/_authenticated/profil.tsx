import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Apple,
  BookOpen,
  Database,
  FileText,
  Shirt,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { ProfileIdentityStrip } from "@/components/profile/ProfileIdentityStrip";
import { EditPseudoSheet } from "@/components/profile/EditPseudoSheet";
import { BodyStatusCard } from "@/components/profile/BodyStatusCard";
import { PersonalizationPanel } from "@/components/profile/PersonalizationPanel";
import { SecurityPanel } from "@/components/profile/SecurityPanel";
import { HealthDataPanel } from "@/components/profile/HealthDataPanel";
import { SettingsSheetTile } from "@/components/profile/SettingsSheetTile";
import { SpaceLink } from "@/components/profile/SpaceTile";
import { SyncStatusCard } from "@/components/profile/SyncStatusCard";

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
  const [editOpen, setEditOpen] = useState(false);

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-5 pb-32 pt-[max(2.5rem,calc(env(safe-area-inset-top)+0.5rem))]">
      <ProfileIdentityStrip
        pseudo={pseudo}
        avatarUrl={avatarUrl}
        onEdit={() => setEditOpen(true)}
        onAvatarChange={updateAvatar}
      />

      <EditPseudoSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        current={pseudo}
        onSave={async (v) => {
          await updatePseudo(v);
          toast.success("Pseudo mis à jour");
        }}
      />

      <BodyStatusCard />

      <Section title="Mes espaces">
        <div className="grid grid-cols-2 gap-2">
          <SpaceLink
            to="/preferences-alimentaires"
            icon={<Apple className="h-4 w-4" />}
            label="Préférences alim."
          />
          <SpaceLink to="/dressing" icon={<Shirt className="h-4 w-4" />} label="Dressing" />
          <SpaceLink to="/documents" icon={<FileText className="h-4 w-4" />} label="Documents" />
          <SpaceLink to="/livres" icon={<BookOpen className="h-4 w-4" />} label="Bibliothèque" />
        </div>
      </Section>

      <Section title="Mes paramètres">
        <div className="grid grid-cols-2 gap-2">
          <SettingsSheetTile
            icon={<SlidersHorizontal className="h-4 w-4" />}
            label="Personnalisation"
          >
            <PersonalizationPanel />
          </SettingsSheetTile>
          <SettingsSheetTile icon={<ShieldCheck className="h-4 w-4" />} label="Compte & sécurité">
            <SecurityPanel />
          </SettingsSheetTile>
          <SettingsSheetTile icon={<Database className="h-4 w-4" />} label="Données">
            <HealthDataPanel />
          </SettingsSheetTile>
          <SyncStatusCard />
        </div>
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
