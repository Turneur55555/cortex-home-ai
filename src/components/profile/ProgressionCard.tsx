import { motion } from "framer-motion";
import { Activity, Calendar, Drumstick, Target } from "lucide-react";
import { useGoals } from "@/hooks/useGoals";
import { useStreak } from "@/hooks/useStreak";
import { useProgress } from "@/hooks/useProgress";

function Ring({ value, label, icon: Icon, color }: { value: number; label: string; icon: typeof Activity; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = c - (clamped / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-14 w-14">
        <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
          <circle cx="28" cy="28" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none" />
          <circle cx="28" cy="28" r={r} stroke={color} strokeWidth="4" strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={offset} className="transition-all duration-700" />
        </svg>
        <Icon className="absolute inset-0 m-auto h-4 w-4" style={{ color }} />
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

export function ProgressionCard() {
  const { stats } = useGoals();
  const { current: streak } = useStreak();
  const { weeklyAvg } = useProgress();

  const goalsPct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const proteinsPct = Math.min(100, Math.round((weeklyAvg.proteins / 150) * 100));
  const streakPct = Math.min(100, (streak / 30) * 100);

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }} className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Progression</h2>
      <div className="grid grid-cols-4 gap-2">
        <Ring value={proteinsPct} label="Protéines" icon={Drumstick} color="#f97316" />
        <Ring value={goalsPct} label="Objectifs" icon={Target} color="#8b5cf6" />
        <Ring value={streakPct} label="Streak" icon={Activity} color="#22c55e" />
        <Ring value={Math.min(100, streak * 3)} label="Suivi" icon={Calendar} color="#06b6d4" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <div>Protéines 7j : <span className="font-semibold text-foreground">{Math.round(weeklyAvg.proteins)}g</span></div>
        <div>Calories 7j : <span className="font-semibold text-foreground">{Math.round(weeklyAvg.calories)}</span></div>
      </div>
    </motion.section>
  );
}
