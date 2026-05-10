import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, LogOut, Mail, Shield, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [
      { title: "Profil — ICORTEX" },
      { name: "description", content: "Votre compte ICORTEX." },
    ],
  }),
  component: ProfilPage,
});

function ProfilPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Déconnecté");
    navigate({ to: "/login" });
  };

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-primary shadow-glow">
          <span className="text-3xl font-bold text-primary-foreground">
            {user?.email?.[0]?.toUpperCase() ?? "?"}
          </span>
        </div>
        <h1 className="text-xl font-bold">{user?.email?.split("@")[0]}</h1>
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          Plan gratuit
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Compte
        </h2>
        <div className="flex items-center gap-3 rounded-xl bg-surface p-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="truncate text-sm">{user?.email}</span>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-border bg-card shadow-card">
        <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Préférences
        </h2>
        <Link
          to="/preferences-alimentaires"
          className="mt-2 flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-surface"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Utensils className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">Préférences alimentaires</span>
            <span className="block text-xs text-muted-foreground">
              Allergies, aliments à éviter, objectifs
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>

      <Button
        type="button"
        variant="outline"
        onClick={handleSignOut}
        className="mt-auto h-12 w-full rounded-full border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
      >
        <LogOut className="mr-2 h-4 w-4" />
        Se déconnecter
      </Button>
    </main>
  );
}
