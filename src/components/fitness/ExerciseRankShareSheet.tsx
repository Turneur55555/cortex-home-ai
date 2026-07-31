import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { Share2, Download, X, Loader2 } from "lucide-react";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import {
  MATERIAL_GRAIN,
  rankRingInset,
  rankSurfaceShadow,
  rankTextGlow,
} from "@/components/rpg/rankTheme";
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
                {/* En-tête — grade + petit ornement, l'illustration porte déjà l'identité du rang */}
                <div className="shrink-0 text-center">
                  <div
                    className="mx-auto h-1.5 w-1.5 rotate-45"
                    style={{
                      background: colors.secondary,
                      boxShadow: rankTextGlow(colors.glow, 6),
                    }}
                  />
                  <p
                    className="mt-1 text-[12px] font-extrabold uppercase tracking-[0.4em] text-white/90"
                    style={{ textShadow: rankTextGlow(colors.glow, 14) }}
                  >
                    {grade}
                  </p>
                </div>

                {/* Nom de l'exercice — indispensable : c'est ce que le partage raconte */}
                <h2
                  className="mt-1 shrink-0 text-center font-serif text-[21px] font-extrabold uppercase leading-[1.08] tracking-wide text-white"
                  style={{ textShadow: rankTextGlow(colors.glow, 18, "0 1px 6px rgba(0,0,0,0.6)") }}
                >
                  {exerciseName}
                </h2>

                {/* Illustration monumentale — dominante, mais jamais devant le texte */}
                <div className="relative mt-2 min-h-0 flex-[3] overflow-visible rounded-[24px]">
                  <div
                    className="pointer-events-none absolute -inset-5 rounded-[36px]"
                    style={{
                      background: `radial-gradient(ellipse at 50% 40%, ${colors.glow}, transparent 70%)`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute -inset-2 rounded-[28px] opacity-70"
                    style={{
                      background: `radial-gradient(ellipse at 50% 55%, ${colors.glow}, transparent 55%)`,
                    }}
                  />
                  <div className="relative h-full w-full overflow-hidden rounded-[24px]">
                    <RankIllustration
                      rankKey={rank.rank.key}
                      label={rank.rank.label}
                      className="absolute inset-0 h-full w-full"
                    />
                    {/* Grain/débris — texture procédurale partagée du système de rang */}
                    <div
                      className="pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay"
                      style={{ backgroundImage: MATERIAL_GRAIN, backgroundSize: "160px" }}
                    />
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, rgba(0,0,0,0.32) 0%, transparent 22%, transparent 70%, rgba(0,0,0,0.68) 100%)",
                      }}
                    />
                  </div>
                </div>

                {/* Bloc victoire — RECORD BATTU en gradient signature du rang */}
                <div className="mt-2 flex shrink-0 flex-col items-center">
                  <div
                    className="h-px w-16"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${colors.primary}80, transparent)`,
                    }}
                  />
                  <p
                    className="mt-1.5 bg-clip-text text-center text-[26px] font-extrabold uppercase leading-none tracking-[0.06em] text-transparent"
                    style={{
                      backgroundImage: colors.gradient,
                      filter: `drop-shadow(0 0 18px ${colors.glow})`,
                    }}
                  >
                    Record battu
                  </p>
                </div>

                {/* Plaque de résultat — bloc premium, pas une simple ligne de texte */}
                <div
                  className="relative mt-2 shrink-0 overflow-hidden rounded-2xl px-3 py-3"
                  style={{
                    background:
                      "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))",
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), ${rankRingInset(colors.primary, "45")}`,
                  }}
                >
                  {[
                    "top-1.5 left-1.5",
                    "top-1.5 right-1.5",
                    "bottom-1.5 left-1.5",
                    "bottom-1.5 right-1.5",
                  ].map((pos) => (
                    <span
                      key={pos}
                      className={`absolute ${pos} h-1.5 w-1.5 rotate-45`}
                      style={{
                        background: colors.secondary,
                        boxShadow: rankTextGlow(colors.glow, 4),
                      }}
                    />
                  ))}
                  <div className="flex items-baseline justify-center">
                    <span
                      className="font-serif text-[64px] font-extrabold leading-none text-white"
                      style={{ textShadow: "0 4px 20px rgba(0,0,0,0.6)" }}
                    >
                      {best.weight > 0 ? best.weight : "—"}
                    </span>
                    <span
                      className="ml-1 text-[14px] font-bold uppercase tracking-wide"
                      style={{ color: colors.secondary }}
                    >
                      kg
                    </span>
                    <span className="mx-2 text-[28px] font-light leading-none text-white/35">
                      ×
                    </span>
                    <span
                      className="font-serif text-[64px] font-extrabold leading-none"
                      style={{
                        color: colors.secondary,
                        textShadow: rankTextGlow(colors.glow, 24, "0 4px 20px rgba(0,0,0,0.6)"),
                      }}
                    >
                      {best.reps > 0 ? best.reps : "—"}
                    </span>
                    <span
                      className="ml-1 text-[14px] font-bold uppercase tracking-wide"
                      style={{ color: colors.secondary }}
                    >
                      reps
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
