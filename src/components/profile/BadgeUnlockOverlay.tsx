import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Activity,
  Apple,
  Award,
  CheckCircle,
  Crown,
  Dumbbell,
  Flame,
  Shield,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import {
  RARITY_BG,
  RARITY_BORDER,
  RARITY_COLORS,
  RARITY_LABELS,
  RARITY_TEXT,
  type BadgeCatalogEntry,
} from "@/lib/fitness/badges";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Award, Star, Trophy, Zap, Flame, Crown, Dumbbell, Shield, Target, Apple, CheckCircle, Activity,
};

export function BadgeUnlockOverlay({
  badge,
  onClose,
}: {
  badge: BadgeCatalogEntry | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!badge) return;
    const color = RARITY_COLORS[badge.rarity];
    // Confetti burst
    confetti({
      particleCount: badge.rarity === "mythic" ? 200 : badge.rarity === "legendary" ? 150 : 100,
      spread: 90,
      origin: { y: 0.5 },
      colors: [color, "#fff", "#fbbf24"],
      startVelocity: 45,
      scalar: 1.1,
    });
    // Vibration
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([80, 40, 120]);
    }
    // Auto-close after 4.5s
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [badge, onClose]);

  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-label="Badge débloqué"
        >
          <BadgeShowcase badge={badge} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BadgeShowcase({ badge }: { badge: BadgeCatalogEntry }) {
  const Icon = ICON_MAP[badge.icon] ?? Award;
  const color = RARITY_COLORS[badge.rarity];
  const bg = RARITY_BG[badge.rarity];
  const border = RARITY_BORDER[badge.rarity];
  const text = RARITY_TEXT[badge.rarity];

  return (
    <motion.div
      className="relative flex max-w-xs flex-col items-center gap-4 text-center"
      initial={{ scale: 0.4, opacity: 0, y: 40 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      <motion.p
        className={cn("text-[11px] font-bold uppercase tracking-[0.3em]", text)}
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        Badge débloqué
      </motion.p>

      <motion.div
        className={cn(
          "relative flex h-36 w-36 items-center justify-center rounded-3xl border-2 bg-gradient-to-br",
          border,
          bg,
        )}
        style={{ boxShadow: `0 0 60px ${color}80, 0 0 20px ${color}` }}
        animate={{
          rotate: [0, -3, 3, 0],
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon className={cn("h-16 w-16", text)} />
        {/* Rotating shine ring */}
        <motion.div
          className="pointer-events-none absolute inset-[-8px] rounded-3xl"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, ${color}60 90deg, transparent 180deg, ${color}40 270deg, transparent 360deg)`,
            filter: "blur(6px)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <span
          className={cn(
            "inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
            "bg-gradient-to-br",
            bg,
            text,
          )}
        >
          {RARITY_LABELS[badge.rarity]}
        </span>
        <h3 className="mt-3 text-2xl font-black tracking-tight text-white">{badge.label}</h3>
        <p className="mt-1 text-sm text-white/60">{badge.description}</p>
      </motion.div>

      <motion.div
        className="mt-2 flex items-center gap-2 rounded-full bg-amber-400/15 px-4 py-2 ring-1 ring-amber-400/40"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 400, damping: 15 }}
      >
        <Zap className="h-4 w-4 fill-amber-400 text-amber-400" />
        <span className="text-sm font-bold text-amber-300">+{badge.xp_reward} XP</span>
      </motion.div>

      <p className="mt-3 text-[10px] text-white/30">Appuyez pour fermer</p>
    </motion.div>
  );
}
