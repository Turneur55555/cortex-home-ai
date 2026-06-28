import { useMemo, useState } from "react";
import {
  Activity,
  Apple,
  Barcode,
  BookmarkPlus,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Plus,
  Scale,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Utensils,
} from "lucide-react";
import { addDays, format, subDays } from "date-fns";
import {
  useAddNutrition,
  useCopyNutritionDay,
  useDeleteNutrition,
  useNutrition,
  useNutritionGoals,
} from "@/hooks/use-fitness";
import { useAddFavorite } from "@/hooks/use-nutrition-favorites";
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
import { FavoritesSheet } from "@/components/fitness/FavoritesSheet";
import { useCreateSavedMeal } from "@/hooks/use-saved-meals";
import { getPortionBadge } from "@/lib/nutrition/utils";
import type { MealPrefill, NutritionEntry } from "@/lib/nutrition/utils";

export function NutritionTab() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data, isLoading } = useNutrition(date);
  const { data: goals } = useNutritionGoals();
  const del = useDeleteNutrition();
  const readd = useAddNutrition();
  const addFav = useAddFavorite();
  const copyDay = useCopyNutritionDay();
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
  const [favSheetOpen, setFavSheetOpen] = useState(false);
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
      {/* Date + navigation J-1/J+1 + objectifs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDate(format(subDays(new Date(date), 1), "yyyy-MM-dd"))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Jour précédent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
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
          onClick={() => setDate(format(addDays(new Date(date), 1), "yyyy-MM-dd"))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Jour suivant"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
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

      {/* Actions rapides — une seule ligne */}
      <div>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/30"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Scan
          </button>
          <button
            type="button"
            onClick={() => setFavSheetOpen(true)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/30"
          >
            <Star className="h-3.5 w-3.5 text-primary" />
            Favoris
          </button>
          <button
            type="button"
            onClick={() => setBarcodeOpen(true)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/30"
          >
            <Barcode className="h-3.5 w-3.5 text-muted-foreground" />
            Code-barres
          </button>
          <button
            type="button"
            onClick={() => setSavedOpen(true)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/30"
          >
            <Utensils className="h-3.5 w-3.5 text-primary" />
            Repas
          </button>
        </div>

      </div>

      {/* Outils */}
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setPlanOpen(true)}
          className="flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/30"
        >
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          Planning
        </button>
        <button
          type="button"
          onClick={() => setCopyOpen((o) => !o)}
          className="flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/30"
        >
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          Copier
        </button>
        <button
          type="button"
          onClick={() => setAnalysisOpen(true)}
          className="flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/30"
        >
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          Analyse
        </button>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/30"
        >
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
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
            Ajoute un aliment pour suivre tes macros.
          </p>
        </div>
      )}

      {grouped.map((g) => {
        const gTotals = g.items.reduce(
          (acc, m) => ({
            calories: acc.calories + (m.calories ?? 0),
            proteins: acc.proteins + (m.proteins ?? 0),
            carbs: acc.carbs + (m.carbs ?? 0),
            fats: acc.fats + (m.fats ?? 0),
          }),
          { calories: 0, proteins: 0, carbs: 0, fats: 0 },
        );
        return (
        <div key={g.key}>
          <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <h3 className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {g.label}
              </h3>
              <span className="truncate text-[11px] text-muted-foreground">
                {Math.round(gTotals.calories)} kcal · P{Math.round(gTotals.proteins)} G{Math.round(gTotals.carbs)} L{Math.round(gTotals.fats)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSaveGroupName(g.label);
                setSaveGroupKey((k) => (k === g.key ? null : g.key));
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
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
              const badge = getPortionBadge(m);
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
                    onClick={() => readd.mutate({
                      date,
                      name: m.name ?? "",
                      meal: m.meal ?? "collation",
                      calories: m.calories,
                      proteins: m.proteins,
                      carbs: m.carbs,
                      fats: m.fats,
                      base_calories: m.base_calories ?? m.calories,
                      base_proteins: m.base_proteins ?? m.proteins ?? null,
                      base_carbs: m.base_carbs ?? m.carbs ?? null,
                      base_fats: m.base_fats ?? m.fats ?? null,
                      serving_count: m.serving_count ?? 1,
                      percentage_consumed: 100,
                      consumed_quantity: m.consumed_quantity ?? null,
                      consumed_unit: m.consumed_unit ?? null,
                      consumed_grams_per_unit: m.consumed_grams_per_unit ?? null,
                    })}
                    disabled={readd.isPending}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                    aria-label="Re-ajouter"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
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
        );
      })}

      <FabAdd onClick={openManual} label="Ajouter un aliment" />
      {open && <NutritionSheet date={date} prefill={prefill} onClose={() => setOpen(false)} />}
      {goalsOpen && <GoalsSheet current={goals ?? null} onClose={() => setGoalsOpen(false)} />}
      {planOpen && <MealPlanSheet onClose={() => setPlanOpen(false)} />}
      {historyOpen && <NutritionHistorySheet onClose={() => setHistoryOpen(false)} />}
      {scanOpen && <MealScanSheet onClose={() => setScanOpen(false)} onResult={handleScanResult} />}
      {barcodeOpen && <BarcodeScannerSheet onClose={() => setBarcodeOpen(false)} />}
      {analysisOpen && <NutritionAnalysisSheet onClose={() => setAnalysisOpen(false)} />}
      {savedOpen && <SavedMealsSheet date={date} onClose={() => setSavedOpen(false)} />}
      {favSheetOpen && <FavoritesSheet date={date} onClose={() => setFavSheetOpen(false)} />}
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
