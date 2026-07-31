import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { Share2, Download, X, Loader2 } from "lucide-react";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import {
  MATERIAL_GRAIN,
  rankMetallicGradient,
  rankRelief,
  rankSurfaceShadow,
  rankTextGlow,
} from "@/components/rpg/rankTheme";
import type { RankState } from "@/lib/fitness/exerciseRanks";
import { gradeName } from "@/lib/fitness/rpg/grade";
import type { ExerciseBest } from "@/hooks/useExerciseProgression";
import { Portal } from "@/components/Portal";

// ============================================================
// MODE DEBUG TEMPORAIRE — diagnostic de la disparition de l'illustration
// sur iOS Safari. À retirer une fois la cause confirmée sur appareil réel.
// N'affecte aucune mise en page : n'ajoute qu'un panneau de lecture et deux
// contours (rouge = conteneur, vert = <img>), tous deux `pointer-events-none`.
// ============================================================
const DEBUG_MODE = true;

interface IllustrationDiag {
  containerW: number;
  containerH: number;
  imgW: number;
  imgH: number;
  naturalWidth: number;
  naturalHeight: number;
  complete: boolean;
  currentSrc: string;
  display: string;
  visibility: string;
  opacity: string;
  zIndex: string;
}

function useIllustrationDiag(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [diag, setDiag] = useState<IllustrationDiag | { error: string } | null>(null);

  useEffect(() => {
    if (!DEBUG_MODE) return;
    let cancelled = false;

    function scan() {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) {
        setDiag({ error: "conteneur introuvable (ref non montée)" });
        return;
      }
      const img = container.querySelector("img");
      if (!img) {
        setDiag({ error: "AUCUNE BALISE <img> DANS LE DOM" });
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const cs = window.getComputedStyle(img);
      setDiag({
        containerW: containerRect.width,
        containerH: containerRect.height,
        imgW: imgRect.width,
        imgH: imgRect.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete,
        currentSrc: img.currentSrc || "(vide)",
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        zIndex: cs.zIndex,
      });
    }

    scan();
    const interval = window.setInterval(scan, 400);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [containerRef]);

  return diag;
}

function DiagRow({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/50">{label}</span>
      <span className="break-all text-right text-lime-300">{String(value)}</span>
    </div>
  );
}

/** Panneau de lecture — affiche les métriques réelles de l'illustration en direct. */
function IllustrationDebugPanel({ diag }: { diag: IllustrationDiag | { error: string } | null }) {
  const [copied, setCopied] = useState(false);

  async function copyDiag() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible (contexte non https, ou permission refusée) */
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-2 top-16 z-[9999] max-h-[55vh] overflow-auto rounded-md bg-black/90 p-2 font-mono text-[9px] leading-tight text-white shadow-2xl">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="font-bold text-red-400">DEBUG — illustration</p>
        <button
          onClick={copyDiag}
          disabled={!diag}
          className="pointer-events-auto rounded bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white"
        >
          {copied ? "Copié !" : "Copier"}
        </button>
      </div>
      {!diag && <p className="text-white/50">Analyse…</p>}
      {diag && "error" in diag && <p className="font-bold text-red-400">{diag.error}</p>}
      {diag && !("error" in diag) && (
        <div className="space-y-0.5">
          <DiagRow
            label="conteneur W×H"
            value={`${diag.containerW.toFixed(1)} × ${diag.containerH.toFixed(1)}`}
          />
          <DiagRow
            label="img (rendu) W×H"
            value={`${diag.imgW.toFixed(1)} × ${diag.imgH.toFixed(1)}`}
          />
          <DiagRow label="naturalWidth" value={diag.naturalWidth} />
          <DiagRow label="naturalHeight" value={diag.naturalHeight} />
          <DiagRow label="complete" value={diag.complete} />
          <DiagRow label="display" value={diag.display} />
          <DiagRow label="visibility" value={diag.visibility} />
          <DiagRow label="opacity" value={diag.opacity} />
          <DiagRow label="z-index" value={diag.zIndex} />
          <div className="mt-1 border-t border-white/20 pt-1">
            <span className="text-white/50">currentSrc</span>
            <p className="break-all text-lime-300">{diag.currentSrc}</p>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const illustrationContainerRef = useRef<HTMLDivElement>(null);
  const illustrationDiag = useIllustrationDiag(illustrationContainerRef);
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

          {DEBUG_MODE && <IllustrationDebugPanel diag={illustrationDiag} />}

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
              className="relative isolate w-full overflow-hidden rounded-[28px]"
              style={{
                background: [
                  `radial-gradient(circle at 16% 24%, ${colors.secondary}14, transparent 28%)`,
                  `radial-gradient(circle at 86% 68%, ${colors.primary}12, transparent 30%)`,
                  `radial-gradient(ellipse 60% 42% at 50% 42%, ${colors.glow}, transparent 70%)`,
                  "#050505",
                ].join(", "),
                boxShadow: rankSurfaceShadow(colors, { y: 30, blur: 80, spread: -30 }),
                transform: "translateZ(0)",
              }}
            >
              {/* Cale de ratio 2:3 — technique padding-top, seule méthode qui garantit
                  une hauteur DÉFINITIVE (pas d'ambiguïté flexbox) sur tous les moteurs.
                  Cause racine confirmée : la propriété `aspect-ratio` seule ne propage
                  pas de façon fiable une hauteur définitive à un enfant flex-grow
                  imbriqué (`flex-[3.4]` sur l'illustration) sous WebKit/iOS — le
                  reste de la carte (éléments `shrink-0`, dimensionnés par leur propre
                  contenu) reste inchangé, seule l'illustration s'effondre à 0px de
                  hauteur : exactement le symptôme observé ("l'illustration
                  disparaît"). Reproduit et vérifié en supprimant `aspect-ratio` dans
                  ce même environnement (Chromium) : le rect de l'<img> passe
                  précisément à 0×308 quand la hauteur du parent n'est plus garantie. */}
              <div style={{ paddingTop: "150%" }} />

              {/* Grain global — lie l'ambiance de fond et l'illustration en une seule matière.
                  `translateZ(0)` isole aussi ce calque `mix-blend-mode` dans sa propre
                  couche de composition : sans ça, WebKit/iOS peut échouer à peindre le
                  calque qu'il est censé mélanger (même bug racine que ci-dessus). */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
                style={{
                  backgroundImage: MATERIAL_GRAIN,
                  backgroundSize: "180px",
                  transform: "translateZ(0)",
                }}
              />

              <div className="absolute inset-0 flex flex-col p-4 pt-4">
                {/* En-tête — le grade seul, l'illustration porte déjà l'identité du rang */}
                <p
                  className="shrink-0 text-center text-[12px] font-extrabold uppercase leading-none tracking-[0.4em] text-white/90"
                  style={{ textShadow: rankTextGlow(colors.glow, 14) }}
                >
                  {grade}
                </p>

                {/* Nom de l'exercice — indispensable : c'est ce que le partage raconte */}
                <h2
                  className="shrink-0 text-center font-serif text-[21px] font-extrabold uppercase leading-[1.08] tracking-wide text-white"
                  style={{ textShadow: rankTextGlow(colors.glow, 18, "0 1px 6px rgba(0,0,0,0.6)") }}
                >
                  {exerciseName}
                </h2>

                {/* Illustration monumentale — dominante, mais jamais devant le texte */}
                <div
                  ref={illustrationContainerRef}
                  className="relative mt-3.5 min-h-0 flex-[3.4] overflow-visible rounded-[24px]"
                  style={
                    DEBUG_MODE ? { outline: "3px solid red", outlineOffset: "-3px" } : undefined
                  }
                >
                  <div
                    className="pointer-events-none absolute -inset-6 rounded-[40px]"
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
                  <div
                    className="relative isolate h-full w-full overflow-hidden rounded-[24px]"
                    style={{ transform: "translateZ(0)" }}
                  >
                    <RankIllustration
                      rankKey={rank.rank.key}
                      label={rank.rank.label}
                      className="absolute inset-0 h-full w-full"
                      style={
                        DEBUG_MODE
                          ? { outline: "3px solid lime", outlineOffset: "-3px" }
                          : undefined
                      }
                    />
                    {/* Grain/débris — texture procédurale partagée du système de rang */}
                    <div
                      className="pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay"
                      style={{
                        backgroundImage: MATERIAL_GRAIN,
                        backgroundSize: "160px",
                        transform: "translateZ(0)",
                      }}
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

                {/* Bloc victoire — titre de trophée, gravé dans le métal du rang */}
                <div className="mt-2 flex shrink-0 flex-col items-center">
                  <div
                    className="h-px w-14"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${colors.primary}80, transparent)`,
                    }}
                  />
                  <p
                    className="mt-1.5 bg-clip-text text-center font-serif text-[27px] italic font-extrabold uppercase leading-none tracking-[0.14em] text-transparent"
                    style={{
                      backgroundImage: rankMetallicGradient(colors),
                      filter: `drop-shadow(0 0 32px ${colors.glow}) drop-shadow(0 2px 3px rgba(0,0,0,0.5))`,
                    }}
                  >
                    Record battu
                  </p>
                </div>

                {/* Plaque de résultat — trophée métallique : bordure gravée, relief, sheen */}
                <div
                  className="relative mt-2 shrink-0 overflow-hidden rounded-2xl p-px"
                  style={{
                    background: rankMetallicGradient(colors),
                    boxShadow: "0 10px 24px -12px rgba(0,0,0,0.7)",
                  }}
                >
                  <div
                    className="relative overflow-hidden rounded-[15px] px-3 py-2"
                    style={{
                      background: "linear-gradient(180deg, #161616 0%, #0a0a0a 55%, #050505 100%)",
                      boxShadow: rankRelief(colors, 0.22),
                    }}
                  >
                    {/* Sheen — reflet diagonal discret, la signature d'une surface polie */}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.07) 50%, transparent 62%)",
                      }}
                    />
                    <div className="relative flex items-baseline justify-center">
                      <span
                        className="font-serif text-[74px] font-extrabold leading-none text-white"
                        style={{ textShadow: "0 4px 20px rgba(0,0,0,0.6)" }}
                      >
                        {best.weight > 0 ? best.weight : "—"}
                      </span>
                      <span className="ml-1 text-[11px] font-bold uppercase tracking-wide text-white/45">
                        kg
                      </span>
                      <span className="mx-2 text-[32px] font-light leading-none text-white/45">
                        ×
                      </span>
                      <span
                        className="font-serif text-[74px] font-extrabold leading-none"
                        style={{
                          color: colors.secondary,
                          textShadow: rankTextGlow(colors.glow, 26, "0 4px 20px rgba(0,0,0,0.6)"),
                        }}
                      >
                        {best.reps > 0 ? best.reps : "—"}
                      </span>
                      <span
                        className="ml-1 text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: `${colors.secondary}90` }}
                      >
                        reps
                      </span>
                    </div>
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
