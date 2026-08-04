import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import { Loader2, Share2 } from "lucide-react";
import { Portal } from "@/components/Portal";
import { SessionRecapCard } from "@/components/fitness/session/SessionRecapCard";
import { useExerciseImageUrls } from "@/hooks/use-fitness";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp } from "@/lib/fitness/rpg/titleProgress";
import { formatRecapDate, type SessionRecap } from "@/lib/fitness/rpg/sessionRecap";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * 2e écran du flow de fin de séance (après l'écran XP/progression, qui
 * reste inchangé) : la carte récap partageable, puis « Terminer ».
 *
 * Aucune donnée nouvelle : le récap vient du snapshot de la séance déjà en
 * mémoire (`buildSessionRecap`), le rang/grade du système existant
 * (`user_stats.xp` → `titleProgressForXp`), les vignettes des mêmes URLs
 * signées que le reste de l'app.
 *
 * Partage : on capture UNIQUEMENT un nœud dédié 9:16 (1080×1920 après
 * pixelRatio 2), rendu hors écran — jamais une capture de l'écran. Repli
 * en téléchargement si le partage natif de fichiers est indisponible.
 */
export function SessionRecapScreen({
  recap,
  date,
  onFinish,
}: {
  recap: SessionRecap;
  /** Date de la séance (défaut : aujourd'hui). */
  date?: Date;
  onFinish: () => void;
}) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: stats } = useUserStats();
  const progress = titleProgressForXp(stats?.xp ?? 0);

  const paths = useMemo(
    () => recap.exercises.map((e) => e.imagePath).filter(Boolean),
    [recap.exercises],
  );
  const { data: imageUrls } = useExerciseImageUrls(paths);
  const dateLabel = useMemo(() => formatRecapDate(date ?? new Date()), [date]);

  const cardProps = {
    recap,
    dateLabel,
    imageUrls,
    rankKey: progress.title.key,
    rankLabel: progress.title.label,
    grade: progress.grade,
  };

  async function handleShare() {
    if (!exportRef.current || busy) return;
    setBusy(true);
    try {
      // cacheBust volontairement désactivé : il ajoute un paramètre d'URL
      // qui invaliderait la signature des URLs signées Supabase.
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        backgroundColor: "#050505",
        width: 540,
        height: 960,
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "icortex-seance.png", { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
        share?: (d: ShareData) => Promise<void>;
      };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({
          files: [file],
          title: "Séance terminée — iCortex",
          text: `${recap.totalSets} séries · ${recap.totalVolumeKg.toLocaleString("fr-FR")} kg 💪`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "icortex-seance.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      /* partage annulé ou capture impossible — l'écran reste utilisable */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/85 px-4 py-8 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="w-full max-w-sm"
          style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
        >
          <SessionRecapCard {...cardProps} />

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleShare}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Partager
            </button>
            <button
              type="button"
              onClick={onFinish}
              className="flex-1 rounded-xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow"
            >
              Terminer
            </button>
          </div>
        </motion.div>

        {/* Nœud d'export 9:16 — hors écran, capturé seul (jamais l'écran) */}
        <div
          aria-hidden
          className="pointer-events-none fixed left-[-10000px] top-0"
          style={{ width: 540, height: 960 }}
        >
          <div
            ref={exportRef}
            className="flex h-full w-full flex-col items-center justify-center px-8"
            style={{ background: "linear-gradient(180deg, #0a0908 0%, #050505 100%)" }}
          >
            <SessionRecapCard {...cardProps} variant="export" />
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.42em] text-white/35">
              iCortex
            </p>
          </div>
        </div>
      </div>
    </Portal>
  );
}
