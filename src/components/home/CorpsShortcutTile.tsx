import { Link } from "@tanstack/react-router";
import { ChevronRight, PersonStanding } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBodyMeasurements } from "@/hooks/use-fitness";
import { useLocalToday } from "@/hooks/useLocalToday";
import { findLatestValue } from "@/lib/fitness/body";
import { relativeDaysLabel } from "@/lib/fitness/todayCard";

/**
 * Raccourci vers Corps, sur l'Accueil — gardé à la demande de Nathan (30/09/2026) :
 * il ne coûte aucun onglet (la barre reste à quatre) et donne un second chemin
 * vers Corps, qui reste rangé dans Profil.
 *
 * Ne dit que ce qui se lit dans les mesures : le dernier poids et sa date. Aucun
 * objectif, aucune tendance interprétée — ils vivent sur l'écran Corps.
 *
 * `useBodyMeasurements` lit le serveur directement (il n'est pas offline-first) :
 * hors connexion la requête échoue et `data` reste vide. Ce n'est PAS « aucune
 * mesure » — dire « Ajoute ta première mesure » à quelqu'un qui en a cent serait
 * faux. En erreur, la tuile se contente de mener à Corps.
 */
export function CorpsShortcutTile() {
  const { data, isLoading, isError } = useBodyMeasurements();
  const today = useLocalToday();

  const latestWeight = findLatestValue(data, "weight");
  const latestDate = data?.find((d) => d.weight != null)?.date ?? null;

  return (
    <Link
      to="/corps"
      aria-label="Corps"
      className="mt-4 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3.5 active:scale-[0.99]"
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
      >
        <PersonStanding className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">Corps</span>
        {isLoading ? (
          <Skeleton className="mt-1 h-3.5 w-32" />
        ) : isError ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">Voir mes mesures</span>
        ) : latestWeight == null ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Ajoute ta première mesure
          </span>
        ) : (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {latestWeight.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg
            {latestDate ? ` · ${relativeDaysLabel(latestDate, today)}` : ""}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
