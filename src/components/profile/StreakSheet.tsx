import { motion } from "framer-motion";
import { Award, Flame, Trophy } from "lucide-react";
import { PremiumSheet } from "./PremiumSheet";
import { useStreak } from "@/hooks/useStreak";
import { cn } from "@/lib/utils";

interface StreakSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const milestones = [
  { days: 3, label: "Premier élan", icon: Flame },
  { days: 7, label: "Semaine parfaite", icon: Award },
  { days: 30, label: "Marathonien", icon: Trophy },
  { days: 100, label: "Légende", icon: Trophy },
];

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function StreakSheet({ open, onOpenChange }: StreakSheetProps) {
  const { current, best, days } = useStreak();
  const set = new Set(days);

  // build last 35 days grid (5 weeks)
  const cells: { date: string; active: boolean; today: boolean }[] = [];
  const today = new Date();
  const todayKey = ymd(today);
  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = ymd(d);
    cells.push({ date: key, active: set.has(key), today: key === todayKey });
  }

  return (
    <PremiumSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Streak"
      description="Vos jours d'activité consécutifs"
    >
      <div className="space-y-4 pb-6">
        {/* hero */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center backdrop-blur-xl"
        >
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-80"
            style={{
              background:
                "radial-gradient(circle at 50% 0%, rgba(255,107,107,0.35), transparent 70%)",
            }}
          />
          <Flame className="mx-auto h-8 w-8 text-orange-400 drop-shadow-[0_0_10px_rgba(251,146,60,0.7)]" />
          <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight">{current}</p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            jours consécutifs
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Record personnel : <span className="font-semibold text-foreground">{best}</span> jours
          </p>
        </motion.div>

        {/* calendar grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            5 dernières semaines
          </p>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((c, i) => (
              <motion.div
                key={c.date}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.012 }}
                className={cn(
                  "aspect-square rounded-md transition-colors",
                  c.active
                    ? "bg-gradient-to-br from-orange-500/80 to-pink-500/60 shadow-[0_0_8px_rgba(251,146,60,0.4)]"
                    : "bg-white/[0.04]",
                  c.today && "ring-2 ring-primary/60",
                )}
                title={c.date}
              />
            ))}
          </div>
        </motion.div>

        {/* milestones */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Badges
          </p>
          <ul className="space-y-2">
            {milestones.map((m) => {
              const reached = best >= m.days;
              const Icon = m.icon;
              return (
                <li
                  key={m.days}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-white/5 p-3 transition-colors",
                    reached ? "bg-primary/10" : "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl",
                      reached
                        ? "bg-gradient-to-br from-primary to-accent text-white shadow-glow"
                        : "bg-white/5 text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-[11px] text-muted-foreground">{m.days} jours</p>
                  </div>
                  {reached && (
                    <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                      Débloqué
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </motion.div>
      </div>
    </PremiumSheet>
  );
}
