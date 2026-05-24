import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

type FieldErrors = { email?: string; password?: string; confirmPassword?: string };

function validateFields(
  email: string,
  password: string,
  confirmPassword: string,
  mode: "login" | "signup",
): FieldErrors {
  const errs: FieldErrors = {};
  if (!email.trim()) {
    errs.email = "Email requis";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errs.email = "Email invalide";
  }
  if (!password) {
    errs.password = "Mot de passe requis";
  } else if (password.length < 8) {
    errs.password = "8 caractères minimum";
  }
  if (mode === "signup") {
    if (!confirmPassword) {
      errs.confirmPassword = "Confirmation requise";
    } else if (confirmPassword !== password) {
      errs.confirmPassword = "Les mots de passe ne correspondent pas";
    }
  }
  return errs;
}

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const switchMode = (newMode: "login" | "signup") => {
    setMode(newMode);
    setErrors({});
    setConfirmPassword("");
  };

  const clearError = (field: keyof FieldErrors) => {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateFields(email, password, confirmPassword, mode);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Compte créé ! Vérifiez votre email pour confirmer votre inscription.");
        } else {
          toast.success("Compte créé. Bienvenue !");
          navigate({ to: "/" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch {
      toast.error(
        mode === "signup"
          ? "Si cet email n'est pas déjà utilisé, votre compte a été créé. Vérifiez votre messagerie."
          : "Identifiants incorrects",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrors((prev) => ({ ...prev, email: "Entrez votre email pour recevoir le lien" }));
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Email de réinitialisation envoyé. Vérifiez votre messagerie.");
    } catch {
      toast.error("Impossible d'envoyer l'email de réinitialisation.");
    } finally {
      setForgotLoading(false);
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

        {/* Onglets Connexion / Inscription */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-full border border-border bg-surface p-1">
          <button
            type="button"
            data-testid="auth-tab-login"
            onClick={() => switchMode("login")}
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
            onClick={() => switchMode("signup")}
            className={
              mode === "signup"
                ? "rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground shadow-glow"
                : "rounded-full py-2 text-sm font-medium text-muted-foreground"
            }
          >
            Inscription
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Email */}
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              data-testid="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
              className={`h-12 rounded-xl bg-surface${errors.email ? " border-destructive focus-visible:ring-destructive" : ""}`}
              placeholder="vous@exemple.com"
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          {/* Mot de passe */}
          <div className="space-y-1">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              data-testid="auth-password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
              className={`h-12 rounded-xl bg-surface${errors.password ? " border-destructive focus-visible:ring-destructive" : ""}`}
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
            {mode === "login" && (
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={forgotLoading}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {forgotLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  Mot de passe oublié ?
                </button>
              </div>
            )}
          </div>

          {/* Confirmer le mot de passe (inscription uniquement) */}
          {mode === "signup" && (
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                data-testid="auth-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); clearError("confirmPassword"); }}
                className={`h-12 rounded-xl bg-surface${errors.confirmPassword ? " border-destructive focus-visible:ring-destructive" : ""}`}
                placeholder="••••••••"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword}</p>
              )}
            </div>
          )}

          <Button
            type="submit"
            data-testid="auth-submit"
            disabled={loading}
            className="h-12 w-full rounded-full bg-gradient-primary text-base font-semibold shadow-glow hover:opacity-95"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : mode === "login" ? (
              "Se connecter"
            ) : (
              "Créer mon compte"
            )}
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
