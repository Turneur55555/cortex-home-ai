import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Apple,
  Check,
  Dumbbell,
  Pencil,
  Plus,
  Star,
  Trash2,
  TrendingDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useGoalsWithProgress,
  useAddGoal,
  useCompleteGoal,
  useRemoveGoal,
  useUpdateGoal,
  type GoalType,
  type GoalWithProgress,
} from "@/hooks/useGoalsWithProgress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";


// ─── Goal type config ────────────────────────────────────────────────────────

const GOAL_TYPE_CONFIG: Record<
  GoalType,
  {
    label: string;
    hint: string;
    icon: React.FC<{ className?: string }>;
    defaultTitle: string;
    hasValue: boolean;
    valueLabel: string;
    defaultValue: number;
  }
> = {
  workouts_weekly: {
    label: "Séances / semaine",
    hint: "Calculé depuis vos séances fitness",
    icon: Dumbbell,
    defaultTitle: "3 séances de sport / semaine",
    hasValue: true,
    valueLabel: "Séances cibles",
    defaultValue: 3,
  },
  protein_daily: {
    label: "Protéines / jour",
    hint: "Calculé depuis votre suivi nutrition",
    icon: Apple,
    defaultTitle: "Atteindre mon objectif protéines",
    hasValue: true,
    valueLabel: "Grammes cibles",
    defaultValue: 150,
  },
  weight_loss: {
    label: "Perte de poids",
    hint: "Calculé depuis votre suivi corporel",
    icon: TrendingDown,
    defaultTitle: "Perdre du poids",
    hasValue: true,
    valueLabel: "Kg à perdre",
    defaultValue: 5,
  },
  custom: {
    label: "Objectif libre",
    hint: "Marquez-le manuellement comme terminé",
    icon: Star,
    defaultTitle: "",
    hasValue: false,
    valueLabel: "",
    defaultValue: 0,
  },
};

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  done: {
    label: "Complété",
    color: "text-emerald-400",
    bg: "bg-emerald-400/[0.12]",
    bar: "from-emerald-400 to-teal-400",
    glow: "shadow-emerald-500/20",
    border: "border-emerald-500/20",
    cardBg: "bg-emerald-500/[0.05]",
    topLine: "via-emerald-400/40",
  },
  almost: {
    label: "Presque !",
    color: "text-amber-400",
    bg: "bg-amber-400/[0.12]",
    bar: "from-amber-400 to-orange-400",
    glow: "",
    border: "border-white/[0.07]",
    cardBg: "bg-white/[0.03]",
    topLine: "",
  },
  active: {
    label: "En cours",
    color: "text-violet-400",
    bg: "bg-violet-400/[0.12]",
    bar: "from-violet-500 to-purple-500",
    glow: "",
    border: "border-white/[0.07]",
    cardBg: "bg-white/[0.03]",
    topLine: "",
  },
  late: {
    label: "En retard",
    color: "text-red-400",
    bg: "bg-red-400/[0.10]",
    bar: "from-red-500 to-rose-500",
    glow: "",
    border: "border-red-500/10",
    cardBg: "bg-red-500/[0.03]",
    topLine: "",
  },
};

const ICON_MAP = { Dumbbell, Apple, TrendingDown, Star };

// ─── Goal card ───────────────────────────────────────────────────────────────
function GoalCard({
  goal,
  onToggle,
  onRemove,
  onSave,
}: {
  goal: GoalWithProgress;
  onToggle: () => void;
  onRemove: () => void;
  onSave: (patch: { title: string; target_value: number | null; target_date: string }) => void;
}) {
  const s = STATUS_CONFIG[goal.status];
  const Icon = ICON_MAP[goal.icon as keyof typeof ICON_MAP] ?? Star;
  const isDone = goal.status === "done";
  const typeConfig = GOAL_TYPE_CONFIG[goal.goal_type];
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState(goal.title);
  const [eTarget, setETarget] = useState(goal.target_value ?? 0);
  const [eDate, setEDate] = useState(goal.target_date);

  const Icon = ICON_MAP[goal.icon as keyof typeof ICON_MAP] ?? Star;
  const isDone = goal.status === "done";
  const typeConfig = GOAL_TYPE_CONFIG[goal.goal_type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -16, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-4 transition-shadow",
        s.border,
        s.cardBg,
        isDone && `shadow-lg ${s.glow}`,
      )}
    >
      {isDone && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
            s.topLine,
          )}
        />
      )}

      {/* Header row */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            isDone ? "bg-emerald-400/[0.15]" : "bg-white/[0.06]",
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              isDone ? "text-emerald-400" : "text-muted-foreground",
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "text-sm font-semibold leading-tight",
                isDone && "text-emerald-300/90",
              )}
            >
              {goal.title}
            </p>
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 mt-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
              aria-label="Supprimer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                s.bg,
                s.color,
              )}
            >
              {isDone && <Check className="h-2.5 w-2.5" />}
              {s.label}
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              {new Date(goal.target_date).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
              })}
            </span>
            <span className="ml-auto text-[10px] font-bold text-amber-400/70">
              +{goal.xp_reward} XP
            </span>
          </div>
        </div>
      </div>

      {/* Progress section */}
      <div className="mt-3.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground/70">
            {goal.goal_type === "workouts_weekly" && goal.current_value > 0 && (
              <span>
                {goal.current_value} / {goal.target_value ?? 3} séances cette semaine
              </span>
            )}
            {goal.goal_type === "protein_daily" && goal.current_value > 0 && (
              <span>
                {goal.current_value}g / {goal.target_value ?? "?"}g aujourd'hui
              </span>
            )}
            {goal.goal_type === "weight_loss" && goal.current_value > 0 && (
              <span>
                {goal.current_value}kg / {goal.target_value ?? "?"}kg perdus
              </span>
            )}
            {goal.goal_type === "custom" && typeConfig.hint}
            {goal.goal_type !== "custom" && goal.current_value === 0 && typeConfig.hint}
          </span>
          <span
            className={cn(
              "text-[11px] font-bold tabular-nums",
              isDone ? "text-emerald-400" : "text-foreground",
            )}
          >
            {goal.progress}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className={cn("h-full rounded-full bg-gradient-to-r", s.bar)}
            initial={{ width: "0%" }}
            animate={{ width: `${goal.progress}%` }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
          />
        </div>
      </div>

      {/* Manual toggle for custom goals only */}
      {goal.goal_type === "custom" && (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all",
            isDone
              ? "bg-emerald-500/[0.15] text-emerald-400 hover:bg-emerald-500/[0.22]"
              : "bg-white/[0.05] text-muted-foreground hover:bg-white/[0.09]",
          )}
        >
          {isDone ? (
            <>
              <X className="h-3.5 w-3.5" />
              Marquer comme actif
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" />
              Marquer comme terminé
            </>
          )}
        </button>
      )}
    </motion.div>
  );
}

// ─── Add form ─────────────────────────────────────────────────────────────────

function AddGoalForm({ onClose }: { onClose: () => void }) {
  const addGoal = useAddGoal();
  const [selectedType, setSelectedType] = useState<GoalType>("workouts_weekly");
  const [title, setTitle] = useState(GOAL_TYPE_CONFIG.workouts_weekly.defaultTitle);
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [targetValue, setTargetValue] = useState<number>(
    GOAL_TYPE_CONFIG.workouts_weekly.defaultValue,
  );

  const handleTypeChange = (type: GoalType) => {
    setSelectedType(type);
    if (GOAL_TYPE_CONFIG[type].defaultTitle) {
      setTitle(GOAL_TYPE_CONFIG[type].defaultTitle);
    }
    setTargetValue(GOAL_TYPE_CONFIG[type].defaultValue);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !targetDate) return;
    const config = GOAL_TYPE_CONFIG[selectedType];
    try {
      await addGoal.mutateAsync({
        title: title.trim(),
        goal_type: selectedType,
        target_value: config.hasValue ? targetValue : null,
        target_date: targetDate,
        xp_reward: selectedType === "custom" ? 100 : 150,
      });
      toast.success("Objectif créé !");
      onClose();
    } catch {
      toast.error("Impossible de créer l'objectif. Réessayez.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      <div className="mb-4 space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4 backdrop-blur-sm">
        {/* Type selector */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Type d'objectif
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(GOAL_TYPE_CONFIG) as [GoalType, (typeof GOAL_TYPE_CONFIG)[GoalType]][]).map(
              ([type, config]) => {
                const Icon = config.icon;
                const isSelected = selectedType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTypeChange(type)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all",
                      isSelected
                        ? "border-violet-500/40 bg-violet-500/[0.12] text-violet-300"
                        : "border-white/[0.06] bg-white/[0.03] text-muted-foreground hover:border-white/[0.12] hover:bg-white/[0.06]",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium leading-tight">{config.label}</span>
                  </button>
                );
              },
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground/50">
            {GOAL_TYPE_CONFIG[selectedType].hint}
          </p>
        </div>

        {/* Title */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Titre
          </p>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Décrivez votre objectif..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:border-violet-500/40 focus:outline-none focus:ring-0 focus:bg-white/[0.07] transition-all"
          />
        </div>

        {/* Value (for typed goals) */}
        {GOAL_TYPE_CONFIG[selectedType].hasValue && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {GOAL_TYPE_CONFIG[selectedType].valueLabel}
            </p>
            <input
              type="number"
              min={1}
              value={targetValue}
              onChange={(e) => setTargetValue(Number(e.target.value))}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-sm focus:border-violet-500/40 focus:outline-none focus:ring-0 transition-all"
            />
          </div>
        )}

        {/* Date */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Date limite
          </p>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-sm focus:border-violet-500/40 focus:outline-none focus:ring-0 transition-all"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/[0.05]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim() || addGoal.isPending}
            className="flex-[2] rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-opacity disabled:opacity-50"
          >
            {addGoal.isPending ? "Création..." : "Créer l'objectif"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GoalsManager() {
  const { goals, isLoading } = useGoalsWithProgress();
  const completeGoal = useCompleteGoal();
  const removeGoal = useRemoveGoal();
  const [showForm, setShowForm] = useState(false);

  const doneCount = goals.filter((g) => g.status === "done").length;

  return (
    <section className="mb-6">
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between px-0.5">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Objectifs
          </h2>
          {goals.length > 0 && (
            <p className="text-[10px] text-muted-foreground/50">
              {doneCount} / {goals.length} complétés
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-xl border transition-all",
            showForm
              ? "border-violet-500/40 bg-violet-500/[0.15] text-violet-400"
              : "border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:border-white/[0.14] hover:bg-white/[0.08]",
          )}
          aria-label={showForm ? "Fermer" : "Ajouter un objectif"}
        >
          <motion.div
            animate={{ rotate: showForm ? 45 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <Plus className="h-3.5 w-3.5" />
          </motion.div>
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && <AddGoalForm onClose={() => setShowForm(false)} />}
      </AnimatePresence>

      {/* Goals list */}
      <div className="space-y-3">
        {isLoading && (
          <>
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </>
        )}

        <AnimatePresence initial={false}>
          {!isLoading &&
            goals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onToggle={() =>
                  completeGoal.mutate({ id: g.id, done: !g.is_completed })
                }
                onRemove={() => removeGoal.mutate(g.id)}
              />
            ))}
        </AnimatePresence>

        {!isLoading && goals.length === 0 && !showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-white/[0.08] p-8 text-center"
          >
            <p className="text-sm font-medium text-muted-foreground/60">
              Aucun objectif en cours
            </p>
            <p className="mt-1 text-xs text-muted-foreground/40">
              Créez votre premier objectif avec le bouton +
            </p>
          </motion.div>
        )}
      </div>
    </section>
  );
}
