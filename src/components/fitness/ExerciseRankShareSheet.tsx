import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { Share2, Download, X, Loader2, Dumbbell, Flame, Target } from "lucide-react";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { rankRingInset, rankSurfaceShadow, rankTextGlow } from "@/components/rpg/rankTheme";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { gradeName } from "@/lib/fitness/rpg/grade";
import { inferMuscleGroupFromName } from "@/lib/fitness/muscleGroupInference";
import type { ExerciseBest } from "@/hooks/useExerciseProgression";
import { Portal } from "@/components/Portal";

/**
 * Carte de partage 2:3 — pensée pour Instagram, Threads, X.
 * Identique visuellement à la fiche mais isolée et exportable.
 */
export function ExerciseRankShareSheet({
  exerciseName,
  rank,
  masteryPercent,
  best,
  totalSets,
  estimatedCalories,
  onClose,
}: {
  exerciseName: string;
  rank: RankState;
  masteryPercent: number;
  best: ExerciseBest;
  totalSets: number;
  estimatedCalories: number;
  onClose: () => void;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "share" | "download">(null);
  const { colors } = rank.rank;
  const grade = gradeName(rank.rank.key, rank.levelInRank);
  const muscleGroup = inferMuscleGroupFromName(exerciseName) ?? "Corps entier";

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
        const gradeLabel = `${rank.rank.label} — ${grade}`;
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
    <Portal>
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
            className="flex w-full max-w-[380px] flex-col items-center gap-4 px-5 pb-8"
          >
            {/* Carte à capturer — ratio 2:3, l'illustration officielle du rang EST la carte */}
            <div
              ref={captureRef}
              className="relative w-full overflow-hidden rounded-[28px]"
              style={{
                aspectRatio: "2 / 3",
                background: "#050505",
                boxShadow: rankSurfaceShadow(colors, { y: 30, blur: 80, spread: -30 }),
              }}
            >
              <div className="relative flex h-full flex-col p-4 pt-5">
                {/* En-tête — ICORTEX + Rang·Grade, sans pictogramme */}
                <div className="flex shrink-0 flex-col items-center gap-1 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-[0.55em] text-white/45">
                    iCortex
                  </p>
                  <p
                    className="text-[11px] font-extrabold uppercase tracking-[0.3em]"
                    style={{ color: colors.secondary }}
                  >
                    {rank.rank.label} • {grade}
                  </p>
                </div>

                {/* Titre — nom de l'exercice, immense, centré */}
                <h2
                  className="mt-1.5 shrink-0 text-center font-serif text-[21px] font-extrabold uppercase leading-[1.08] tracking-wide text-white"
                  style={{ textShadow: rankTextGlow(colors.glow, 20, "0 1px 6px rgba(0,0,0,0.6)") }}
                >
                  {exerciseName}
                </h2>

                {/* Illustration monumentale — ne doit jamais empiéter sur l'interface */}
                <div className="relative my-2 min-h-0 flex-1 overflow-hidden rounded-2xl">
                  <RankIllustration
                    rankKey={rank.rank.key}
                    label={rank.rank.label}
                    className="absolute inset-0 h-full w-full"
                  />
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 22%, transparent 78%, rgba(0,0,0,0.5) 100%)",
                    }}
                  />
                </div>

                {/* Bloc performance — record + stats équilibrées + maîtrise */}
                <div
                  className="shrink-0 rounded-2xl p-2.5"
                  style={{
                    background:
                      "linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))",
                    boxShadow: rankRingInset(colors.primary, "35"),
                  }}
                >
                  <p
                    className="text-center text-[8.5px] font-bold uppercase tracking-[0.35em]"
                    style={{ color: colors.secondary }}
                  >
                    ✦ Nouveau record ✦
                  </p>
                  <div className="mt-0.5 flex items-baseline justify-center gap-1.5">
                    <span className="font-serif text-[26px] font-extrabold leading-none text-white">
                      {best.weight > 0 ? best.weight : "—"}
                    </span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: colors.secondary }}
                    >
                      kg
                    </span>
                    <span className="mx-0.5 text-lg font-light text-white/40">×</span>
                    <span className="font-serif text-[26px] font-extrabold leading-none text-white">
                      {best.reps > 0 ? best.reps : "—"}
                    </span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: colors.secondary }}
                    >
                      reps
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <ShareStat
                      value={best.tonnage > 0 ? Math.round(best.tonnage) : "—"}
                      unit="kg"
                      label="Volume"
                      colors={colors}
                    />
                    <ShareStat
                      value={best.oneRM > 0 ? Math.round(best.oneRM) : "—"}
                      unit="kg"
                      label="1RM estimé"
                      colors={colors}
                    />
                  </div>

                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[8.5px] font-semibold uppercase tracking-[0.2em]">
                      <span className="text-white/50">Maîtrise</span>
                      <span style={{ color: colors.secondary }}>
                        {rank.isMax ? "MAX" : `${Math.round(masteryPercent)}%`}
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full"
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
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Pied de carte — Séries / Calories / Focus musculaire */}
                <div
                  className="mt-2 flex shrink-0 items-stretch justify-between rounded-2xl px-3 py-1.5"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                  }}
                >
                  <FooterStat
                    icon={Dumbbell}
                    value={`${totalSets}`}
                    label="Séries"
                    colors={colors}
                  />
                  <div className="w-px shrink-0 bg-white/10" />
                  <FooterStat
                    icon={Flame}
                    value={`${estimatedCalories}`}
                    unit="kcal"
                    label="Calories"
                    colors={colors}
                  />
                  <div className="w-px shrink-0 bg-white/10" />
                  <FooterStat
                    icon={Target}
                    value={muscleGroup}
                    label="Focus musculaire"
                    colors={colors}
                  />
                </div>

                {/* Branding — discret */}
                <p className="mt-2.5 shrink-0 text-center text-[9px] uppercase tracking-[0.3em] text-white/30">
                  icortex.app
                </p>
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
                  boxShadow: rankSurfaceShadow(colors, {
                    ringAlpha: "40",
                    y: 10,
                    blur: 26,
                    spread: -12,
                  }),
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
    </Portal>
  );
}

function ShareStat({
  value,
  unit,
  label,
  colors,
}: {
  value: string | number;
  unit: string;
  label: string;
  colors: { primary: string; secondary: string };
}) {
  return (
    <div
      className="rounded-lg p-1.5 text-center"
      style={{
        background: "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))",
        boxShadow: rankRingInset(colors.primary, "30"),
      }}
    >
      <div className="font-serif text-base font-bold leading-none text-white">
        {value}{" "}
        <span className="text-[10px] font-bold uppercase" style={{ color: colors.secondary }}>
          {unit}
        </span>
      </div>
      <div className="mt-1 text-[7.5px] font-semibold uppercase tracking-[0.16em] text-white/45">
        {label}
      </div>
    </div>
  );
}

function FooterStat({
  icon: Icon,
  value,
  unit,
  label,
  colors,
}: {
  icon: typeof Dumbbell;
  value: string;
  unit?: string;
  label: string;
  colors: { secondary: string };
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 px-1 text-center">
      <Icon className="h-3 w-3" style={{ color: colors.secondary }} />
      <div className="font-serif text-[12px] font-bold leading-none text-white">
        {value}
        {unit && (
          <span className="ml-0.5 text-[8px] font-bold uppercase text-white/50">{unit}</span>
        )}
      </div>
      <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-white/40">
        {label}
      </div>
    </div>
  );
}
