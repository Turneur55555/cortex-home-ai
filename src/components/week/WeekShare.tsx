import { Loader2, Share2 } from "lucide-react";
import { useMemo } from "react";
import { ShareExportFrame, EXPORT_HEIGHT, EXPORT_WIDTH } from "@/components/share/ShareExportFrame";
import { useShareImage } from "@/components/share/useShareImage";
import { WeekShareCard } from "@/components/week/WeekShareCard";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp } from "@/lib/fitness/rpg/titleProgress";
import type { WeeklyReport } from "@/lib/fitness/weeklyReport";
import { weekShareCopy } from "@/lib/share/shareCopy";

/**
 * G28 — « Partager ma semaine » : le bouton et le nœud d'export de la page d'une semaine.
 *
 * Le rang de la signature est le Titre global du joueur (`user_stats.xp`). Tant que l'XP n'est pas
 * connue (chargement, erreur), on N'IMPRIME PAS de rang : la carte part signée du seul mot-marque
 * plutôt qu'avec un « rang de départ » faux, que l'utilisateur partagerait sans le voir.
 */
export function WeekShare({ report }: { report: WeeklyReport }) {
  const { data: stats } = useUserStats();
  const { exportRef, busy, run } = useShareImage();

  const title = useMemo(() => (stats ? titleProgressForXp(stats.xp ?? 0) : null), [stats]);
  const rank = title
    ? { key: title.title.key, label: title.title.label, grade: title.grade }
    : null;
  // Sans rang connu, les couleurs de la carte restent celles du premier rang — jamais un rang affiché.
  const copy = weekShareCopy(report);

  return (
    <>
      <button
        type="button"
        onClick={() => void run({ ...copy, width: EXPORT_WIDTH, height: EXPORT_HEIGHT })}
        disabled={busy !== null}
        aria-busy={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
      >
        {busy !== null ? (
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        ) : (
          <Share2 aria-hidden className="h-4 w-4" />
        )}
        Partager ma semaine
      </button>

      <ShareExportFrame exportRef={exportRef} rank={rank}>
        <WeekShareCard report={report} rankKey={title?.title.key ?? "mortel"} />
      </ShareExportFrame>
    </>
  );
}
