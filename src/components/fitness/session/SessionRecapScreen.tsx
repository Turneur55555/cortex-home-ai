import { useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2, Share2 } from "lucide-react";
import { Portal } from "@/components/Portal";
import { SessionRecapCard } from "@/components/fitness/session/SessionRecapCard";
import { EXPORT_HEIGHT, EXPORT_WIDTH, ShareExportFrame } from "@/components/share/ShareExportFrame";
import { useShareImage } from "@/components/share/useShareImage";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp } from "@/lib/fitness/rpg/titleProgress";
import { formatRecapDate, type SessionRecap } from "@/lib/fitness/rpg/sessionRecap";
import { sessionShareCopy } from "@/lib/share/shareCopy";

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
 * en téléchargement si le partage natif de fichiers est indisponible
 * (`lib/share/shareImage.ts`, commun à toutes les cartes). Le pied de carte signé
 * « Cortex » est ajouté par le cadre d'export ; le rang n'y est pas répété, la
 * carte porte déjà son bandeau Rang/Grade.
 */
export function SessionRecapScreen({
  recap,
  date,
  prCount,
  onFinish,
}: {
  recap: SessionRecap;
  /** Date de la séance (défaut : aujourd'hui). */
  date?: Date;
  /** Nombre de records personnels battus pendant CETTE séance (système
   *  existant `computeRecordsBySession`, cf. SeancesTab.tsx). */
  prCount: number;
  onFinish: () => void;
}) {
  const { exportRef, busy, run } = useShareImage();
  const { data: stats } = useUserStats();
  const progress = titleProgressForXp(stats?.xp ?? 0);

  const dateLabel = useMemo(() => formatRecapDate(date ?? new Date()), [date]);

  const cardProps = {
    recap,
    dateLabel,
    prCount,
    rankKey: progress.title.key,
    rankLabel: progress.title.label,
    grade: progress.grade,
  };

  function handleShare() {
    void run({ ...sessionShareCopy(recap), width: EXPORT_WIDTH, height: EXPORT_HEIGHT });
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
              disabled={busy !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy !== null ? (
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
        <ShareExportFrame exportRef={exportRef}>
          <SessionRecapCard {...cardProps} variant="export" />
        </ShareExportFrame>
      </div>
    </Portal>
  );
}
