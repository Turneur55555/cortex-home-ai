import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Check, ChevronLeft, Footprints, History, RefreshCw } from "lucide-react";
import { MissingPiecesCard } from "@/components/wardrobe/MissingPiecesCard";
import { OutfitThumbnails } from "@/components/wardrobe/OutfitThumbnails";
import { Skeleton } from "@/components/ui/skeleton";
import { useSaveOutfit } from "@/hooks/useOutfitGenerator";
import { useWeeklyOutfits } from "@/hooks/useWardrobeInsights";
import type { WardrobeItemView } from "@/hooks/useWardrobe";
import { addDaysYMD } from "@/lib/dates";
import { OUTFIT_CONTEXTS, isOutfitContext } from "@/lib/wardrobe/outfitEngine";
import type { WeekDayPlan } from "@/lib/wardrobe/weeklyOutfits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dressing/semaine")({
  head: () => ({
    meta: [{ title: "Mes tenues de la semaine — ICORTEX" }],
  }),
  component: WeekOutfitsPage,
});

function dayLabel(date: string): string {
  const label = new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function weekRangeLabel(weekStart: string): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", opts);
  return `Du ${fmt(weekStart, { day: "numeric" })} au ${fmt(addDaysYMD(weekStart, 6), { day: "numeric", month: "long" })}`;
}

function WeekOutfitsPage() {
  const { weekStart, days, personalization, setDayContext, rerollDay } = useWeeklyOutfits();
  const { items, isLoading, suggestions, forgottenItemIds } = personalization;

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const resolve = (ids: string[]) =>
    ids.map((id) => itemById.get(id)).filter((i): i is WardrobeItemView => !!i);

  const wornCount = days.filter((d) => d.status === "worn").length;

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
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {weekRangeLabel(weekStart)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Mes tenues de la semaine</h1>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums">{wornCount}/7</p>
            <p className="text-[11px] text-muted-foreground">portées</p>
          </div>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {days.map((d) => (
            <span
              key={d.date}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                d.status === "worn" ? "bg-primary" : d.isToday ? "bg-primary/40" : "bg-muted",
              )}
            />
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-3xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Ton dressing est vide</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajoute quelques hauts et bas pour que Cortex prépare ta semaine.
          </p>
          <Link
            to="/dressing/ajouter"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"
          >
            Ajouter une pièce
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <WeekDayCard
              key={day.date}
              day={day}
              resolve={resolve}
              forgottenIds={forgottenItemIds}
              onContext={(c) => setDayContext(day.date, c)}
              onReroll={() => rerollDay(day.date)}
            />
          ))}
          <p className="px-1 text-[11px] leading-snug text-muted-foreground">
            Aucun haut ni bas ne revient deux fois dans la semaine quand ton dressing le permet. Les
            pièces portées ces derniers jours et hors saison passent après les autres.
          </p>
          <MissingPiecesCard suggestions={suggestions} />
          <Link
            to="/dressing/historique"
            className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold"
          >
            <History className="h-4 w-4" />
            Mon journal de style
          </Link>
        </div>
      )}
    </main>
  );
}

function WeekDayCard({
  day,
  resolve,
  forgottenIds,
  onContext,
  onReroll,
}: {
  day: WeekDayPlan;
  resolve: (ids: string[]) => WardrobeItemView[];
  forgottenIds: string[];
  onContext: (context: WeekDayPlan["context"]) => void;
  onReroll: () => void;
}) {
  const saveOutfit = useSaveOutfit();
  const [justWorn, setJustWorn] = useState(false);
  const past = day.status === "missed";

  async function wear() {
    if (!day.outfit) return;
    try {
      await saveOutfit.mutateAsync({ outfit: day.outfit, context: day.context, wornNow: true });
      setJustWorn(true);
    } catch {
      // Le toast d'erreur est déjà géré par useSaveOutfit.
    }
  }

  const pieces =
    day.status === "worn" && day.worn
      ? resolve(day.worn.itemIds)
      : day.outfit
        ? resolve(day.outfit.items.map((i) => i.id))
        : [];

  return (
    <article
      className={cn(
        "overflow-hidden rounded-3xl border bg-card",
        day.isToday ? "border-primary/40 shadow-card" : "border-border",
        past && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-sm font-semibold">{dayLabel(day.date)}</p>
          {day.isToday && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
              Aujourd'hui
            </span>
          )}
        </div>
        {day.status === "worn" ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Portée
          </span>
        ) : past ? null : (
          <select
            aria-label={`Contexte du ${dayLabel(day.date)}`}
            value={day.context}
            onChange={(e) => {
              if (isOutfitContext(e.target.value)) onContext(e.target.value);
            }}
            className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
          >
            {OUTFIT_CONTEXTS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {past ? (
        <p className="px-4 pb-3.5 pt-1 text-xs text-muted-foreground">Pas de tenue notée.</p>
      ) : day.status === "unavailable" ? (
        <p className="px-4 pb-3.5 pt-1 text-xs text-muted-foreground">{day.reason}</p>
      ) : (
        <>
          <div className="px-4 py-3">
            <OutfitThumbnails
              pieces={pieces}
              forgottenIds={day.status === "planned" ? forgottenIds : undefined}
              size="sm"
            />
          </div>
          {day.status === "planned" && day.outfit && (
            <>
              <p className="px-4 text-[11px] leading-snug text-muted-foreground">
                {day.outfit.explanation}
              </p>
              <div className="mt-3 flex items-center gap-2 border-t border-border px-4 py-2.5">
                {day.outfit.missing.includes("chaussures") && (
                  <Footprints
                    aria-label="Sans chaussures"
                    className="h-3.5 w-3.5 shrink-0 text-amber-500"
                  />
                )}
                {day.poolSize > 1 && (
                  <button
                    type="button"
                    onClick={onReroll}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Autre tenue
                  </button>
                )}
                {day.isToday && (
                  <button
                    type="button"
                    onClick={() => void wear()}
                    disabled={saveOutfit.isPending || justWorn}
                    className="ml-auto rounded-xl bg-primary px-4 py-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {justWorn ? "Enregistrée ✓" : "Je la porte"}
                  </button>
                )}
              </div>
            </>
          )}
          {day.status === "worn" && <div className="h-1" />}
        </>
      )}
    </article>
  );
}
