import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { ExerciseRankBadge } from "./ExerciseRankBadge";
import type { RankState } from "@/lib/fitness/exerciseRanks";

export function RankUpOverlay({
  rank,
  onDone,
}: {
  rank: RankState | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!rank) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.([15, 40, 15]); } catch { /* noop */ }
    }
    confetti({
      particleCount: 90,
      spread: 80,
      origin: { y: 0.5 },
      colors: [rank.rank.colors.primary, rank.rank.colors.secondary, "#ffffff"],
    });
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [rank, onDone]);

  return (
    <AnimatePresence>
      {rank && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.5, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 14 }}
            className="relative"
          >
            <div
              className="absolute inset-0 -z-10 rounded-full blur-3xl"
              style={{ background: rank.rank.colors.glow }}
            />
            <ExerciseRankBadge rank={rank} size={180} />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6 text-xs font-bold uppercase tracking-[0.35em] text-white/70"
          >
            Félicitations
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-1 font-serif text-3xl font-bold"
            style={{ color: rank.rank.colors.text }}
          >
            Vous êtes devenu {rank.fullName}
          </motion.h2>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
