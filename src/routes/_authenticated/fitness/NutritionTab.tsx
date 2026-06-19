import { useMemo, useState } from "react";
import {
  Activity,
  Apple,
  Barcode,
  Calendar,
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

  // Macros restantes vs objectifs (amélioration premium).
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

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setGoalsOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <Target className="h-3.5 w-3.5" />
          Objectifs
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface p-4 shadow-elevated">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Aujourd'hui
          </p>
          <p className="text-2xl font-bold text-primary">
            {Math.round(totals.calories)}
            {goals?.calories ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / {goals.calories} kcal
              </span>
            ) : (
              <span className="ml-1 text-xs font-normal text-muted-foreground">kcal</span>
            )}
          </p>
        </div>
        {goals?.calories ? (
          <ProgressBar value={Math.round(totals.calories)} target={goals.calories} className="mt-2" />
        ) : null}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MacroProgress
            label="Protéines"
            value={totals.proteins}
            target={goals?.proteins}
            color="text-accent"
            barColor="bg-accent"
          />
          <MacroProgress
            label="Glucides"
            value={totals.carbs}
            target={goals?.carbs}
            color="text-warning"
            barColor="bg-warning"
          />
          <MacroProgress
            label="Lipides"
            value={totals.fats}
            target={goals?.fats}
            color="text-destructive"
            barColor="bg-destructive"
          />
        </div>
        {remaining && remaining.calories != null && (
          <div className="mt-3 rounded-xl bg-surface px-3 py-2 text-center text-[11px]">
            {remaining.calories >= 0 ? (
              <span className="text-muted-foreground">
                Restant aujourd'hui :{" "}
                <span className="font-bold text-primary">{remaining.calories}</span> kcal
                {remaining.proteins != null && (
                  <> · P{remaining.proteins} G{remaining.carbs} L{remaining.fats}</>
                )}
              </span>
            ) : (
              <span className="font-semibold text-destructive">
                Objectif dépassé de {Math.abs(remaining.calories)} kcal
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 to-transparent p-3 text-left shadow-card transition-all active:scale-[0.98]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold">Scan Repas</span>
            <span className="block truncate text-[10px] text-muted-foreground">Photo → IA</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setBarcodeOpen(true)}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-card transition-all active:scale-[0.98]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Barcode className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold">Code-barres</span>
            <span className="block truncate text-[10px] text-muted-foreground">
              Scanner un produit
            </span>
          </span>
        </button>
      </div>

      {favorites && favorites.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Star className="h-3.5 w-3.5 text-primary" />
            Favoris — ajout rapide
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {favorites.map((fav) => (
              <span
                key={fav.id}
                className="group inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-2.5 pr-1 text-xs font-medium"
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
        </div>
      )}

      <button
        type="button"
        onClick={() => setSavedOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent py-2.5 text-sm font-semibold text-primary"
      >
        <Utensils className="h-4 w-4" />
        Mes repas enregistrés
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setPlanOpen(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 py-2.5 text-sm font-semibold text-primary"
        >
          <Calendar className="h-4 w-4" />
          Planning
        </button>
        <button
          type="button"
          onClick={() => setCopyOpen((o) => !o)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-2.5 text-sm font-semibold text-foreground"
        >
          <Copy className="h-4 w-4" />
          Copier un jour
        </button>
      </div>

      <button
        type="button"
        onClick={() => setAnalysisOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent py-2.5 text-sm font-semibold text-primary"
      >
        <Activity className="h-4 w-4" />
        Analyse micronutriments
      </button>

      {copyOpen && (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-3">
          <input
            type="date"
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
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
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-primary px-3 text-xs font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {copyDay.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Copier ici
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-2.5 text-sm font-semibold text-foreground"
      >
        <TrendingUp className="h-4 w-4 text-primary" />
        Historique nutritionnel
      </button>

      {isLoading && (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && grouped.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Apple className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Pas de repas enregistré</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Suivez votre alimentation pour atteindre vos objectifs.
          </p>
        </div>
      )}

      {grouped.map((g) => (
        <div key={g.key}>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </h3>
          <ul className="space-y-2">
            {g.items.map((m) => {
              const badge = getPortionBadge(m.percentage_consumed, m.serving_count);
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-card"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium">{m.name}</p>
                      {badge && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          {badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.calories ?? 0} kcal · P{m.proteins ?? 0} G{m.carbs ?? 0} L{m.fats ?? 0}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => saveAsFavorite(m)}
                    disabled={addFav.isPending}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-60"
                    aria-label="Ajouter aux favoris"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPortionItem(m)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    aria-label="Modifier la portion"
                  >
                    <Scale className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => del.mutate(m.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
// MacroProgress et ProgressBar restent ici car ils sont exclusivement utilisés
// dans NutritionTab et ne justifient pas un fichier séparé.

function MacroProgress({
  label,
  value,
  target,
  color,
  barColor,
}: {
  label: string;
  value: number;
  target: number | null | undefined;
  color: string;
  barColor: string;
}) {
  const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="rounded-xl bg-surface p-2">
      <p className={`text-base font-bold ${color}`}>
        {Math.round(value)}
        <span className="text-[10px] font-normal text-muted-foreground">
          {target ? ` / ${Math.round(target)}g` : "g"}
        </span>
      </p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {target ? (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
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
        className={`h-full transition-all ${over ? "bg-destructive" : "bg-gradient-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
