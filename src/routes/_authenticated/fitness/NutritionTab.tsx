import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Apple,
  Barcode,
  BookOpen,
  Bookmark,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Drumstick,
  Flame,
  Loader2,
  Mic,
  Pill,
  Plus,
  Sparkles,
  Star,
  Target,
  Utensils,
  Wheat,
  X,
  Droplet,
} from "lucide-react";
import { toast } from "sonner";
import { addDays, format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Link } from "@tanstack/react-router";
import {
  useAddNutrition,
  useCopyNutritionDay,
  useCopyNutritionMeal,
  useDeleteNutrition,
  useDeleteNutritionMeal,
  useNutrition,
  useNutritionGoals,
} from "@/hooks/use-fitness";
import { useNutritionTotals } from "@/hooks/useNutritionTotals";
import { useAddFavorite } from "@/hooks/use-nutrition-favorites";
import { useSupplements, useToggleSupplementLog } from "@/hooks/use-supplements";
import { MealActionMenu } from "@/components/fitness/MealActionMenu";
import { WorkoutDeleteDialog } from "@/components/fitness/WorkoutDeleteDialog";

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
import { RecipeLogSheet } from "@/components/fitness/RecipeLogSheet";
import { VoiceLogSheet } from "@/components/fitness/VoiceLogSheet";
import { SwipeableNutritionItem } from "@/components/fitness/SwipeableNutritionItem";
import { useCreateSavedMeal } from "@/hooks/use-saved-meals";
import { getPortionBadge } from "@/lib/nutrition/utils";
import { MEAL_LABELS, MEAL_SLUGS, isMealSlug } from "@/lib/nutrition/meals";
import type { MealPrefill, NutritionEntry } from "@/lib/nutrition/utils";

// ─── Config visuelle par repas ─────────────────────────────────────────────
const MEAL_VISUALS: Record<
  string,
  { gradient: string; icon: React.ComponentType<{ className?: string }>; accent: string }
> = {
  "petit-dej": {
    gradient: "from-cyan-400/30 via-cyan-500/20 to-cyan-600/10",
    icon: Apple,
    accent: "text-cyan-400",
  },
  dejeuner: {
    gradient: "from-amber-400/30 via-orange-500/20 to-orange-600/10",
    icon: Utensils,
    accent: "text-amber-400",
  },
  diner: {
    gradient: "from-violet-400/30 via-violet-500/20 to-purple-600/10",
    icon: Drumstick,
    accent: "text-violet-400",
  },
  collation: {
    gradient: "from-pink-400/30 via-pink-500/20 to-pink-600/10",
    icon: Sparkles,
    accent: "text-pink-400",
  },
};
const DEFAULT_VISUAL = {
  gradient: "from-slate-400/20 via-slate-500/10 to-slate-600/10",
  icon: Utensils,
  accent: "text-muted-foreground",
};

export function NutritionTab() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const { data, isLoading } = useNutrition(date);
  const { data: goals } = useNutritionGoals();
  const del = useDeleteNutrition();
  const readd = useAddNutrition();
  const addFav = useAddFavorite();
  const copyDay = useCopyNutritionDay();
  const copyMeal = useCopyNutritionMeal();
  const deleteMeal = useDeleteNutritionMeal();

  const [confirmDeleteMeal, setConfirmDeleteMeal] = useState<{
    key: string;
    label: string;
  } | null>(null);
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "favoris" | "saved" | "history" | "plan">(
    "all",
  );

  const [datePickerOpen, setDatePickerOpen] = useState(false);
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
  const [recipeLogOpen, setRecipeLogOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const createSavedMeal = useCreateSavedMeal();
  const [saveGroupKey, setSaveGroupKey] = useState<string | null>(null);
  const [saveGroupName, setSaveGroupName] = useState("");

  const { totals, remaining } = useNutritionTotals(data, goals);

  const grouped = useMemo(() => {
    type Meal = NonNullable<typeof data>[number];
    const order = MEAL_SLUGS;
    const labels: Record<string, string> = MEAL_LABELS;
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

  const saveGroupAsMeal = (g: (typeof grouped)[number]) => {
    const mealSlug = isMealSlug(g.key) ? g.key : null;
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
          consumed_grams_per_unit: m.consumed_grams_per_unit ?? null,
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

  const handleDelete = (m: NonNullable<typeof data>[number]) => {
    del.mutate(m.id, {
      onSuccess: () => {
        toast("Aliment supprimé", {
          action: {
            label: "Annuler",
            onClick: () =>
              readd.mutate({
                date: m.date,
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
                percentage_consumed: m.percentage_consumed ?? 100,
                consumed_quantity: m.consumed_quantity ?? null,
                consumed_unit: m.consumed_unit ?? null,
                consumed_grams_per_unit: m.consumed_grams_per_unit ?? null,
              }),
          },
          duration: 6000,
        });
      },
    });
  };

  // ─── Tabs "Mes repas" ────────────────────────────────────────────────────
  const handleTab = (t: typeof activeTab) => {
    setActiveTab(t);
    if (t === "favoris") setFavSheetOpen(true);
    else if (t === "saved") setSavedOpen(true);
    else if (t === "history") setHistoryOpen(true);
    else if (t === "plan") setPlanOpen(true);
  };

  const dateLabel = format(parseISO(date), "d MMMM yyyy", { locale: fr });

  return (
    <section className="flex flex-col gap-5">
      {/* ─── Barre date premium ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDate(format(subDays(parseISO(date), 1), "yyyy-MM-dd"))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-all active:scale-95"
          aria-label="Jour précédent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setDatePickerOpen((o) => !o)}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium"
          >
            <Calendar className="h-4 w-4 text-primary" />
            <span className="capitalize">{dateLabel}</span>
            <ChevronRight
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${datePickerOpen ? "rotate-90" : "rotate-0"}`}
            />
          </button>
          {datePickerOpen && (
            <div className="absolute left-0 right-0 top-12 z-20 rounded-2xl border border-border bg-card p-2 shadow-elevated">
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDatePickerOpen(false);
                }}
                className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/60"
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDate(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-all active:scale-95"
          aria-label="Jour suivant"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {date !== today && (
        <button
          type="button"
          onClick={() => setDate(today)}
          className="mx-auto rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
        >
          ← Aujourd'hui
        </button>
      )}

      {/* ─── Carte Calories premium ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-3xl border border-border bg-card p-5"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative flex items-center gap-5">
          <CaloriesRing consumed={Math.round(totals.calories)} target={goals?.calories ?? 0} />
          <div className="min-w-0 flex-1">
            {goals?.calories ? (
              <>
                <p className="text-lg font-bold text-primary">
                  {Math.max(0, goals.calories - Math.round(totals.calories))}{" "}
                  <span className="text-sm font-medium text-primary/80">kcal restantes</span>
                </p>
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(100, (totals.calories / goals.calories) * 100)}%`,
                        }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full rounded-full bg-gradient-primary"
                      />
                    </div>
                    <span className="shrink-0 text-xs font-bold text-primary">
                      {Math.round((totals.calories / goals.calories) * 100)}%
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Objectif quotidien : {goals.calories} kcal
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Aucun objectif défini</p>
                <button
                  type="button"
                  onClick={() => setGoalsOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                >
                  <Target className="h-3 w-3" />
                  Définir un objectif
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ─── Macros — 3 cartes ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <MacroCard
          icon={Drumstick}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10"
          barColor="bg-emerald-400"
          label="Protéines"
          value={totals.proteins}
          target={goals?.proteins}
        />
        <MacroCard
          icon={Wheat}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10"
          barColor="bg-amber-400"
          label="Glucides"
          value={totals.carbs}
          target={goals?.carbs}
        />
        <MacroCard
          icon={Droplet}
          iconColor="text-rose-400"
          iconBg="bg-rose-500/10"
          barColor="bg-rose-400"
          label="Lipides"
          value={totals.fats}
          target={goals?.fats}
        />
      </div>

      {/* ─── N2 — alerte dépassement ────────────────────────────────────── */}
      {remaining?.calories != null &&
        goals?.calories != null &&
        remaining.calories < -(goals.calories * 0.1) && (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Objectif dépassé de {Math.abs(remaining.calories)} kcal
            </p>
          </div>
        )}

      {/* ─── Actions rapides ────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-bold">Actions rapides</p>
        <div className="grid grid-cols-4 gap-2.5">
          <QuickAction icon={Camera} label="Scan repas" onClick={() => setScanOpen(true)} />
          <QuickAction icon={Mic} label="Vocal" onClick={() => setVoiceOpen(true)} />
          <QuickAction icon={Barcode} label="Code-barres" onClick={() => setBarcodeOpen(true)} />
          <QuickAction icon={Sparkles} label="Analyse IA" onClick={() => setAnalysisOpen(true)} />
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-2.5">
          <QuickAction icon={Target} label="Objectifs" onClick={() => setGoalsOpen(true)} />
          <QuickAction
            icon={Copy}
            label="Copier hier"
            onClick={() =>
              copyDay.mutate({ from: format(subDays(new Date(), 1), "yyyy-MM-dd"), to: date })
            }
            pending={copyDay.isPending}
          />
          <QuickAction icon={Calendar} label="Copier…" onClick={() => setCopyOpen((o) => !o)} />
          <QuickAction icon={BookOpen} label="Recettes" onClick={() => setRecipeLogOpen(true)} />
        </div>
      </section>

      {copyOpen && (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <input
            type="date"
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/60"
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
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {copyDay.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Copier ici
          </button>
        </div>
      )}

      {/* ─── Mes repas — tabs + cartes ──────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Mes repas</h2>
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabChip
            active={activeTab === "all"}
            icon={Utensils}
            label="Tous"
            onClick={() => setActiveTab("all")}
          />
          <TabChip
            active={activeTab === "favoris"}
            icon={Star}
            label="Favoris"
            onClick={() => handleTab("favoris")}
          />
          <TabChip
            active={activeTab === "saved"}
            icon={Bookmark}
            label="Enregistrés"
            onClick={() => handleTab("saved")}
          />
          <TabChip
            active={activeTab === "history"}
            icon={Clock}
            label="Historique"
            onClick={() => handleTab("history")}
          />
          <TabChip
            active={activeTab === "plan"}
            icon={Calendar}
            label="Plan"
            onClick={() => handleTab("plan")}
          />
        </div>

        {isLoading && (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && grouped.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border p-8 text-center">
            <Apple className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Aucun repas aujourd'hui</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ajoute un aliment pour suivre tes macros.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {grouped.map((g, idx) => {
              const gTotals = g.items.reduce(
                (acc, m) => ({
                  calories: acc.calories + (m.calories ?? 0),
                  proteins: acc.proteins + (m.proteins ?? 0),
                  carbs: acc.carbs + (m.carbs ?? 0),
                  fats: acc.fats + (m.fats ?? 0),
                }),
                { calories: 0, proteins: 0, carbs: 0, fats: 0 },
              );
              const visual = MEAL_VISUALS[g.key] ?? DEFAULT_VISUAL;
              const Icon = visual.icon;
              const expanded = expandedMeal === g.key;
              return (
                <motion.div
                  key={g.key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden rounded-3xl border border-border bg-card"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedMeal(expanded ? null : g.key)}
                    className="flex w-full items-center gap-3 p-3 text-left"
                  >
                    <div
                      className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${visual.gradient}`}
                    >
                      <Icon className={`h-6 w-6 ${visual.accent}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{g.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {g.items.length} aliment{g.items.length > 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="hidden text-center xs:block">
                        <p className="text-[10px] font-bold text-emerald-400">P</p>
                        <p className="text-[11px] font-semibold">
                          {Math.round(gTotals.proteins)}g
                        </p>
                      </div>
                      <div className="hidden text-center xs:block">
                        <p className="text-[10px] font-bold text-amber-400">G</p>
                        <p className="text-[11px] font-semibold">
                          {Math.round(gTotals.carbs)}g
                        </p>
                      </div>
                      <div className="hidden text-center xs:block">
                        <p className="text-[10px] font-bold text-rose-400">L</p>
                        <p className="text-[11px] font-semibold">
                          {Math.round(gTotals.fats)}g
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold leading-none">
                          {Math.round(gTotals.calories)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">kcal</p>
                      </div>
                      <ChevronRight
                        className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                    </div>
                  </button>

                  {/* Compact macros row on very small screens (mockup style) */}
                  <div className="flex items-center gap-4 border-t border-border/60 px-3 py-2 xs:hidden">
                    <MacroInline color="text-emerald-400" label="P" value={gTotals.proteins} />
                    <MacroInline color="text-amber-400" label="G" value={gTotals.carbs} />
                    <MacroInline color="text-rose-400" label="L" value={gTotals.fats} />
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border/60 px-3 pb-3 pt-2">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              Détail
                            </p>
                            <MealActionMenu
                              mealLabel={g.label}
                              onAction={(action) => {
                                if (action === "copy-yesterday") {
                                  const from = format(
                                    subDays(parseISO(date), 1),
                                    "yyyy-MM-dd",
                                  );
                                  copyMeal.mutate({ from, to: date, meal: g.key });
                                } else if (action === "save-as-template") {
                                  setSaveGroupName(g.label);
                                  setSaveGroupKey((k) => (k === g.key ? null : g.key));
                                } else if (action === "delete") {
                                  setConfirmDeleteMeal({ key: g.key, label: g.label });
                                }
                              }}
                            />
                          </div>

                          {saveGroupKey === g.key && (
                            <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-surface p-2">
                              <input
                                type="text"
                                value={saveGroupName}
                                onChange={(e) => setSaveGroupName(e.target.value)}
                                placeholder="Nom du repas"
                                className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-primary/60"
                              />
                              <button
                                type="button"
                                disabled={createSavedMeal.isPending}
                                onClick={() => saveGroupAsMeal(g)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                              >
                                {createSavedMeal.isPending && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                )}
                                Enregistrer
                              </button>
                            </div>
                          )}

                          <ul className="space-y-1.5">
                            {g.items.map((m) => {
                              const badge = getPortionBadge(m);
                              return (
                                <SwipeableNutritionItem
                                  key={m.id}
                                  onDelete={() => handleDelete(m)}
                                  onTap={() => setPortionItem(m)}
                                >
                                  <div className="flex items-center gap-1 p-3">
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
                                        {m.calories ?? 0} kcal · P{m.proteins ?? 0} G
                                        {m.carbs ?? 0} L{m.fats ?? 0}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        readd.mutate({
                                          date,
                                          name: m.name ?? "",
                                          meal: m.meal ?? "collation",
                                          calories: m.calories,
                                          proteins: m.proteins,
                                          carbs: m.carbs,
                                          fats: m.fats,
                                          base_calories: m.base_calories ?? m.calories,
                                          base_proteins:
                                            m.base_proteins ?? m.proteins ?? null,
                                          base_carbs: m.base_carbs ?? m.carbs ?? null,
                                          base_fats: m.base_fats ?? m.fats ?? null,
                                          serving_count: m.serving_count ?? 1,
                                          percentage_consumed: 100,
                                          consumed_quantity: m.consumed_quantity ?? null,
                                          consumed_unit: m.consumed_unit ?? null,
                                          consumed_grams_per_unit:
                                            m.consumed_grams_per_unit ?? null,
                                        });
                                      }}
                                      disabled={readd.isPending}
                                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted active:text-foreground disabled:opacity-60"
                                      aria-label="Re-ajouter"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        saveAsFavorite(m);
                                      }}
                                      disabled={addFav.isPending}
                                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted active:text-foreground disabled:opacity-60"
                                      aria-label="Ajouter aux favoris"
                                    >
                                      <Star className="h-4 w-4" />
                                    </button>
                                  </div>
                                </SwipeableNutritionItem>
                              );
                            })}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>

      {/* ─── Compléments — strip horizontal ─────────────────────────────── */}
      <SupplementsStrip date={date} />

      {/* ─── FAB Speed Dial ─────────────────────────────────────────────── */}
      <SpeedDialFab
        open={speedDialOpen}
        onToggle={() => setSpeedDialOpen((o) => !o)}
        onAction={(action) => {
          setSpeedDialOpen(false);
          if (action === "manual") openManual();
          else if (action === "scan") setScanOpen(true);
          else if (action === "barcode") setBarcodeOpen(true);
          else if (action === "voice") setVoiceOpen(true);
          else if (action === "recipe") setRecipeLogOpen(true);
          else if (action === "favorites") setFavSheetOpen(true);
          else if (action === "saved") setSavedOpen(true);
        }}
      />

      {open && <NutritionSheet date={date} prefill={prefill} onClose={() => setOpen(false)} />}
      {goalsOpen && <GoalsSheet current={goals ?? null} onClose={() => setGoalsOpen(false)} />}
      {planOpen && (
        <MealPlanSheet
          onClose={() => {
            setPlanOpen(false);
            setActiveTab("all");
          }}
        />
      )}
      {historyOpen && (
        <NutritionHistorySheet
          onClose={() => {
            setHistoryOpen(false);
            setActiveTab("all");
          }}
        />
      )}
      {scanOpen && <MealScanSheet onClose={() => setScanOpen(false)} date={date} />}
      {barcodeOpen && <BarcodeScannerSheet onClose={() => setBarcodeOpen(false)} />}
      {analysisOpen && <NutritionAnalysisSheet onClose={() => setAnalysisOpen(false)} />}
      {savedOpen && (
        <SavedMealsSheet
          date={date}
          onClose={() => {
            setSavedOpen(false);
            setActiveTab("all");
          }}
        />
      )}
      {favSheetOpen && (
        <FavoritesSheet
          date={date}
          onClose={() => {
            setFavSheetOpen(false);
            setActiveTab("all");
          }}
        />
      )}
      {recipeLogOpen && <RecipeLogSheet date={date} onClose={() => setRecipeLogOpen(false)} />}
      {voiceOpen && <VoiceLogSheet date={date} onClose={() => setVoiceOpen(false)} />}
      {portionItem && (
        <PortionEditModal
          item={portionItem}
          date={date}
          onClose={() => setPortionItem(null)}
        />
      )}
      {confirmDeleteMeal && (
        <WorkoutDeleteDialog
          workoutName={confirmDeleteMeal.label}
          onCancel={() => setConfirmDeleteMeal(null)}
          onConfirm={() => {
            const meal = confirmDeleteMeal.key;
            deleteMeal.mutate(
              { date, meal },
              { onSuccess: () => setConfirmDeleteMeal(null) },
            );
          }}
        />
      )}
    </section>
  );
}

// ─── Composants UI locaux ─────────────────────────────────────────────────

function CaloriesRing({ consumed, target }: { consumed: number; target: number }) {
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const pct = target > 0 ? consumed / target : 0;
  const over = consumed > target;
  const offset = CIRC * (1 - Math.min(1, pct));
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          className="text-muted"
        />
        <motion.circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          initial={{ strokeDashoffset: CIRC }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className={over ? "text-destructive" : "text-primary"}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums leading-none text-foreground">
          {consumed}
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          kcal
        </span>
        {target > 0 && (
          <span className="mt-0.5 text-[9px] text-muted-foreground">sur {target}</span>
        )}
      </div>
    </div>
  );
}

function MacroCard({
  icon: Icon,
  iconColor,
  iconBg,
  barColor,
  label,
  value,
  target,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  barColor: string;
  label: string;
  value: number;
  target: number | null | undefined;
}) {
  const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-border bg-card p-3"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </span>
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="text-xl font-bold tracking-tight">
        {Math.round(value)}
        <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">g</span>
      </p>
      {target ? (
        <p className="text-[10px] text-muted-foreground">sur {Math.round(target)} g</p>
      ) : (
        <p className="text-[10px] text-muted-foreground">—</p>
      )}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${barColor}`}
        />
      </div>
      <p className={`mt-1 text-[10px] font-semibold ${iconColor}`}>{Math.round(pct)}%</p>
    </motion.div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  pending,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface/60 p-2.5 transition-colors hover:border-primary/40 disabled:opacity-60"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="text-center text-[10px] font-medium leading-tight text-foreground">
        {label}
      </span>
    </motion.button>
  );
}

function TabChip({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
        active
          ? "bg-gradient-primary text-primary-foreground shadow-glow"
          : "border border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function MacroInline({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className={`text-[10px] font-bold ${color}`}>{label}</span>
      <span className="text-[11px] font-semibold text-foreground">{Math.round(value)}g</span>
    </div>
  );
}

// ─── Compléments strip horizontal ────────────────────────────────────────
function SupplementsStrip({ date }: { date: string }) {
  const { data, isLoading } = useSupplements(date);
  const toggle = useToggleSupplementLog(date);
  const items = data ?? [];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">Compléments</h2>
        <Link
          to="/supplements"
          className="text-xs font-semibold text-primary transition-colors hover:text-primary-glow"
        >
          Gérer
        </Link>
      </div>
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-muted/40" />
      ) : items.length === 0 ? (
        <Link
          to="/supplements"
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-6 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un complément
        </Link>
      ) : (
        <div className="flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((s) => (
            <motion.button
              key={s.id}
              whileTap={{ scale: 0.94 }}
              type="button"
              onClick={() => toggle.mutate({ supplement_id: s.id, taken: !s.taken })}
              className={`relative flex w-24 shrink-0 flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-all ${
                s.taken
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card"
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  s.taken ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                <Pill className="h-5 w-5" />
              </span>
              <span className="truncate text-[11px] font-semibold leading-tight text-foreground">
                {s.name}
              </span>
              {(s.dosage || s.unit) && (
                <span className="text-[9px] text-muted-foreground">
                  {[s.dosage, s.unit].filter(Boolean).join(" ")}
                </span>
              )}
              <AnimatePresence>
                {s.taken && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 20 }}
                    className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-glow"
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── FAB Speed Dial ──────────────────────────────────────────────────────
type SpeedDialAction =
  | "manual"
  | "scan"
  | "barcode"
  | "voice"
  | "recipe"
  | "favorites"
  | "saved";

function SpeedDialFab({
  open,
  onToggle,
  onAction,
}: {
  open: boolean;
  onToggle: () => void;
  onAction: (a: SpeedDialAction) => void;
}) {
  const items: Array<{ action: SpeedDialAction; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { action: "manual", label: "Aliment", icon: Apple },
    { action: "scan", label: "Scan repas", icon: Camera },
    { action: "barcode", label: "Code-barres", icon: Barcode },
    { action: "voice", label: "Vocal", icon: Mic },
    { action: "recipe", label: "Recette", icon: BookOpen },
    { action: "favorites", label: "Favoris", icon: Star },
    { action: "saved", label: "Enregistrés", icon: Bookmark },
  ];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      <div
        className="pointer-events-none fixed inset-x-0 z-50 mx-auto flex w-full max-w-[430px] flex-col items-center px-4"
        style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto mb-3 grid w-full grid-cols-2 gap-2 rounded-3xl border border-border bg-card/95 p-3 shadow-elevated backdrop-blur-xl"
            >
              {items.map((it, i) => {
                const Icon = it.icon;
                return (
                  <motion.button
                    key={it.action}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 * i, duration: 0.2 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => onAction(it.action)}
                    className="flex items-center gap-2.5 rounded-2xl bg-surface/70 p-3 text-left transition-colors hover:bg-primary/10"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-semibold text-foreground">
                      {it.label}
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileTap={{ scale: 0.9 }}
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          type="button"
          onClick={onToggle}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow"
          aria-label={open ? "Fermer" : "Ajouter"}
        >
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </motion.button>
      </div>
    </>
  );
}

// Unused imports kept for tree-shake awareness — none.
void Flame;
void Activity;
