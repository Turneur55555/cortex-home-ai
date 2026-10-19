import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Clock, History, Shirt } from "lucide-react";
import { OutfitThumbnails } from "@/components/wardrobe/OutfitThumbnails";
import { Skeleton } from "@/components/ui/skeleton";
import { useWardrobePersonalization } from "@/hooks/useWardrobeInsights";
import type { WardrobeItemView } from "@/hooks/useWardrobe";
import { OUTFIT_CONTEXTS } from "@/lib/wardrobe/outfitEngine";
import {
  FORGOTTEN_AFTER_DAYS,
  groupHistoryByDay,
  summarizeHistory,
} from "@/lib/wardrobe/wearHistory";

export const Route = createFileRoute("/_authenticated/dressing/historique")({
  head: () => ({
    meta: [{ title: "Mon journal de style — ICORTEX" }],
  }),
  component: StyleJournalPage,
});

const CONTEXT_LABEL = new Map<string, string>(OUTFIT_CONTEXTS.map((c) => [c.value, c.label]));

function dayTitle(date: string, today: string): string {
  if (date === today) return "Aujourd'hui";
  const label = new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function StyleJournalPage() {
  const { items, history, today, forgottenItemIds, isLoading } = useWardrobePersonalization();

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const resolve = (ids: string[]) =>
    ids.map((id) => itemById.get(id)).filter((i): i is WardrobeItemView => !!i);

  const days = useMemo(() => groupHistoryByDay(history), [history]);
  const summary = useMemo(() => summarizeHistory(history, today), [history, today]);
  const mostWorn = summary.mostWornItem ? itemById.get(summary.mostWornItem.id) : undefined;
  const forgotten = resolve(forgottenItemIds);

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-5">
        <Link
          to="/dressing"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Mon dressing
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Style
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Mon journal de style</h1>
      </header>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-3xl" />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-3 gap-2">
            <Stat value={summary.outfitsLast30Days} label="tenues en 30 j" />
            <Stat value={summary.daysLoggedLast30Days} label="jours notés" />
            <Stat value={summary.distinctItemsLast30Days} label="pièces portées" />
          </section>

          {mostWorn && summary.mostWornItem && (
            <section className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <div className="w-14 shrink-0">
                <OutfitThumbnails pieces={[mostWorn]} size="sm" single />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Ta pièce fétiche du mois
                </p>
                <p className="truncate text-sm font-semibold">
                  {mostWorn.name ?? "Pièce sans nom"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Portée {summary.mostWornItem.count} fois en 30 jours
                </p>
              </div>
            </section>
          )}

          {forgotten.length > 0 && (
            <section className="mb-5 rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">
                  {forgotten.length} {forgotten.length > 1 ? "pièces oubliées" : "pièce oubliée"}
                </p>
              </div>
              <p className="mb-3 text-[11px] text-muted-foreground">
                Pas portées depuis {FORGOTTEN_AFTER_DAYS} jours : Cortex les remet en avant dans tes
                prochaines tenues.
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {forgotten.slice(0, 8).map((piece) => (
                  <Link key={piece.id} to="/dressing/$itemId" params={{ itemId: piece.id }}>
                    <OutfitThumbnails pieces={[piece]} size="sm" single />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {days.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <History className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Ton journal commence aujourd'hui</p>
              <p className="mx-auto mt-1 max-w-[22rem] text-xs text-muted-foreground">
                Chaque tenue marquée « Je la porte » s'inscrit ici. Après {FORGOTTEN_AFTER_DAYS}{" "}
                jours de suivi, Cortex repère aussi les pièces que tu oublies.
              </p>
              <Link
                to="/dressing/semaine"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"
              >
                <Shirt className="h-3.5 w-3.5" />
                Ma tenue du jour
              </Link>
            </div>
          ) : (
            <ol className="space-y-4">
              {days.map((day) => (
                <li key={day.date}>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    {dayTitle(day.date, today)}
                  </p>
                  <div className="space-y-2">
                    {day.outfits.map((outfit) => (
                      <article
                        key={outfit.id}
                        className="rounded-2xl border border-border bg-card p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-semibold">
                            {(outfit.occasion && CONTEXT_LABEL.get(outfit.occasion)) ?? "Tenue"}
                          </span>
                          {outfit.score !== null && (
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {outfit.score}%
                            </span>
                          )}
                        </div>
                        <OutfitThumbnails pieces={resolve(outfit.itemIds)} size="sm" />
                      </article>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3 text-center">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}
