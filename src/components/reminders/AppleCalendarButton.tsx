import { useEffect, useState } from "react";
import { CalendarPlus, Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function AppleCalendarButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || url) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("Non authentifié");
        const { data: existing } = await supabase
          .from("calendar_tokens")
          .select("token")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        let token = existing?.token;
        if (!token) {
          token = randomToken();
          const { error } = await supabase
            .from("calendar_tokens")
            .insert({ user_id: auth.user.id, token });
          if (error) throw error;
        }
        if (cancelled) return;
        const base = window.location.origin;
        setUrl(`${base}/api/public/calendar/${token}.ics`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
        setOpen(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Lien copié");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Synchroniser avec Apple Calendar"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground backdrop-blur active:scale-95"
      >
        <CalendarPlus className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-elevated sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Sync Apple Calendar</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Copiez ce lien puis dans Apple Calendar : <b>Fichier → Nouvel
              abonnement à un calendrier</b>. Vos rappels se synchroniseront
              automatiquement.
            </p>

            <div className="mt-4">
              {loading || !url ? (
                <div className="flex h-12 items-center justify-center rounded-xl border border-border bg-background/40">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-11 flex-1 truncate rounded-xl border border-border bg-background/40 px-3 text-xs"
                  />
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-gradient-primary px-3 text-xs font-semibold text-primary-foreground"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copié" : "Copier"}
                  </button>
                </div>
              )}
            </div>

            <p className="mt-3 text-[10px] text-muted-foreground">
              Lien privé — ne le partagez pas. Vous pouvez le révoquer à tout
              moment depuis vos paramètres.
            </p>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 h-10 w-full rounded-xl border border-border text-sm font-medium"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
