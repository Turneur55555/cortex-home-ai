import { useMemo, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Apple,
  Barcode,
  BookOpen,
  Bookmark,
  Calendar,
  CalendarRange,
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

// ─── Design system partagé — un seul rythme d'animation, une seule famille
// de cartes pour tout le module (rayon, ombre, fond, effet de pression).
const EASE = [0.16, 1, 0.3, 1] as const;
const TRANSITION = { duration: 0.28, ease: EASE };
const PRESS_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const;
const POP_SPRING = { type: "spring", stiffness: 380, damping: 22 } as const;
const PRESS_LARGE = { scale: 0.985, transition: PRESS_SPRING };
const PRESS_SMALL = { scale: 0.94, transition: PRESS_SPRING };
const CARD = "rounded-3xl border border-border bg-card shadow-sm";

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

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState(() => format(subDays(new Date(), 1), "yyyy-MM-dd"));
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
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);
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

  const dateLabel = format(parseISO(date), "d MMMM yyyy", { locale: fr });

  return (
    <section className="flex flex-col gap-4">
      {/* ─── Barre date premium ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <motion.button
          whileTap={PRESS_SMALL}
          type="button"
          onClick={() => setDate(format(subDays(parseISO(date), 1), "yyyy-MM-dd"))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
          aria-label="Jour précédent"
        >
          <ChevronLeft className="h-4 w-4" />
        </motion.button>

        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setDatePickerOpen((o) => !o)}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium"
          >
            <Calendar className="h-4 w-4 text-primary" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={date}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={TRANSITION}
                className="capitalize"
              >
                {dateLabel}
              </motion.span>
            </AnimatePresence>
            <ChevronRight
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${datePickerOpen ? "rotate-90" : "rotate-0"}`}
            />
          </button>
          {datePickerOpen && (
            <div className="absolute left-0 right-0 top-11 z-20 rounded-2xl border border-border bg-card p-2 shadow-elevated">
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

        <motion.button
          whileTap={PRESS_SMALL}
          type="button"
          onClick={() => setDate(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
          aria-label="Jour suivant"
        >
          <ChevronRight className="h-4 w-4" />
        </motion.button>
      </div>

      {date !== today && (
        <motion.button
          whileTap={PRESS_SMALL}
          type="button"
          onClick={() => setDate(today)}
          className="mx-auto rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
        >
          ← Aujourd'hui
        </motion.button>
      )}

      {/* ─── Carte Calories premium ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={TRANSITION}
        className={`relative overflow-hidden p-4 ${CARD}`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative flex items-center gap-4">
          <CaloriesRing consumed={Math.round(totals.calories)} target={goals?.calories ?? 0} />
          <div className="min-w-0 flex-1">
            {goals?.calories ? (
              <>
                <p className="text-base font-bold leading-tight text-primary">
                  {Math.max(0, goals.calories - Math.round(totals.calories))}{" "}
                  <span className="text-xs font-medium text-primary/80">kcal restantes</span>
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(100, (totals.calories / goals.calories) * 100)}%`,
                      }}
                      transition={TRANSITION}
                      className="h-full rounded-full bg-gradient-primary"
                    />
                  </div>
                  <span className="shrink-0 text-xs font-bold text-primary">
                    {Math.round((totals.calories / goals.calories) * 100)}%
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs leading-snug text-muted-foreground">Aucun objectif défini</p>
                <motion.button
                  whileTap={PRESS_SMALL}
                  type="button"
                  onClick={() => setGoalsOpen(true)}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                >
                  <Target className="h-3 w-3" />
                  Définir un objectif
                </motion.button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ─── Macros — 3 cartes ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5">
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
            <p className="text-xs font-medium leading-snug text-destructive">
              Objectif dépassé de {Math.abs(remaining.calories)} kcal
            </p>
          </div>
        )}

      {/* ─── Mes repas ──────────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight">Mes repas</h2>
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
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              Ajoute un aliment pour suivre tes macros.
            </p>
          </div>
        )}

        <div className="space-y-2.5">
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
                  transition={{ ...TRANSITION, delay: idx * 0.04 }}
                  className={`relative overflow-hidden ${CARD}`}
                >
                  <motion.button
                    initial="rest"
                    whileTap="pressed"
                    variants={{ rest: { scale: 1 }, pressed: PRESS_LARGE }}
                    type="button"
                    onClick={() => setExpandedMeal(expanded ? null : g.key)}
                    className="relative flex w-full items-center gap-3 p-3.5 text-left"
                  >
                    <motion.span
                      aria-hidden
                      variants={{ rest: { opacity: 0 }, pressed: { opacity: 1 } }}
                      transition={{ duration: 0.15 }}
                      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-primary/5"
                    />
                    <div
                      className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ring-1 ring-white/10 ${visual.gradient}`}
                    >
                      <Icon className={`h-6 w-6 ${visual.accent}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold leading-tight">{g.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {g.items.length} aliment{g.items.length > 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <div className="grid grid-cols-3 gap-2">
                        <MacroChip color="text-emerald-400" label="P" value={gTotals.proteins} />
                        <MacroChip color="text-amber-400" label="G" value={gTotals.carbs} />
                        <MacroChip color="text-rose-400" label="L" value={gTotals.fats} />
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold leading-none">
                          {Math.round(gTotals.calories)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">kcal</p>
                      </div>
                      <ChevronRight
                        className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                    </div>
                  </motion.button>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0, scale: 0.98 }}
                        animate={{ height: "auto", opacity: 1, scale: 1 }}
                        exit={{ height: 0, opacity: 0, scale: 0.98 }}
                        transition={TRANSITION}
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
                                  const from = format(subDays(parseISO(date), 1), "yyyy-MM-dd");
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
                              <motion.button
                                whileTap={PRESS_SMALL}
                                type="button"
                                disabled={createSavedMeal.isPending}
                                onClick={() => saveGroupAsMeal(g)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                              >
                                {createSavedMeal.isPending && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                )}
                                Enregistrer
                              </motion.button>
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
                                        {m.calories ?? 0} kcal · P{m.proteins ?? 0} G{m.carbs ?? 0}{" "}
                                        L{m.fats ?? 0}
                                      </p>
                                    </div>
                                    <motion.button
                                      whileTap={PRESS_SMALL}
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
                                          base_proteins: m.base_proteins ?? m.proteins ?? null,
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
                                    </motion.button>
                                    <motion.button
                                      whileTap={PRESS_SMALL}
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
                                    </motion.button>
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

      {/* ─── Bouton "+" — ouvre le centre de commandes ───────────────────── */}
      <motion.button
        whileTap={PRESS_SMALL}
        type="button"
        onClick={() => setCommandCenterOpen(true)}
        className="pointer-events-auto fixed inset-x-0 z-30 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow"
        style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
        aria-label="Ouvrir le centre de commandes"
      >
        <Plus className="h-6 w-6" />
      </motion.button>

      <NutritionCommandCenter
        open={commandCenterOpen}
        onClose={() => setCommandCenterOpen(false)}
        onAction={(action) => {
          setCommandCenterOpen(false);
          if (action === "manual") openManual();
          else if (action === "scan") setScanOpen(true);
          else if (action === "barcode") setBarcodeOpen(true);
          else if (action === "voice") setVoiceOpen(true);
          else if (action === "analysis") setAnalysisOpen(true);
          else if (action === "recipe") setRecipeLogOpen(true);
          else if (action === "favorites") setFavSheetOpen(true);
          else if (action === "saved") setSavedOpen(true);
          else if (action === "history") setHistoryOpen(true);
          else if (action === "plan") setPlanOpen(true);
          else if (action === "goals") setGoalsOpen(true);
          else if (action === "copy-yesterday")
            copyDay.mutate({ from: format(subDays(new Date(), 1), "yyyy-MM-dd"), to: date });
          else if (action === "copy-day") setCopyOpen(true);
        }}
      />

      {open && <NutritionSheet date={date} prefill={prefill} onClose={() => setOpen(false)} />}
      {goalsOpen && <GoalsSheet current={goals ?? null} onClose={() => setGoalsOpen(false)} />}
      {planOpen && <MealPlanSheet onClose={() => setPlanOpen(false)} />}
      {historyOpen && <NutritionHistorySheet onClose={() => setHistoryOpen(false)} />}
      {scanOpen && <MealScanSheet onClose={() => setScanOpen(false)} date={date} />}
      {barcodeOpen && <BarcodeScannerSheet onClose={() => setBarcodeOpen(false)} />}
      {analysisOpen && <NutritionAnalysisSheet onClose={() => setAnalysisOpen(false)} />}
      {savedOpen && <SavedMealsSheet date={date} onClose={() => setSavedOpen(false)} />}
      {favSheetOpen && <FavoritesSheet date={date} onClose={() => setFavSheetOpen(false)} />}
      {recipeLogOpen && <RecipeLogSheet date={date} onClose={() => setRecipeLogOpen(false)} />}
      {voiceOpen && <VoiceLogSheet date={date} onClose={() => setVoiceOpen(false)} />}
      {copyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setCopyOpen(false)}
        >
          <div
            className="mb-20 w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-semibold">Copier une journée</p>
            <input
              type="date"
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              className="mb-4 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/60"
            />
            <div className="flex gap-3">
              <motion.button
                whileTap={PRESS_SMALL}
                type="button"
                onClick={() => setCopyOpen(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-xs font-medium"
              >
                Annuler
              </motion.button>
              <motion.button
                whileTap={PRESS_SMALL}
                type="button"
                disabled={copyDay.isPending}
                onClick={() =>
                  copyDay.mutate(
                    { from: copyFrom, to: date },
                    { onSuccess: () => setCopyOpen(false) },
                  )
                }
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                {copyDay.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Copier ici
              </motion.button>
            </div>
          </div>
        </div>
      )}
      {portionItem && (
        <PortionEditModal item={portionItem} date={date} onClose={() => setPortionItem(null)} />
      )}
      {confirmDeleteMeal && (
        <WorkoutDeleteDialog
          workoutName={confirmDeleteMeal.label}
          onCancel={() => setConfirmDeleteMeal(null)}
          onConfirm={() => {
            const meal = confirmDeleteMeal.key;
            deleteMeal.mutate({ date, meal }, { onSuccess: () => setConfirmDeleteMeal(null) });
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
    <div className="relative h-24 w-24 shrink-0">
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
          transition={TRANSITION}
          className={over ? "text-destructive" : "text-primary"}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums leading-none text-foreground">
          {consumed}
        </span>
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
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
      transition={TRANSITION}
      className={`p-3 ${CARD}`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </span>
        <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="text-sm font-bold leading-tight tracking-tight">
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
          transition={TRANSITION}
          className={`h-full rounded-full ${barColor}`}
        />
      </div>
      <p className={`mt-1 text-[10px] font-semibold ${iconColor}`}>{Math.round(pct)}%</p>
    </motion.div>
  );
}

function MacroChip({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="w-7 text-center">
      <p className={`text-[9px] font-bold leading-none ${color}`}>{label}</p>
      <p className="mt-0.5 text-[10px] font-semibold leading-none text-foreground">
        {Math.round(value)}g
      </p>
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
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-bold tracking-tight">Compléments</h2>
        <Link
          to="/supplements"
          className="text-xs font-semibold text-primary transition-colors hover:text-primary-glow"
        >
          Gérer
        </Link>
      </div>
      {isLoading ? (
        <div className="h-20 animate-pulse rounded-3xl bg-muted/40" />
      ) : items.length === 0 ? (
        <Link
          to="/supplements"
          className="flex items-center justify-center gap-1.5 rounded-3xl border border-dashed border-border py-5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un complément
        </Link>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((s) => (
            <motion.button
              key={s.id}
              layout
              whileTap={PRESS_SMALL}
              type="button"
              onClick={() => toggle.mutate({ supplement_id: s.id, taken: !s.taken })}
              className={`relative flex w-20 shrink-0 flex-col items-center gap-1 rounded-3xl border p-2.5 text-center shadow-sm transition-colors ${
                s.taken ? "border-primary/40 bg-primary/5" : "border-border bg-card"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  s.taken ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                <Pill className="h-4 w-4" />
              </span>
              <span className="w-full truncate text-[10px] font-semibold leading-tight text-foreground">
                {s.name}
              </span>
              {(s.dosage || s.unit) && (
                <span className="text-[9px] text-muted-foreground">
                  {[s.dosage, s.unit].filter(Boolean).join(" ")}
                </span>
              )}
              <span
                className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                  s.taken ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
                }`}
              >
                {s.taken ? "Pris" : "À prendre"}
              </span>
              <AnimatePresence>
                {s.taken && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={POP_SPRING}
                    className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-glow"
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
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

// ─── Centre de commandes — bottom sheet unique du module Nutrition ─────────
type CommandAction =
  | "manual"
  | "scan"
  | "barcode"
  | "voice"
  | "analysis"
  | "favorites"
  | "saved"
  | "history"
  | "plan"
  | "recipe"
  | "copy-yesterday"
  | "copy-day"
  | "goals";

type CommandItem = {
  action: CommandAction;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

type CommandSection = {
  key: string;
  emoji: string;
  title: string;
  description: string;
  items: CommandItem[];
};

const COMMAND_SECTIONS: CommandSection[] = [
  {
    key: "add",
    emoji: "🍽",
    title: "Ajouter",
    description: "Enregistre un aliment, une recette ou un repas déjà prêt.",
    items: [
      {
        action: "manual",
        icon: Apple,
        title: "Ajouter un aliment",
        description: "Rechercher et ajouter un aliment manuellement.",
      },
      {
        action: "recipe",
        icon: BookOpen,
        title: "Ajouter une recette",
        description: "Choisir une recette et l'ajouter à ton journal.",
      },
      {
        action: "saved",
        icon: Bookmark,
        title: "Repas enregistrés",
        description: "Réutiliser un repas que tu as déjà enregistré.",
      },
    ],
  },
  {
    key: "scan",
    emoji: "📷",
    title: "Scanner",
    description: "Ajoute un repas en un instant grâce à la caméra ou ta voix.",
    items: [
      {
        action: "scan",
        icon: Camera,
        title: "Scanner un repas",
        description: "Scanner automatiquement une assiette avec l'IA.",
      },
      {
        action: "barcode",
        icon: Barcode,
        title: "Scanner un code-barres",
        description: "Ajouter un produit en scannant son code-barres.",
      },
      {
        action: "voice",
        icon: Mic,
        title: "Saisie vocale",
        description: "Décrire un repas à voix haute.",
      },
    ],
  },
  {
    key: "tools",
    emoji: "🧠",
    title: "Outils",
    description: "Analyse, historique, planning et objectifs nutritionnels.",
    items: [
      {
        action: "analysis",
        icon: Sparkles,
        title: "Analyse IA",
        description: "Obtenir une analyse détaillée de ton alimentation.",
      },
      {
        action: "history",
        icon: Clock,
        title: "Historique",
        description: "Consulter l'historique de tes repas passés.",
      },
      {
        action: "plan",
        icon: CalendarRange,
        title: "Planning",
        description: "Planifier tes repas de la semaine.",
      },
      {
        action: "copy-yesterday",
        icon: Copy,
        title: "Copier hier",
        description: "Reproduire les repas d'hier sur ce jour.",
      },
      {
        action: "copy-day",
        icon: Calendar,
        title: "Copier une journée",
        description: "Copier les repas d'une journée choisie.",
      },
      {
        action: "goals",
        icon: Target,
        title: "Objectifs",
        description: "Définir tes objectifs caloriques et macros.",
      },
      {
        action: "favorites",
        icon: Star,
        title: "Favoris",
        description: "Retrouver tes aliments et repas favoris.",
      },
    ],
  },
];

function NutritionCommandCenter({
  open,
  onClose,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  onAction: (a: CommandAction) => void;
}) {
  const dragControls = useDragControls();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={TRANSITION}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card shadow-elevated"
          >
            <div
              className="flex shrink-0 cursor-grab touch-none flex-col items-center pb-2 pt-3 active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <span className="h-1.5 w-10 rounded-full bg-muted" />
              <div className="mt-2.5 flex w-full items-center justify-between px-5">
                <div>
                  <p className="text-base font-bold tracking-tight">Centre de commandes</p>
                  <p className="text-xs leading-snug text-muted-foreground">
                    Toutes les actions Nutrition, au même endroit.
                  </p>
                </div>
                <motion.button
                  whileTap={PRESS_SMALL}
                  type="button"
                  onClick={onClose}
                  aria-label="Fermer"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-8 pt-3">
              {COMMAND_SECTIONS.map((section, si) => (
                <div
                  key={section.key}
                  className={si > 0 ? "mt-7 border-t border-border/60 pt-6" : ""}
                >
                  <div className="mb-3.5 flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base">
                      {section.emoji}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{section.title}</p>
                      <p className="truncate text-xs leading-snug text-muted-foreground">
                        {section.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {section.items.map((it, i) => {
                      const Icon = it.icon;
                      return (
                        <motion.button
                          key={it.action}
                          initial="hidden"
                          animate="visible"
                          whileTap="pressed"
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { ...TRANSITION, delay: 0.02 * i },
                            },
                            pressed: PRESS_LARGE,
                          }}
                          type="button"
                          onClick={() => onAction(it.action)}
                          className={`relative flex items-center gap-3.5 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 ${CARD}`}
                        >
                          <motion.span
                            aria-hidden
                            variants={{
                              hidden: { opacity: 0 },
                              visible: { opacity: 0 },
                              pressed: { opacity: 1 },
                            }}
                            transition={{ duration: 0.15 }}
                            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-primary/5"
                          />
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Icon className="h-6 w-6" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">{it.title}</p>
                            <p className="mt-0.5 truncate text-xs leading-snug text-muted-foreground">
                              {it.description}
                            </p>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Unused imports kept for tree-shake awareness — none.
void Flame;
void Activity;
