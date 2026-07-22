import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { Share2, Download, X, Loader2 } from "lucide-react";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { rankGlowShadow, rankRingInset, rankSurfaceShadow } from "@/components/rpg/rankTheme";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { gradeName } from "@/lib/fitness/rpg/grade";
import type { ExerciseBest } from "@/hooks/useExerciseProgression";

/**
 * Carte de partage 4:5 — pensée pour Instagram, Threads, X.
 * Identique visuellement à la fiche mais isolée et exportable.
 */
export function ExerciseRankShareSheet({
  exerciseName,
  rank,
  masteryPercent,
  best,
  onClose,
}: {
  exerciseName: string;
  rank: RankState;
  masteryPercent: number;
  best: ExerciseBest;
  onClose: () => void;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "share" | "download">(null);
  const { colors } = rank.rank;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function generate(): Promise<Blob | null> {
    if (!captureRef.current) return null;
    const dataUrl = await toPng(captureRef.current, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#050505",
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  }

  async function handleShare() {
    setBusy("share");
    try {
      const blob = await generate();
      if (!blob) return;
      const file = new File([blob], `icortex-${rank.rank.key}.png`, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
        share?: (d: ShareData) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        const gradeLabel = `${rank.rank.label} — ${gradeName(rank.rank.key, rank.levelInRank)}`;
        await nav.share({
          files: [file],
          title: `${gradeLabel} — ${exerciseName}`,
          text: `Rang ${gradeLabel} sur iCortex 💪`,
        });
      } else {
        // fallback téléchargement
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `icortex-${rank.rank.key}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      /* silent */
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    setBusy("download");
    try {
      const blob = await generate();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `icortex-${rank.rank.key}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex flex-col items-center justify-end bg-black/85 backdrop-blur-md sm:justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>

        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-[360px] flex-col items-center gap-4 px-5 pb-8"
        >
          {/* Carte à capturer — ratio 4:5, l'illustration officielle du rang EST la carte */}
          <div
            ref={captureRef}
            className="relative w-full overflow-hidden rounded-3xl"
            style={{
              aspectRatio: "4 / 5",
              boxShadow: rankSurfaceShadow(colors, { y: 30, blur: 80, spread: -30 }),
            }}
          >
            <RankIllustration
              rankKey={rank.rank.key}
              label={rank.rank.label}
              className="absolute inset-0 h-full w-full"
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 32%, transparent 55%, rgba(0,0,0,0.85) 100%)",
              }}
            />

            <div className="relative flex h-full flex-col items-center justify-between p-6 pt-8">
              {/* Signature haut + grade officiel (info absente de l'illustration) */}
              <div className="flex w-full items-center justify-between">
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.4em]"
                  style={{ color: colors.secondary, opacity: 0.9 }}
                >
                  iCortex · Rang
                </p>
                <span className="rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                  {gradeName(rank.rank.key, rank.levelInRank)}
                </span>
              </div>

              {/* Exercice (le rang est porté par l'illustration elle-même) */}
              <p
                className="text-center text-[11px] uppercase tracking-[0.28em] text-white/85 line-clamp-1"
                style={{ textShadow: "0 1px 8px rgba(0,0,0,0.85)" }}
              >
                {exerciseName}
              </p>

              {/* Stats */}
              <div className="grid w-full grid-cols-3 gap-2">
                <ShareStat
                  value={best.weight > 0 ? `${best.weight}` : "—"}
                  unit="kg"
                  label="PR"
                  featured
                  colors={colors}
                />
                <ShareStat
                  value={`×${best.reps || "—"}`}
                  unit="reps"
                  label="Série"
                  colors={colors}
                />
                <ShareStat
                  value={best.oneRM > 0 ? `${Math.round(best.oneRM)}` : "—"}
                  unit="kg"
                  label="1RM"
                  colors={colors}
                />
              </div>

              {/* Maîtrise + signature */}
              <div className="w-full">
                <div className="mb-1.5 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.2em]">
                  <span className="text-white/50">Maîtrise</span>
                  <span style={{ color: colors.secondary }}>
                    {rank.isMax ? "MAX" : `${Math.round(masteryPercent)}%`}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full"
                  style={{
                    background: "rgba(0,0,0,0.55)",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.7)",
                  }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, masteryPercent))}%`,
                      background: colors.gradient,
                      boxShadow: rankGlowShadow(colors.glow, 0, 10, 0),
                    }}
                  />
                </div>
                <p className="mt-3 text-center text-[9px] uppercase tracking-[0.3em] text-white/35">
                  icortex.app
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex w-full gap-2">
            <button
              onClick={handleShare}
              disabled={!!busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{
                background: `linear-gradient(180deg, ${colors.primary}, ${colors.primary}cc)`,
                color: colors.text,
                boxShadow: rankGlowShadow(colors.glow, 10, 26, -12),
              }}
            >
              {busy === "share" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Partager
            </button>
            <button
              onClick={handleDownload}
              disabled={!!busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            >
              {busy === "download" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ShareStat({
  value,
  unit,
  label,
  colors,
  featured = false,
}: {
  value: string | number;
  unit: string;
  label: string;
  colors: { primary: string; secondary: string; glow: string };
  featured?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-2 text-center"
      style={{
        background: "linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))",
        boxShadow: featured
          ? rankRingInset(colors.primary, "55")
          : "inset 0 0 0 1px rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="font-serif text-xl font-bold leading-none"
        style={{ color: featured ? colors.secondary : "#f5f5f4" }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white/55">
        {unit}
      </div>
      <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
    </div>
  );
}
