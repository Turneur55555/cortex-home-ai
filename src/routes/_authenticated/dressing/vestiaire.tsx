import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Images, Leaf, Loader2, Plus, Shirt, TriangleAlert } from "lucide-react";
import {
  WARDROBE_FILTERS,
  useWardrobeItems,
  type WardrobeFilterKey,
  type WardrobeItemView,
} from "@/hooks/useWardrobe";
import { useWardrobePersonalization } from "@/hooks/useWardrobeInsights";
import { DressingTabs } from "@/components/wardrobe/DressingTabs";
import { MaintenanceBanner } from "@/components/wardrobe/MaintenanceBanner";
import { MissingPiecesCard } from "@/components/wardrobe/MissingPiecesCard";
import { PieceTile } from "@/components/wardrobe/OutfitLook";

export const Route = createFileRoute("/_authenticated/dressing/vestiaire")({
  head: () => ({
    meta: [
      { title: "Mon vestiaire — ICORTEX" },
      { name: "description", content: "Toutes tes pièces, ce qui est de saison et ce qui manque." },
    ],
  }),
  component: VestiairePage,
});

const SEASON_LABEL: Record<string, string> = {
  printemps: "Ce printemps",
  ete: "Cet été",
  automne: "Cet automne",
  hiver: "Cet hiver",
};

function inSeason(item: WardrobeItemView, season: string): boolean {
  return item.seasons.length === 0 || item.seasons.includes(season);
}

function wornBadge(days: number | undefined): string | null {
  if (days === 0) return "Portée aujourd'hui";
  if (days === 1) return "Portée hier";
  return null;
}

function VestiairePage() {
  const { data, isLoading, isError, refetch, isFetching } = useWardrobeItems();
  const { suggestions, season, engineOptions } = useWardrobePersonalization();
  const [filter, setFilter] = useState<WardrobeFilterKey | "season">("all");

  const items = useMemo<WardrobeItemView[]>(() => data ?? [], [data]);
  const seasonal = useMemo(() => items.filter((i) => inSeason(i, season)), [items, season]);
  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "season") return seasonal;
    return items.filter((item) => item.uiCategory === filter);
  }, [items, seasonal, filter]);
  const seasonalTops = seasonal.filter((i) => i.category === "top").length;
  const seasonalBottoms = seasonal.filter((i) => i.category === "bottom").length;

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,calc(env(safe-area-inset-top)+0.5rem))]">
      <header>
        <Link
          to="/profil"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Profil
        </Link>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Mon dressing
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Vestiaire</h1>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums">{isLoading ? "—" : items.length}</p>
            <p className="text-[11px] text-muted-foreground">
              {items.length > 1 ? "pièces" : "pièce"}
            </p>
          </div>
        </div>
      </header>

      <DressingTabs active="vestiaire" />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Link
          to="/dressing/ajouter"
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground shadow-card transition-opacity active:opacity-80"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Ajouter
        </Link>
        <Link
          to="/dressing/import"
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-sm font-semibold transition-opacity active:opacity-80"
        >
          <Images className="h-4 w-4" />
          Plusieurs pièces
        </Link>
      </div>

      {!isLoading && items.length > 0 && (
        <div className="mb-4 space-y-3">
          <MaintenanceBanner items={items} />
          <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                  {SEASON_LABEL[season]}
                </p>
                <p className="mt-0.5 text-base font-bold">
                  {seasonal.length} pièce{seasonal.length > 1 ? "s" : ""} portable
                  {seasonal.length > 1 ? "s" : ""}{" "}
                  <span className="text-sm font-medium text-muted-foreground">
                    sur {items.length}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {seasonalTops} haut{seasonalTops > 1 ? "s" : ""} · {seasonalBottoms} bas
                </p>
              </div>
              <Leaf className="h-5 w-5 shrink-0 text-primary" />
            </div>
            {seasonalBottoms > 0 && seasonalBottoms < 4 && (
              <p className="mt-2.5 flex items-start gap-1.5 text-xs text-amber-300">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {seasonalBottoms === 1
                  ? "Un seul bas de saison : il revient chaque jour."
                  : `Seulement ${seasonalBottoms} bas de saison : ils reviennent plusieurs fois par semaine.`}
              </p>
            )}
          </section>
          <MissingPiecesCard suggestions={suggestions} limit={1} />
        </div>
      )}

      <div className="-mx-5 mb-4 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2">
          {[
            { key: "season" as const, label: "De saison", count: seasonal.length },
            ...WARDROBE_FILTERS.map((f) => ({
              key: f.key,
              label: f.label,
              count:
                f.key === "all"
                  ? items.length
                  : items.filter((item) => item.uiCategory === f.key).length,
            })),
          ].map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {f.label}
                <span className="ml-1.5 tabular-nums opacity-70">{f.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <TriangleAlert className="mx-auto h-7 w-7 text-destructive" />
          <p className="mt-2 text-sm font-medium">Impossible de charger ton dressing</p>
          <p className="mt-1 text-xs text-muted-foreground">Vérifie ta connexion puis réessaie.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold"
          >
            {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Réessayer
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Shirt className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-semibold">
            {items.length > 0 ? "Aucune pièce dans cette catégorie" : "Ton dressing est vide"}
          </p>
          <p className="mx-auto mt-1 max-w-[16rem] text-xs text-muted-foreground">
            {items.length > 0
              ? "Change de filtre ou ajoute une nouvelle pièce."
              : "Ajoute tes vêtements : Cortex te prépare une tenue chaque matin."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {visible.map((item) => (
            <li key={item.id}>
              <Link
                to="/dressing/$itemId"
                params={{ itemId: item.id }}
                className="block transition-opacity active:opacity-80"
              >
                <PieceTile
                  piece={item}
                  badge={wornBadge(engineOptions.daysSinceWorn?.get(item.id))}
                  className="rounded-2xl"
                />
                <p className="mt-1.5 truncate px-0.5 text-[11px] font-medium text-foreground/90">
                  {item.name ?? "Pièce sans nom"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
