import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { PreferencesEffects } from "@/components/PreferencesEffects";
import { BottomNav } from "@/components/BottomNav";
import { SyncStatusIndicator } from "@/components/shared/SyncStatusIndicator";
import { Loader2 } from "lucide-react";
import { logAuthEvent, summarizeSession } from "@/lib/authDiagnostics";
import { restoreAuthSession } from "@/lib/authSession";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await restoreAuthSession("protected-route:beforeLoad", 1500);
    // SEUL point de l'app qui redirige vers /login sur absence de session
    // (l'autre `navigate("/login")`, dans SecurityPanel, suit une
    // déconnexion explicite). Depuis le chantier 3, `restoreAuthSession` ne
    // renvoie `null` que lorsqu'il n'y a RÉELLEMENT pas de session — plus
    // seulement parce qu'un refresh a échoué faute de réseau (MAJ-07, voir
    // `lib/offlineAuthSession.ts`). Une vraie absence de session et une
    // session réellement invalidée par le serveur continuent donc bien
    // d'atterrir ici.
    if (!session) throw redirect({ to: "/login" });
    logAuthEvent("protected-route:session-ok", { session: summarizeSession(session) });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { loading, user } = useAuth();
  if (loading) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }
  if (!user) return null; // beforeLoad will redirect
  return (
    <PreferencesEffects>
      <AppShell>
        <SyncStatusIndicator />
        <div className="flex flex-1 flex-col pb-2">
          <Outlet />
        </div>
        <BottomNav />
      </AppShell>
    </PreferencesEffects>
  );
}
