import { Link } from "@tanstack/react-router";
import { SanteView } from "@/components/corps/SanteView";
import { Skeleton } from "@/components/ui/skeleton";
import { usePhysicalGoal } from "@/hooks/usePhysicalGoal";
import {
  CORPS_TAB_KEYS,
  CORPS_TAB_LABELS,
  resolveCorpsTab,
  type CorpsTabKey,
} from "@/lib/fitness/corpsTabs";
import { cn } from "@/lib/utils";
import { CorpsTab } from "@/routes/_authenticated/fitness/CorpsTab";

/**
 * L'écran Corps : trois onglets — Objectif | Mesures | Santé (E19). Corps reste rangé dans Profil
 * (aucun onglet de plus dans la barre) ; l'onglet Profil reste allumé pendant toute la visite.
 *
 * Chaque onglet est un LIEN (`/corps?onglet=`) : retour arrière, lien direct, rechargement. Basculer
 * REMPLACE l'entrée d'historique — ce sont des pairs, le retour arrière ne doit pas rejouer chaque
 * bascule.
 *
 * Sans onglet demandé, l'écran attend de savoir s'il existe un objectif actif (voir
 * `resolveCorpsTab`) : afficher « Mesures » une demi-seconde avant de basculer sur « Objectif »
 * ferait clignoter l'écran.
 */
export function CorpsScreen({ onglet }: { onglet: CorpsTabKey | undefined }) {
  const { data: goal, isLoading } = usePhysicalGoal();
  const waitingForDefault = onglet === undefined && isLoading;
  const active = resolveCorpsTab(onglet, goal != null);

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-[max(2.75rem,calc(env(safe-area-inset-top)+0.75rem))]">
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Corps</h1>
      </header>

      <nav
        aria-label="Corps"
        className="mb-5 flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1"
      >
        {CORPS_TAB_KEYS.map((key) => (
          <Link
            key={key}
            to="/corps"
            search={{ onglet: key }}
            replace
            aria-current={!waitingForDefault && active === key ? "page" : undefined}
            className={cn(
              "flex flex-1 items-center justify-center rounded-full py-2 text-[13px] font-semibold transition-colors",
              !waitingForDefault && active === key
                ? "bg-white text-black"
                : "text-white/60 hover:text-white/85",
            )}
          >
            {CORPS_TAB_LABELS[key]}
          </Link>
        ))}
      </nav>

      {waitingForDefault ? (
        <Skeleton className="h-48 w-full rounded-2xl" aria-busy="true" />
      ) : active === "objectif" ? (
        <SanteView part="objectif" />
      ) : active === "sante" ? (
        <SanteView part="sante" />
      ) : (
        <CorpsTab />
      )}
    </main>
  );
}
