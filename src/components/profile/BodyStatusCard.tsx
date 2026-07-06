import { Link } from "@tanstack/react-router";
import { ChevronRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useBodyMeasurements } from "@/hooks/use-fitness";
import { detectPlateau, findLatestValue, findPreviousValue } from "@/lib/fitness/body";
import { Skeleton } from "@/components/ui/skeleton";

function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr + "T00:00:00").getTime()) / 86_400_000);
  if (diff <= 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  return `il y a ${diff}j`;
}

/**
 * Carte de résumé sobre pour la sous-page Corps — décision produit du
 * 06/07/2026 : Corps ne reprend PAS l'identité RPG Reliquary (contrairement
 * aux Trophées). Ton factuel, premium mais calme. Réutilise les sélecteurs
 * purs déjà écrits pour `CorpsTab` (`lib/fitness/body.ts`), aucun nouveau
 * calcul métier.
 */
export function BodyStatusCard() {
  const { data, isLoading } = useBodyMeasurements();

  const latestWeight = findLatestValue(data, "weight");
  const previousWeight = findPreviousValue(data, "weight");
  const latestDate = data?.find((d) => d.weight != null)?.date;
  const plateau = data
    ? detectPlateau(
        data.map((d) => ({ date: d.date, weight: d.weight })),
        21,
        0.3,
      )
    : false;

  const delta =
    latestWeight != null && previousWeight != null
      ? Math.round((latestWeight - previousWeight) * 10) / 10
      : null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          État du corps
        </h2>
      </div>

      <Link
        to="/corps"
        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-card transition-colors hover:border-primary/30"
      >
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : latestWeight == null ? (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Aucune mesure enregistrée</p>
            <p className="text-xs text-muted-foreground">Ajoute ta première mesure dans Corps</p>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tabular-nums">{latestWeight} kg</span>
              {delta != null && delta !== 0 && (
                <span
                  className={`flex items-center gap-0.5 text-xs font-semibold ${
                    delta < 0 ? "text-success" : "text-amber-500"
                  }`}
                >
                  {delta < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                  {delta > 0 ? "+" : ""}
                  {delta} kg
                </span>
              )}
              {delta === 0 && (
                <span className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
                  <Minus className="h-3 w-3" /> stable
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {latestDate ? `Mise à jour ${daysAgo(latestDate)}` : "Aucune mesure récente"}
              {plateau && " · plateau détecté"}
            </p>
          </div>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </section>
  );
}
