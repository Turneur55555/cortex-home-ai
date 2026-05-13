import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChefHat, Clock, Loader2, Sparkles, X, AlertTriangle, Utensils } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStockItems } from "@/hooks/use-stocks";

type Recipe = {
  title: string;
  time_minutes: number;
  difficulty: string;
  ingredients_used: string[];
  missing_ingredients: string[];
  steps: string[];
  why_fits: string;
};

function useFoodPreferences() {
  return useQuery({
    queryKey: ["food_preferences"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

export function RecipeAssistantSheet({ onClose }: { onClose: () => void }) {
  const { data: items } = useStockItems("alimentation");
  const { data: prefs, isLoading: prefsLoading } = useFoodPreferences();
  const [prompt, setPrompt] = useState("");
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);

  const generate = useMutation({
    mutationFn: async () => {
      const payloadItems = (items ?? []).map((it) => ({
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        expiration_date: it.expiration_date as unknown as string | null,
      }));
      const payloadPrefs = prefs ?? {
        allergies: [],
        foods_to_avoid: [],
        goal: null,
        no_meat_dairy_mix: false,
        other_rules: null,
      };
      const { data, error } = await supabase.functions.invoke("recipe-assistant", {
        body: { items: payloadItems, preferences: payloadPrefs, prompt: prompt.trim() || null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.recipes ?? []) as Recipe[];
    },
    onSuccess: (r) => setRecipes(r),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
              <ChefHat className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold leading-tight">Que cuisiner ?</h2>
              <p className="text-[11px] text-muted-foreground">
                À partir de tes stocks et préférences.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {prefsLoading ? (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Préférences résumées */}
              <div className="mb-4 rounded-xl border border-border bg-surface p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Tes règles
                  </p>
                  <Link
                    to="/preferences-alimentaires"
                    className="text-[11px] font-semibold text-primary"
                  >
                    Modifier
                  </Link>
                </div>
                {!prefs ? (
                  <p className="text-xs text-muted-foreground">
                    Aucune préférence enregistrée.{" "}
                    <Link to="/preferences-alimentaires" className="font-semibold text-primary">
                      Configurer
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {prefs.no_meat_dairy_mix && (
                      <li className="inline-flex items-center gap-1 text-foreground">
                        <Utensils className="h-3 w-3 text-primary" />
                        Pas de mélange viande / produits laitiers
                      </li>
                    )}
                    {prefs.allergies?.length > 0 && (
                      <li className="text-muted-foreground">
                        <span className="font-semibold text-destructive">Allergies :</span>{" "}
                        {prefs.allergies.join(", ")}
                      </li>
                    )}
                    {prefs.foods_to_avoid?.length > 0 && (
                      <li className="text-muted-foreground">
                        <span className="font-semibold text-warning">À éviter :</span>{" "}
                        {prefs.foods_to_avoid.join(", ")}
                      </li>
                    )}
                    {prefs.goal && (
                      <li className="text-muted-foreground">
                        <span className="font-semibold">Objectif :</span> {prefs.goal}
                      </li>
                    )}
                  </ul>
                )}
              </div>

              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Demande (optionnel)
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="ex. quelque chose de rapide pour ce soir"
                rows={2}
                className="mb-3 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
              />

              <button
                type="button"
                disabled={generate.isPending}
                onClick={() => generate.mutate()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
              >
                {generate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {recipes ? "Régénérer" : "Proposer des recettes"}
              </button>

              {recipes && recipes.length === 0 && (
                <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                  <AlertTriangle className="mb-1 inline h-3.5 w-3.5" /> Aucune recette générée.
                </div>
              )}

              {recipes && recipes.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {recipes.map((r, i) => (
                    <li
                      key={i}
                      className="rounded-2xl border border-border bg-card p-4 shadow-card"
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold leading-tight">{r.title}</h3>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {r.time_minutes} min
                        </span>
                      </div>
                      <p className="mb-2 text-[11px] capitalize text-muted-foreground">
                        {r.difficulty}
                      </p>
                      {r.why_fits && (
                        <p className="mb-2 rounded-lg bg-primary/10 p-2 text-[11px] italic text-primary">
                          {r.why_fits}
                        </p>
                      )}
                      <div className="mb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Ingrédients en stock
                        </p>
                        <p className="text-xs">{r.ingredients_used.join(", ")}</p>
                      </div>
                      {r.missing_ingredients?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-warning">
                            À acheter
                          </p>
                          <p className="text-xs">{r.missing_ingredients.join(", ")}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Étapes
                        </p>
                        <ol className="ml-4 list-decimal space-y-0.5 text-xs">
                          {r.steps.map((s, j) => (
                            <li key={j}>{s}</li>
                          ))}
                        </ol>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
