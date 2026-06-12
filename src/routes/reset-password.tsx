import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent, summarizeSession } from "@/lib/authDiagnostics";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Réinitialisation — ICORTEX" },
      { name: "description", content: "Choisissez un nouveau mot de passe ICORTEX." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      logAuthEvent(`reset-password:${event}`, { session: summarizeSession(session) });
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) logAuthEvent("reset-password:get-session-error", { error });
      setReady(Boolean(data.session));
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("8 caractères minimum");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      logAuthEvent("reset-password:update-error", { error });
      toast.error("Impossible de modifier le mot de passe");
      return;
    }
    logAuthEvent("reset-password:update-success", { userId: data.user?.id ?? null });
    toast.success("Mot de passe mis à jour");
    navigate({ to: "/" });
  };

  return (
    <AppShell>
      <main className="flex flex-1 flex-col px-6 pb-10 pt-16">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <span className="text-2xl font-bold text-primary-foreground">⬡</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Nouveau mot de passe</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sécurisez votre compte ICORTEX.</p>
        </div>

        {!ready ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl bg-surface"
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Confirmer</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-12 rounded-xl bg-surface"
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-12 w-full rounded-full bg-gradient-primary text-base font-semibold shadow-glow hover:opacity-95">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enregistrer"}
            </Button>
          </form>
        )}
      </main>
    </AppShell>
  );
}