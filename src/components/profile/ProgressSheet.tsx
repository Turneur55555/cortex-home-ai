import { motion } from "framer-motion";
import { Activity, ArrowUpRight, CheckCircle2, Circle } from "lucide-react";
import { AppSheet } from "./AppSheet";
import { useProgress } from "@/hooks/useProgress";

interface ProgressSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProgressSheet({ open, onOpenChange }: ProgressSheetProps) {
  const data = useProgress();

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Progression"
      description="Vue d'ensemble de votre semaine"
    >
      {!data ? (
        <div className="space-y-3 pb-6">
          <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      ) : (
        <div className="space-y-4 pb-6">
          {/* delta */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl shadow-card"
          >
            <div
              aria-hidden
              className="absolute inset-0 -z-10 opacity-70"
              style={{
                background:
                  "radial-gradient(circle at 100% 0%, rgba(77,175,255,0.25), transparent 70%)",
              }}
            />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Évolution
            </p>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-3xl font-bold tracking-tight">+{data.delta}%</span>
              <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                <ArrowUpRight className="h-3 w-3" /> vs sem. dernière
              </span>
            </div>

            {/* chart */}
            <div className="mt-5 flex h-28 items-end gap-2">
              {data.weekly.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${d.value}%` }}
                    transition={{ duration: 0.7, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full rounded-t-md bg-gradient-to-t from-primary to-accent shadow-[0_0_12px_rgba(108,99,255,0.5)]"
                  />
                  <span className="text-[10px] text-muted-foreground">{d.day}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* habits */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl shadow-card"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Habitudes du jour
            </p>
            <ul className="space-y-2">
              {data.habits.map((h) => (
                <li key={h.name} className="flex items-center gap-3">
                  {h.done ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/60" />
                  )}
                  <span className={h.done ? "text-sm" : "text-sm text-muted-foreground line-through"}>
                    {h.name}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* history */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 gap-2.5"
          >
            {data.history.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-xl"
              >
                <Activity className="h-3.5 w-3.5 text-primary" />
                <p className="mt-2 text-lg font-bold tabular-nums">{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      )}
    </AppSheet>
  );
}
