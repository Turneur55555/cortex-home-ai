import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Save, Utensils, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/preferences-alimentaires")({
  head: () => ({
    meta: [
      { title: "Préférences alimentaires — ICORTEX" },
      { name: "description", content: "Allergies, aliments à éviter et objectifs nutritionnels." },
    ],
  }),
  component: PreferencesPage,
});

const GOALS = [
  "Perte de poids",
  "Prise de masse",
  "Maintien",
  "Performance sportive",
  "Alimentation équilibrée",
];

type Prefs = {
  allergies: string[];
  foods_to_avoid: string[];
  goal: string | null;
  no_meat_dairy_mix: boolean;
  other_rules: string | null;
};

function useFoodPreferences() {
  return useQuery({
    queryKey: ["food_preferences"],
    queryFn: async (): Promise<Prefs | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("food_preferences")
        .select("allergies, foods_to_avoid, goal, no_meat_dairy_mix, other_rules")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useUpsertFoodPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Prefs) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("food_preferences")
        .upsert({ user_id: user.id, ...input }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Préférences enregistrées");
      qc.invalidateQueries({ queryKey: ["food_preferences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function PreferencesPage() {
  const { data, isLoading } = useFoodPreferences();
  const upsert = useUpsertFoodPreferences();

  const [allergies, setAllergies] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [goal, setGoal] = useState<string>("");
  const [noMix, setNoMix] = useState(false);
  const [other, setOther] = useState("");

  useEffect(() => {
    if (data) {
      setAllergies(data.allergies ?? []);
      setAvoid(data.foods_to_avoid ?? []);
      setGoal(data.goal ?? "");
      setNoMix(data.no_meat_dairy_mix ?? false);
      setOther(data.other_rules ?? "");
    }
  }, [data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    upsert.mutate({
      allergies,
      foods_to_avoid: avoid,
      goal: goal || null,
      no_meat_dairy_mix: noMix,
      other_rules: other.trim() || null,
    });
  };

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/profil"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground hover:text-foreground"
          aria-label="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold leading-tight">Préférences alimentaires</h1>
          <p className="text-xs text-muted-foreground">Réutilisées par l'assistant recettes.</p>
        </div>
      </header>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <ChipsField
            label="Allergies"
            placeholder="ex. arachides"
            values={allergies}
            onChange={setAllergies}
            tone="danger"
          />
          <ChipsField
            label="Aliments à éviter"
            placeholder="ex. porc, alcool"
            values={avoid}
            onChange={setAvoid}
            tone="warning"
          />

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Objectif nutritionnel
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.map((g) => {
                const active = goal === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGoal(active ? "" : g)}
                    className={
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                      (active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground")
                    }
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
            <input
              type="checkbox"
              checked={noMix}
              onChange={(e) => setNoMix(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold">Ne jamais mélanger viande et produits laitiers</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Règle casher : l'assistant ne proposera aucune recette combinant les deux.
              </p>
            </div>
            <Utensils className="h-4 w-4 text-muted-foreground" />
          </label>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Autres règles / précisions
            </label>
            <textarea
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="ex. Halal, peu épicé, pas de fruits de mer…"
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
            />
          </div>

          <button
            type="submit"
            disabled={upsert.isPending}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </form>
      )}
    </main>
  );
}

function ChipsField({
  label,
  placeholder,
  values,
  onChange,
  tone,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (v: string[]) => void;
  tone: "danger" | "warning";
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };
  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  const chipCls =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-warning/30 bg-warning/10 text-warning";

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex h-10 items-center gap-1 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${chipCls}`}
            >
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                className="opacity-70 hover:opacity-100"
                aria-label={`Retirer ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
