import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Connexion — ICORTEX" },
      { name: "description", content: "Connectez-vous à votre maison intelligente ICORTEX." },
    ],
  }),
  beforeLoad: async () => {
    // Vérification JWT côté serveur (pas seulement le cache localStorage).
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

const credSchema = z.object({
  email: z.string().email("Email invalide").max(255),
  password: z.string().min(8, "8 caractères minimum").max(128),
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = credSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Données invalides");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Compte créé. Bienvenue !");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        toast.success("Connecté");
        navigate({ to: "/" });
      }
    } catch (err) {
      // Message générique uniforme pour éviter l'énumération de comptes / fuite d'erreurs internes.
      console.error("[auth]", err);
      toast.error(
        mode === "signup"
          ? "Impossible de créer le compte. Vérifiez vos informations ou réessayez plus tard."
          : "Identifiants incorrects ou erreur de connexion.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setOauthLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Échec de la connexion Google");
        setOauthLoading(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/" });
    } catch {
      toast.error("Erreur Google");
      setOauthLoading(false);
    }
  };

  return (
    <AppShell>
      <main className="flex flex-1 flex-col px-6 pb-10 pt-16">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <span className="text-2xl font-bold text-primary-foreground">⬡</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">ICORTEX</h1>
          <p className="mt-2 text-sm text-muted-foreground">Votre maison, plus intelligente.</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-full border border-border bg-surface p-1">
          <button
            type="button"
            data-testid="auth-tab-login"
            onClick={() => setMode("login")}
            className={
              mode === "login"
                ? "rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground shadow-glow"
                : "rounded-full py-2 text-sm font-medium text-muted-foreground"
            }
          >
            Connexion
          </button>
          <button
            type="button"
            data-testid="auth-tab-signup"
            onClick={() => setMode("signup")}
            className={
              mode === "signup"
                ? "rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground shadow-glow"
                : "rounded-full py-2 text-sm font-medium text-muted-foreground"
            }
          >
            Inscription
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl bg-surface"
              placeholder="vous@exemple.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl bg-surface"
              placeholder="••••••••"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-full bg-gradient-primary text-base font-semibold shadow-glow hover:opacity-95"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">ou</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogle}
          disabled={oauthLoading}
          className="h-12 w-full rounded-full border-border bg-surface text-base font-medium hover:bg-surface-elevated"
        >
          {oauthLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuer avec Google
            </>
          )}
        </Button>
      </main>
    </AppShell>
  );
}
