import { useState } from "react";
import { KeyRound, LogOut, Mail } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SignOutSyncGuardDialog } from "@/components/profile/SignOutSyncGuardDialog";
import {
  attemptSyncBeforeSignOut,
  getOfflineSignOutSummary,
  hasUnresolvedOfflineWork,
  type OfflineSignOutSummary,
} from "@/lib/offline/signOutGuard";

export function SecurityPanel() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pwd, setPwd] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  // CHANTIER 4 (MAJ-04) — non-`null` quand `signOut()` purgerait des
  // opérations/conflits non résolus : le dialogue de confirmation est alors
  // affiché AVANT tout appel à `signOut()` (qui, lui, n'a pas changé — il
  // continue de purger `syncQueue`/`conflicts`, cf. `hooks/use-auth.tsx`).
  const [signOutGuard, setSignOutGuard] = useState<OfflineSignOutSummary | null>(null);
  const [syncingBeforeSignOut, setSyncingBeforeSignOut] = useState(false);

  const changePassword = async () => {
    if (pwd.length < 8) {
      toast.error("Mot de passe trop court (8 caractères min)");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) {
      toast.error("Impossible de mettre à jour le mot de passe");
    } else {
      toast.success("Mot de passe mis à jour");
      setPwd("");
    }
  };

  const changeEmail = async () => {
    const next = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
      toast.error("Adresse email invalide");
      return;
    }
    if (next === user?.email) {
      toast.error("C'est déjà votre adresse actuelle");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: next });
    setBusy(false);
    if (error) {
      toast.error("Impossible de changer l'email : " + error.message);
    } else {
      toast.success("Emails de confirmation envoyés aux deux adresses");
      setEmail("");
    }
  };

  const performSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    toast.success("Déconnecté");
    navigate({ to: "/login", replace: true });
  };

  /**
   * Point d'entrée du bouton « Se déconnecter ». Ne purge JAMAIS
   * silencieusement : cas 1 (aucune opération) et cas 2 (opérations déjà
   * résolues) partent directement, tout le reste ouvre la confirmation
   * (section 3 du chantier).
   */
  const handleSignOut = async () => {
    const userId = user?.id ?? null;
    if (!userId) {
      await performSignOut();
      return;
    }
    const summary = await getOfflineSignOutSummary(userId);
    if (!hasUnresolvedOfflineWork(summary)) {
      await performSignOut();
      return;
    }
    setSignOutGuard(summary);
  };

  /** « Synchroniser d'abord » : réutilise le moteur existant, ne déconnecte
   * que si tout est effectivement résolu après la passe. */
  const handleSyncFirst = async () => {
    const userId = user?.id ?? null;
    if (!userId) return;
    setSyncingBeforeSignOut(true);
    const remaining = await attemptSyncBeforeSignOut(userId);
    setSyncingBeforeSignOut(false);
    if (!hasUnresolvedOfflineWork(remaining)) {
      setSignOutGuard(null);
      await performSignOut();
      return;
    }
    // Toujours quelque chose en attente (bloqué / conflit / échec persistant) :
    // on reste connecté et on explique pourquoi, avec l'état à jour.
    setSignOutGuard(remaining);
    toast.info("Certaines actions restent en attente — vous êtes toujours connecté(e).");
  };

  /** « Se déconnecter quand même », après confirmation explicite dans le dialogue. */
  const handleSignOutAnyway = async () => {
    setSignOutGuard(null);
    await performSignOut();
  };

  return (
    <section className="mb-5">
      <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">Changer l'email</span>
                <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
              </span>
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle adresse email</DialogTitle>
              <DialogDescription>
                Un lien de confirmation sera envoyé à l'ancienne ET à la nouvelle adresse. Le
                changement prend effet après validation.
              </DialogDescription>
            </DialogHeader>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nouvelle@adresse.fr"
            />
            <DialogFooter>
              <button
                type="button"
                disabled={busy}
                onClick={changeEmail}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Envoyer la confirmation
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-sm">Changer le mot de passe</span>
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau mot de passe</DialogTitle>
              <DialogDescription>8 caractères minimum.</DialogDescription>
            </DialogHeader>
            <Input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Nouveau mot de passe"
            />
            <DialogFooter>
              <button
                type="button"
                disabled={busy}
                onClick={changePassword}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Enregistrer
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-destructive hover:bg-destructive/5"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
            <LogOut className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 text-sm font-semibold">Se déconnecter</span>
        </button>
      </div>

      {signOutGuard && (
        <SignOutSyncGuardDialog
          summary={signOutGuard}
          busy={syncingBeforeSignOut}
          onSyncFirst={handleSyncFirst}
          onSignOutAnyway={handleSignOutAnyway}
          onCancel={() => setSignOutGuard(null)}
        />
      )}
    </section>
  );
}
