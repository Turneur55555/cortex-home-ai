import { Link } from "@tanstack/react-router";
import { ChevronRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useBodyMeasurements } from "@/hooks/use-fitness";
import { useLocalToday } from "@/hooks/useLocalToday";
import { usePhysicalGoal } from "@/hooks/usePhysicalGoal";
import { detectPlateau, findLatestValue, findPreviousValue } from "@/lib/fitness/body";
import { formatSignedKg, formatWeightKg, summarizeGoal } from "@/lib/fitness/physicalGoalSummary";
import { relativeDaysLabel } from "@/lib/fitness/todayCard";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * L'entrée de Corps dans Profil — la porte unique (E19 : Corps reste rangé dans Profil, aucun onglet
 * de plus). Décision produit du 06/07/2026 : Corps ne reprend PAS l'identité RPG Reliquary
 * (contrairement aux Trophées). Ton factuel, premium mais calme. Réutilise les sélecteurs purs déjà
 * écrits pour `CorpsTab` (`lib/fitness/body.ts`).
 *
 * Avec un objectif physique actif, il passe EN TÊTE : on lit « Perte de gras · depuis 7 semaines —
 * −4,2 kg sur −6 kg » sans rien ouvrir (il était enterré dans la page Santé). Uniquement des faits :
 * le poids de départ, la cible et la dernière pesée (`lib/fitness/physicalGoalSummary.ts`) — aucune
 * projection, qui dépend du TDEE adaptatif et reste dans l'onglet Objectif de Corps.
 *
 * `useBodyMeasurements` lit le serveur directement (il n'est pas offline-first) : hors connexion la
 * requête échoue et `data` reste vide. Ce n'est PAS « aucune mesure » — on mène alors simplement à Corps.
 */
export function BodyStatusCard() {
  const { data, isLoading, isError } = useBodyMeasurements();
  const { data: goal } = usePhysicalGoal();
  const today = useLocalToday();

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

  const summary = goal
    ? summarizeGoal({
        goal: goal.goal,
        startedAt: goal.startedAt,
        startingWeightKg: goal.startingWeightKg,
        targetWeightKg: goal.targetWeightKg,
        currentWeightKg: latestWeight ?? null,
        todayDate: today,
      })
    : null;

  const weighedLine = latestDate
    ? `pesée ${relativeDaysLabel(latestDate, today)}${plateau ? " · plateau détecté" : ""}`
    : "Aucune mesure récente";

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Mon corps
        </h2>
      </div>

      <Link
        to="/corps"
        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-card transition-colors hover:border-primary/30"
      >
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : summary !== null ? (
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              {summary.label} · {summary.sinceLabel}
            </p>
            {isError ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Voir mes mesures</p>
            ) : (
              <>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-[28px] font-extrabold leading-none tracking-tight tabular-nums">
                    {summary.changeKg !== null ? formatSignedKg(summary.changeKg) : "—"}
                  </span>
                  {summary.changeKg !== null && (
                    <span className="text-xs font-bold text-primary">kg</span>
                  )}
                  {summary.targetChangeKg !== null && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      sur {formatSignedKg(summary.targetChangeKg)} kg
                    </span>
                  )}
                </div>
                {summary.progress !== null && (
                  <div
                    role="progressbar"
                    aria-label="Progression vers l'objectif"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(summary.progress * 100)}
                    className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10"
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(summary.progress * 100)}%` }}
                    />
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {latestWeight != null
                    ? `${formatWeightKg(latestWeight)} kg · ${weighedLine}`
                    : "Ajoute ta première pesée dans Corps"}
                </p>
              </>
            )}
          </div>
        ) : isError ? (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Corps</p>
            <p className="text-xs text-muted-foreground">Voir mes mesures</p>
          </div>
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
                  {delta < 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <TrendingUp className="h-3 w-3" />
                  )}
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
              {latestDate
                ? `Mise à jour ${relativeDaysLabel(latestDate, today)}${plateau ? " · plateau détecté" : ""}`
                : "Aucune mesure récente"}
            </p>
          </div>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </section>
  );
}
