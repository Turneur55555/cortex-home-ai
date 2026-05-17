import { useState } from "react";
import { Download, KeyRound, LogOut, Mail, Trash2 } from "lucide-react";
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

export function SecurityPanel() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const changePassword = async () => {
    if (pwd.length < 8) {
      toast.error("Mot de passe trop court (8 caractères min)");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Mot de passe mis à jour");
      setPwd("");
    }
  };

  const exportData = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const tables = ["items", "nutrition", "workouts", "exercises", "body_tracking", "food_preferences", "documents"] as const;
      const payload: Record<string, unknown> = { exported_at: new Date().toISOString(), user_id: user.id };
      for (const t of tables) {
        const { data } = await (supabase as any).from(t).select("*").eq("user_id", user.id);
        payload[t] = data ?? [];
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cortex-home-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export téléchargé");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur export");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    qc.clear();
    await signOut();
    toast.success("Déconnecté");
    navigate({ to: "/login" });
  };

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sécurité</h2>
      <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 truncate text-sm">{user?.email}</span>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
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
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Nouveau mot de passe" />
            <DialogFooter>
              <button type="button" disabled={busy} onClick={changePassword} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                Enregistrer
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <button type="button" disabled={busy} onClick={exportData} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] disabled:opacity-50">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
            <Download className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 text-sm">Exporter mes données (JSON)</span>
        </button>

        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left text-destructive hover:bg-destructive/5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-sm">Supprimer mon compte</span>
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Supprimer le compte ?</DialogTitle>
              <DialogDescription>
                Cette action est irréversible. Contactez le support pour finaliser la suppression de votre compte et de toutes vos données.
              </DialogDescription>
            </DialogHeader>
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
    </section>
  );
}
