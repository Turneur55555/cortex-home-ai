import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { Share2, Download, X, Loader2 } from "lucide-react";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { rankSurfaceShadow, rankTextGlow } from "@/components/rpg/rankTheme";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { gradeName } from "@/lib/fitness/rpg/grade";
import type { ExerciseBest } from "@/hooks/useExerciseProgression";
import { Portal } from "@/components/Portal";

/**
 * Carte de partage 2:3 — une affiche de victoire, pas une fiche de stats :
 * illustration monumentale, "RECORD BATTU", résultat brut. Rien d'autre.
 */
export function ExerciseRankShareSheet({
  exerciseName,
  rank,
  best,
  onClose,
}: {
  exerciseName: string;
  rank: RankState;
  best: ExerciseBest;
  onClose: () => void;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "share" | "download">(null);
  const { colors } = rank.rank;
  const grade = gradeName(rank.rank.key, rank.levelInRank);

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
            {/* Carte à capturer — ratio 2:3, affiche de victoire : illustration → record → résultat */}
            <div
              ref={captureRef}
              className="relative w-full overflow-hidden rounded-[28px]"
              style={{
                aspectRatio: "2 / 3",
                background: `radial-gradient(ellipse 130% 85% at 50% 38%, ${colors.glow}26, transparent 62%), #050505`,
                boxShadow: rankSurfaceShadow(colors, { y: 30, blur: 80, spread: -30 }),
              }}
            >
              <div className="relative flex h-full flex-col p-4 pt-5">
                {/* En-tête — le grade seul, l'illustration porte déjà l'identité du rang */}
                <p
                  className="shrink-0 text-center text-[13px] font-extrabold uppercase tracking-[0.4em] text-white/90"
                  style={{ textShadow: rankTextGlow(colors.glow, 14) }}
                >
                  {grade}
                </p>

                {/* Illustration monumentale — l'élément principal de la carte */}
                <div className="relative mt-1.5 min-h-0 flex-[3] overflow-visible rounded-[24px]">
                  <div
                    className="pointer-events-none absolute -inset-4 rounded-[32px]"
                    style={{
                      background: `radial-gradient(ellipse at 50% 45%, ${colors.glow}, transparent 68%)`,
                    }}
                  />
                  <div className="relative h-full w-full overflow-hidden rounded-[24px]">
                    <RankIllustration
                      rankKey={rank.rank.key}
                      label={rank.rank.label}
                      className="absolute inset-0 h-full w-full"
                    />
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 20%, transparent 72%, rgba(0,0,0,0.65) 100%)",
                      }}
                    />
                  </div>
                </div>

                {/* Bloc victoire — RECORD BATTU + résultat brut, point focal absolu */}
                <div className="mt-2 flex flex-[2] shrink-0 flex-col items-center justify-center">
                  <p
                    className="text-center text-[19px] font-extrabold uppercase leading-none tracking-[0.14em] text-white"
                    style={{
                      textShadow: rankTextGlow(colors.glow, 22, "0 2px 10px rgba(0,0,0,0.7)"),
                    }}
                  >
                    Record battu
                  </p>
                  <div className="mt-1 flex items-baseline justify-center">
                    <span
                      className="font-serif text-[92px] font-extrabold leading-none text-white"
                      style={{ textShadow: "0 4px 24px rgba(0,0,0,0.65)" }}
                    >
                      {best.weight > 0 ? best.weight : "—"}
                    </span>
                    <span className="mx-2 text-[40px] font-light leading-none text-white/30">
                      ×
                    </span>
                    <span
                      className="font-serif text-[92px] font-extrabold leading-none"
                      style={{
                        color: colors.secondary,
                        textShadow: rankTextGlow(colors.glow, 30, "0 4px 24px rgba(0,0,0,0.65)"),
                      }}
                    >
                      {best.reps > 0 ? best.reps : "—"}
                    </span>
                  </div>
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
