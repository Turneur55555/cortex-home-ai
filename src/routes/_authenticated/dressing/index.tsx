import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ImageOff, Loader2, Plus, Shirt, Sparkles, TriangleAlert } from "lucide-react";
import {
  WARDROBE_FILTERS,
  useWardrobeItems,
  type WardrobeFilterKey,
  type WardrobeItemView,
} from "@/hooks/useWardrobe";

export const Route = createFileRoute("/_authenticated/dressing/")({
  head: () => ({
    meta: [
      { title: "Mon dressing — ICORTEX" },
      {
        name: "description",
        content: "Ton dressing ICORTEX : retrouve tes pièces, filtre-les et prépare tes tenues.",
      },
      { property: "og:title", content: "Mon dressing — ICORTEX" },
      {
        property: "og:description",
        content: "Ton dressing ICORTEX : retrouve tes pièces, filtre-les et prépare tes tenues.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DressingPage,
});

function DressingPage() {
  const { data, isLoading, isError, refetch, isFetching } = useWardrobeItems();
  const [filter, setFilter] = useState<WardrobeFilterKey>("all");

  const items = useMemo<WardrobeItemView[]>(() => data ?? [], [data]);
  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.uiCategory === filter)),
    [items, filter],
  );

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-5">
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
              Style
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Mon dressing</h1>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums">
              {isLoading ? "—" : items.length}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {items.length > 1 ? "pièces" : "pièce"}
            </p>
          </div>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          to="/dressing/ajouter"
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-card transition-opacity active:opacity-80"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Ajouter une pièce
        </Link>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Bientôt disponible"
          className="flex cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold text-muted-foreground opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          Générer une tenue
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
            Bientôt
          </span>
        </button>
      </div>

      {/* Filtres catégories */}
      <div className="-mx-5 mb-4 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2">
          {WARDROBE_FILTERS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === "all"
                ? items.length
                : items.filter((item) => item.uiCategory === f.key).length;
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
                <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-2xl border border-border bg-card"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <TriangleAlert className="mx-auto h-7 w-7 text-destructive" />
          <p className="mt-2 text-sm font-medium">Impossible de charger ton dressing</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Vérifie ta connexion puis réessaie.
          </p>
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
        <EmptyState hasItems={items.length > 0} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((item) => (
            <li key={item.id}>
              <article className="overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-card backdrop-blur-xl">
                <div className="relative aspect-[3/4] bg-muted/30">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name ?? "Pièce du dressing"}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <p className="truncate text-xs font-semibold">
                    {item.name ?? "Pièce sans nom"}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {[item.brand, item.subcategory ?? item.category].filter(Boolean).join(" · ") ||
                      "—"}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function EmptyState({ hasItems }: { hasItems: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-gradient-to-b from-card/80 to-card/40 p-8 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Shirt className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold">
        {hasItems ? "Aucune pièce dans cette catégorie" : "Ton dressing est vide"}
      </p>
      <p className="mx-auto mt-1 max-w-[16rem] text-xs text-muted-foreground">
        {hasItems
          ? "Change de filtre ou ajoute une nouvelle pièce."
          : "Ajoute tes vêtements pour composer tes tenues plus tard."}
      </p>
      <Link
        to="/dressing/ajouter"
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        Ajouter une pièce
      </Link>
    </div>
  );
}
