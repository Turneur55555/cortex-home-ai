import { useState, type KeyboardEvent } from "react";
import { Loader2, Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ReminderInput } from "@/services/reminders";

interface SmartInputProps {
  onCreate: (input: ReminderInput) => Promise<void> | void;
  onOpenAdvanced: () => void;
}

export function SmartInput({ onCreate, onOpenAdvanced }: SmartInputProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-reminder", {
        body: { text: t },
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || !("title" in data)) throw new Error("Réponse invalide");
      const r = data as {
        title: string;
        due_at: string | null;
        priority: ReminderInput["priority"];
        category: string | null;
        recurrence: ReminderInput["recurrence"];
      };
      await onCreate({
        title: r.title,
        due_at: r.due_at,
        priority: r.priority,
        category: r.category,
        recurrence: r.recurrence,
        notify_before_minutes: 30,
        status: "todo",
      });
      setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur IA");
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="mb-3 flex items-center gap-2 rounded-2xl border border-border bg-card/70 px-3 py-1.5 shadow-sm backdrop-blur transition-colors focus-within:border-primary/60">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        disabled={loading}
        placeholder="Ex : Acheter du pain demain 18h urgent…"
        className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
        maxLength={300}
        aria-label="Saisie intelligente"
      />
      {text.trim() ? (
        <button
          type="button"
          onClick={() => void submit()}
          disabled={loading}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-gradient-primary px-3 text-[11px] font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          aria-label="Créer via IA"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          IA
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenAdvanced}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          aria-label="Création détaillée"
          title="Création détaillée (N)"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
