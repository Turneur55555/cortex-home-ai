import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Plus, Trash2 } from "lucide-react";
import { useGoals, statusOf } from "@/hooks/useGoals";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function GoalsManager() {
  const { goals, addGoal, updateGoal, removeGoal } = useGoals();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");

  const handleAdd = () => {
    if (!title.trim() || !target) return;
    addGoal(title, new Date(target).toISOString());
    setTitle("");
    setTarget("");
  };

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Objectifs</h2>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
        <div className="mb-3 flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvel objectif" className="h-9 bg-white/5" />
          <Input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 w-36 bg-white/5" />
          <button type="button" onClick={handleAdd} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-label="Ajouter">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {goals.map((g) => {
              const status = statusOf(g);
              return (
                <motion.li
                  key={g.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  className="group rounded-xl border border-white/5 bg-white/[0.03] p-3"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateGoal(g.id, { progress: g.progress >= 100 ? 0 : 100 })}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        status === "done" ? "border-success bg-success/20 text-success" : "border-white/20",
                      )}
                      aria-label="Basculer terminé"
                    >
                      {status === "done" && <Check className="h-3 w-3" />}
                    </button>
                    <span className={cn("flex-1 truncate text-sm", status === "done" && "line-through opacity-60")}>{g.title}</span>
                    <span className={cn("text-[10px]", status === "late" ? "text-destructive" : "text-muted-foreground")}>
                      {new Date(g.target).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    </span>
                    <button type="button" onClick={() => removeGoal(g.id)} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-label="Supprimer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={g.progress} className="h-1.5 flex-1" />
                    <span className="w-9 text-right text-[10px] font-semibold tabular-nums">{g.progress}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={g.progress}
                    onChange={(e) => updateGoal(g.id, { progress: Number(e.target.value) })}
                    className="mt-2 w-full accent-primary"
                    aria-label="Progression"
                  />
                </motion.li>
              );
            })}
          </AnimatePresence>
          {goals.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Aucun objectif pour l'instant</p>}
        </ul>
      </div>
    </section>
  );
}
