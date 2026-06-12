import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { GlobalReminderNotifier } from "@/components/reminders/GlobalReminderNotifier";
import { Loader2 } from "lucide-react";
import { logAuthEvent, summarizeSession } from "@/lib/authDiagnostics";
import { restoreAuthSession } from "@/lib/authSession";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await restoreAuthSession("protected-route:beforeLoad", 1500);
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
    <AppShell showBell>
      <GlobalReminderNotifier />
      <div className="flex flex-1 flex-col pb-2">
        <Outlet />
      </div>
      <BottomNav />
    </AppShell>
  );
}
