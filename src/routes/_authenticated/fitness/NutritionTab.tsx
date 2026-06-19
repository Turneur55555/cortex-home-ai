import { useMemo, useState } from "react";
import {
  Activity,
  Apple,
  Barcode,
  BookmarkPlus,
  Calendar,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Scale,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Utensils,
  X,
} from "lucide-react";
import { format, subDays } from "date-fns";
import {
  useAddNutrition,
  useCopyNutritionDay,
  useDeleteNutrition,
  useNutrition,
  useNutritionGoals,
} from "@/hooks/use-fitness";
import {
  useAddFavorite,
  useDeleteFavorite,
  useNutritionFavorites,
  type NutritionFavorite,
} from "@/hooks/use-nutrition-favorites";
import { FabAdd } from "@/components/shared/FormComponents";
import { BarcodeScannerSheet } from "@/components/BarcodeScannerSheet";
import { MealScanSheet } from "@/components/fitness/MealScanSheet";
import { NutritionSheet } from "@/components/fitness/NutritionSheet";
import { MealPlanSheet } from "@/components/fitness/MealPlanSheet";
import { GoalsSheet } from "@/components/fitness/GoalsSheet";
import { NutritionAnalysisSheet } from "@/components/fitness/NutritionAnalysisSheet";
import { PortionEditModal } from "@/components/fitness/PortionEditModal";
import { NutritionHistorySheet } from "@/components/fitness/NutritionHistorySheet";
import { SavedMealsSheet } from "@/components/fitness/SavedMealsSheet";
import { useCreateSavedMeal } from "@/hooks/use-saved-meals";
import { getPortionBadge } from "@/lib/nutrition/utils";
import type { MealPrefill, NutritionEntry } from "@/lib/nutrition/utils";

export function NutritionTab() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data, isLoading } = useNutrition(date);
  const { data: goals } = useNutritionGoals();
  const del = useDeleteNutrition();
  const addMeal = useAddNutrition();
  const addFav = useAddFavorite();
  const delFav = useDeleteFavorite();
  const copyDay = useCopyNutritionDay();
  const { data: favorites } = useNutritionFavorites();
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState(() =>
    format(subDays(new Date(), 1), "yyyy-MM-dd"),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [prefill, setPrefill] = useState<MealPrefill | null>(null);
  const [portionItem, setPortionItem] = useState<NutritionEntry | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const createSavedMeal = useCreateSavedMeal();
  const [saveGroupKey, setSaveGroupKey] = useState<string | null>(null);
  const [saveGroupName, setSaveGroupName] = useState("");

  const totals = useMemo(() => {
    return (data ?? []).reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories ?? 0),
        proteins: acc.proteins + (m.proteins ?? 0),
        carbs: acc.carbs + (m.carbs ?? 0),
        fats: acc.fats + (m.fats ?? 0),
      }),
      { calories: 0, proteins: 0, carbs: 0, fats: 0 },
    );
  }, [data]);

  // Macros restantes vs objectifs.
  const remaining = useMemo(() => {
    if (!goals) return null;
    const r = (g: number | null | undefined, v: number) =>
      g != null ? Math.round(g - v) : null;
    return {
      calories: r(goals.calories, totals.calories),
      proteins: r(goals.proteins, totals.proteins),
      carbs: r(goals.carbs, totals.carbs),
      fats: r(goals.fats, totals.fats),
    };
  }, [goals, totals]);

  const grouped = useMemo(() => {
    type Meal = NonNullable<typeof data>[number];
    const order = ["petit-dej", "dejeuner", "diner", "collation"] as const;
    const labels: Record<string, string> = {
      "petit-dej": "Petit-déjeuner",
      dejeuner: "Déjeuner",
      diner: "Dîner",
      collation: "Collation",
    };
    const map = new Map<string, Meal[]>();
    (data ?? []).forEach((m) => {
      const k = m.meal ?? "autre";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    });
    const result: Array<{ key: string; label: string; items: Meal[] }> = [];
    for (const k of order) {
      const items = map.get(k);
      if (items) result.push({ key: k, label: labels[k], items });
    }
    for (const [k, v] of map) {
      if (!order.includes(k as (typeof order)[number])) {
        result.push({ key: k, label: labels[k] ?? "Autre", items: v });
      }
    }
    return result;
  }, [data]);

  const openManual = () => {
    setPrefill(null);
    setOpen(true);
  };

  const handleScanResult = (p: MealPrefill) => {
    setScanOpen(false);
    setPrefill(p);
    setOpen(true);
  };

  // Ajout 1-tap depuis un favori (insère directement dans la journée courante).
  const addFromFavorite = (fav: NutritionFavorite) => {
    addMeal.mutate({
      date,
      name: fav.name,
      meal: fav.meal ?? "collation",
      calories: fav.calories,
      proteins: fav.proteins,
      carbs: fav.carbs,
      fats: fav.fats,
      base_calories: fav.calories,
      base_proteins: fav.proteins,
      base_carbs: fav.carbs,
      base_fats: fav.fats,
      serving_count: 1,
      percentage_consumed: 100,
    });
  };

  // Enregistre un repas loggé comme favori réutilisable.
  const saveAsFavorite = (m: {
    name: string | null;
    meal: string | null;
    calories: number | null;
    proteins: number | null;
    carbs: number | null;
    fats: number | null;
  }) => {
    addFav.mutate({
      name: m.name ?? "Repas",
      meal: m.meal,
      calories: m.calories,
      proteins: m.proteins,
      carbs: m.carbs,
      fats: m.fats,
    });
  };

  // Enregistre tout un repas du journal (groupe) comme modèle réutilisable.
  const MEAL_SLUGS = ["petit-dej", "dejeuner", "diner", "collation"];
  const saveGroupAsMeal = (g: (typeof grouped)[number]) => {
    const mealSlug = MEAL_SLUGS.includes(g.key) ? g.key : null;
    createSavedMeal.mutate(
      {
        name: saveGroupName.trim() || g.label,
        meal: mealSlug,
        items: g.items.map((m) => ({
          food_id: null,
          name: m.name ?? "Aliment",
          calories: m.calories,
          proteins: m.proteins ?? null,
          carbs: m.carbs ?? null,
          fats: m.fats ?? null,
          base_calories: m.base_calories ?? m.calories,
          base_proteins: m.base_proteins ?? m.proteins ?? null,
          base_carbs: m.base_carbs ?? m.carbs ?? null,
          base_fats: m.base_fats ?? m.fats ?? null,
          serving_count: m.serving_count ?? 1,
          consumed_quantity: m.consumed_quantity ?? null,
          consumed_unit: m.consumed_unit ?? null,
        })),
      },
      {
        onSuccess: () => {
          setSaveGroupKey(null);
          setSaveGroupName("");
        },
      },
    );
  };

  return (
    <section className="flex flex-col gap-5">
      {/* Date + objectifs */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-foreground/30"
          />
        </div>
        <button
          type="button"
          onClick={() => setGoalsOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Target className="h-3.5 w-3.5" />
          Objectifs
        </button>
      </div>

      {/* Hero macros */}
      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Aujourd'hui
            </p>
            <p className="mt-1.5 text-4xl font-semibold tracking-tight text-foreground">
              {Math.round(totals.calories)}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                {goals?.calories ? `/ ${goals.calories} ` : ""}kcal
              </span>
            </p>
          </div>
          {remaining && remaining.calories != null && (
            <div className="text-right">
              {remaining.calories >= 0 ? (
                <>
                  <p className="text-lg font-semibold text-foreground">
                    {remaining.calories}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    restant
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-destructive">
                    +{Math.abs(remaining.calories)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    dépassé
                  </p>
                </>
              )}
            </div>
          )}
        </div>
        {goals?.calories ? (
          <ProgressBar
            value={Math.round(totals.calories)}
            target={goals.calories}
            className="mt-4"
          />
        ) : null}
        <div className="mt-5 grid grid-cols-3 gap-4">
          <MacroProgress label="Protéines" value={totals.proteins} target={goals?.proteins} barColor="bg-accent" />
          <MacroProgress label="Glucides" value={totals.carbs} target={goals?.carbs} barColor="bg-warning" />
          <MacroProgress label="Lipides" value={totals.fats} target={goals?.fats} barColor="bg-destructive" />
        </div>
      </div>

      {/* Scan repas */}
      <button
        type="button"
        onClick={() => setScanOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-colors hover:border-foreground/30"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Scan repas</span>
          <span className="block truncate text-xs text-muted-foreground">
            Une photo, l'IA détecte
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {/* Favoris — repliés derrière un bouton, entre Scan et Code-barres */}
      {favorites && favorites.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setFavOpen((o) => !o)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-colors hover:border-foreground/30"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Star className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Favoris — ajout rapide</span>
              <span className="block truncate text-xs text-muted-foreground">
                {favorites.length} aliment{favorites.length > 1 ? "s" : ""}
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${favOpen ? "rotate-180" : ""}`}
            />
          </button>
          {favOpen && (
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {favorites.map((fav) => (
                <span
                  key={fav.id}
                  className="group inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-card py-1 pl-3 pr-1 text-xs font-medium"
                >
                  <button
                    type="button"
                    onClick={() => addFromFavorite(fav)}
                    disabled={addMeal.isPending}
                    className="flex items-center gap-1 text-foreground hover:text-primary disabled:opacity-60"
                    title="Ajouter à la journée"
                  >
                    {fav.name}
                    <span className="text-[10px] text-muted-foreground">
                      {fav.calories ?? 0} kcal
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => delFav.mutate(fav.id)}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Retirer des favoris"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Code-barres */}
      <button
        type="button"
        onClick={() => setBarcodeOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-colors hover:border-foreground/30"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Barcode className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Code-barres</span>
          <span className="block truncate text-xs text-muted-foreground">
            Scanner un produit
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {/* Mes repas enregistrés */}
      <button
        type="button"
        onClick={() => setSavedOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-colors hover:border-foreground/30"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Utensils className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Mes repas enregistrés</span>
          <span className="block truncate text-xs text-muted-foreground">
            Composer ou ajouter en 1 tap
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {/* Outils */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setPlanOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/30"
        >
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Planning
        </button>
        <button
          type="button"
          onClick={() => setCopyOpen((o) => !o)}
          className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/30"
        >
          <Copy className="h-4 w-4 text-muted-foreground" />
          Copier un jour
        </button>
        <button
          type="button"
          onClick={() => setAnalysisOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/30"
        >
          <Activity className="h-4 w-4 text-muted-foreground" />
          Analyse micro
        </button>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/30"
        >
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Historique
        </button>
      </div>

      {copyOpen && (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <input
            type="date"
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
          />
          <button
            type="button"
            disabled={copyDay.isPending}
            onClick={() =>
              copyDay.mutate(
                { from: copyFrom, to: date },
                { onSuccess: () => setCopyOpen(false) },
              )
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-60"
          >
            {copyDay.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Copier ici
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && grouped.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Apple className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucun repas aujourd'hui</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajoute un repas pour suivre tes macros.
          </p>
        </div>
      )}

      {grouped.map((g) => (
        <div key={g.key}>
          <div className="mb-2.5 flex items-center justify-between px-0.5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {g.label}
            </h3>
            <button
              type="button"
              onClick={() => {
                setSaveGroupName(g.label);
                setSaveGroupKey((k) => (k === g.key ? null : g.key));
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              title="Enregistrer ce repas comme modèle"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Enregistrer
            </button>
          </div>
          {saveGroupKey === g.key && (
            <div className="mb-2.5 flex items-center gap-2 rounded-xl border border-border bg-card p-2">
              <input
                type="text"
                value={saveGroupName}
                onChange={(e) => setSaveGroupName(e.target.value)}
                placeholder="Nom du repas"
                className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-foreground/30"
              />
              <button
                type="button"
                disabled={createSavedMeal.isPending}
                onClick={() => saveGroupAsMeal(g)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-60"
              >
                {createSavedMeal.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Enregistrer
              </button>
            </div>
          )}
          <ul className="space-y-2">
            {g.items.map((m) => {
              const badge = getPortionBadge(m.percentage_consumed, m.serving_count);
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      {badge && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {m.calories ?? 0} kcal · P{m.proteins ?? 0} G{m.carbs ?? 0} L{m.fats ?? 0}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => saveAsFavorite(m)}
                    disabled={addFav.isPending}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                    aria-label="Ajouter aux favoris"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPortionItem(m)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Modifier la portion"
                  >
                    <Scale className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => del.mutate(m.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <FabAdd onClick={openManual} label="Ajouter un repas" />
      {open && <NutritionSheet date={date} prefill={prefill} onClose={() => setOpen(false)} />}
      {goalsOpen && <GoalsSheet current={goals ?? null} onClose={() => setGoalsOpen(false)} />}
      {planOpen && <MealPlanSheet onClose={() => setPlanOpen(false)} />}
      {historyOpen && <NutritionHistorySheet onClose={() => setHistoryOpen(false)} />}
      {scanOpen && <MealScanSheet onClose={() => setScanOpen(false)} onResult={handleScanResult} />}
      {barcodeOpen && <BarcodeScannerSheet onClose={() => setBarcodeOpen(false)} />}
      {analysisOpen && <NutritionAnalysisSheet onClose={() => setAnalysisOpen(false)} />}
      {savedOpen && <SavedMealsSheet date={date} onClose={() => setSavedOpen(false)} />}
      {portionItem && (
        <PortionEditModal
          item={portionItem}
          date={date}
          onClose={() => setPortionItem(null)}
        />
      )}
    </section>
  );
}

// ─── Composants UI locaux ─────────────────────────────────────────────────

function MacroProgress({
  label,
  value,
  target,
  barColor,
}: {
  label: string;
  value: number;
  target: number | null | undefined;
  barColor: string;
}) {
  const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <p className="text-lg font-semibold tracking-tight text-foreground">
        {Math.round(value)}
        <span className="text-[10px] font-normal text-muted-foreground">
          {target ? ` / ${Math.round(target)}g` : "g"}
        </span>
      </p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ProgressBar({
  value,
  target,
  className = "",
}: {
  value: number;
  target: number;
  className?: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-border ${className}`}>
      <div
        className={`h-full transition-all ${over ? "bg-destructive" : "bg-foreground"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
