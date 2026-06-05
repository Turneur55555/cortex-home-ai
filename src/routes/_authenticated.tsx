import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { GlobalReminderNotifier } from "@/components/reminders/GlobalReminderNotifier";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    // getSession() auto-refresh le token via le refresh token si l'access token a expiré,
    // évitant la race condition où getUser() rejette un token valide-mais-expiré.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
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
    <AppShell showBell>
      <GlobalReminderNotifier />
      <div className="flex flex-1 flex-col pb-2">
        <Outlet />
      </div>
      <BottomNav />
    </AppShell>
  );
}
