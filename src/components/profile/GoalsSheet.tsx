import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { PremiumSheet } from "./PremiumSheet";
import { statusOf, useGoals, type Goal, type GoalStatus } from "@/hooks/useGoals";
import { cn } from "@/lib/utils";

interface GoalsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusLabel: Record<GoalStatus, string> = {
  done: "Terminé",
  late: "En retard",
  active: "En cours",
};

const statusTone: Record<GoalStatus, string> = {
  done: "bg-success/15 text-success border-success/30",
  late: "bg-destructive/15 text-destructive border-destructive/30",
  active: "bg-primary/15 text-primary border-primary/30",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function GoalsSheet({ open, onOpenChange }: GoalsSheetProps) {
  const { goals, addGoal, updateGoal, removeGoal } = useGoals();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  const submit = () => {
    if (title.trim().length < 2) return;
    addGoal(title, new Date(target).toISOString());
    setTitle("");
    setAdding(false);
  };

  return (
    <PremiumSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Objectifs"
      description={`${goals.filter((g) => statusOf(g) === "done").length} terminé · ${goals.length} au total`}
    >
      <div className="space-y-3 pb-6">
        <AnimatePresence initial={false}>
          {goals.map((g, i) => (
            <GoalCard
              key={g.id}
              goal={g}
              index={i}
              onProgress={(v) => updateGoal(g.id, { progress: v })}
              onRemove={() => removeGoal(g.id)}
            />
          ))}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {adding ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl"
            >
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                placeholder="Nouvel objectif..."
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm outline-none focus:border-primary/40"
                autoFocus
              />
              <input
                type="date"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm outline-none focus:border-primary/40"
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setAdding(false)}
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Annuler
                </button>
                <button
                  onClick={submit}
                  className="flex-1 rounded-xl bg-gradient-to-r from-primary to-accent py-2.5 text-sm font-semibold text-white shadow-glow"
                >
                  Ajouter
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="add"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-4 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Nouvel objectif
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </PremiumSheet>
  );
}

function GoalCard({
  goal,
  index,
  onProgress,
  onRemove,
}: {
  goal: Goal;
  index: number;
  onProgress: (v: number) => void;
  onRemove: () => void;
}) {
  const status = statusOf(goal);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 60, height: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl shadow-card"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 text-primary-foreground">
          {status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <Target className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-tight">{goal.title}</p>
            <button
              onClick={onRemove}
              className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              aria-label="Supprimer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", statusTone[status])}>
              {statusLabel[status]}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDate(goal.target)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Progression</span>
          <span className="text-[11px] font-semibold tabular-nums">{goal.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${goal.progress}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent shadow-[0_0_12px_rgba(108,99,255,0.6)]"
          />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={goal.progress}
          onChange={(e) => onProgress(Number(e.target.value))}
          className="mt-2 w-full accent-primary"
          aria-label="Ajuster la progression"
        />
      </div>
    </motion.div>
  );
}
