import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Loader2, Scissors, Square } from "lucide-react";
import { PieceTile } from "@/components/wardrobe/OutfitLook";
import { Skeleton } from "@/components/ui/skeleton";
import { useWardrobeItems, type WardrobeItemView } from "@/hooks/useWardrobe";
import { useApplyWardrobeFixes, useBatchDetourage } from "@/hooks/useWardrobeMaintenance";
import {
  detectWardrobeFixes,
  itemsWithoutCutout,
  type WardrobeFix,
} from "@/lib/wardrobe/dataQuality";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dressing/remise-a-niveau")({
  head: () => ({ meta: [{ title: "Remise à niveau — ICORTEX" }] }),
  component: MaintenancePage,
});

const KIND_TITLE: Record<WardrobeFix["kind"], string> = {
  name: "Nom",
  subcategory: "Type",
  color: "Couleur",
  seasons: "Saisons",
};

function MaintenancePage() {
  const { data, isLoading } = useWardrobeItems();
  const items = useMemo<WardrobeItemView[]>(() => data ?? [], [data]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const toDetour = useMemo(() => itemsWithoutCutout(items), [items]);
  const fixes = useMemo(() => detectWardrobeFixes(items), [items]);
  const detour = useBatchDetourage();
  const apply = useApplyWardrobeFixes();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const pending = fixes.filter((f) => !skipped.has(f.key));
  const direct = pending.filter((f) => f.patch);
  const detoured = items.length - toDetour.length;
  const sample = toDetour.slice(0, 2);

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,calc(env(safe-area-inset-top)+0.5rem))]">
      <header className="mb-4">
        <Link
          to="/dressing/vestiaire"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Vestiaire
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Quelques minutes, une seule fois
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Remise à niveau</h1>
      </header>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-3xl" />
      ) : (
        <div className="space-y-3">
          <section className="rounded-3xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold">Détourer tes photos</h2>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">{detoured}</span> /{" "}
                {items.length} faites
              </p>
            </div>
            {toDetour.length === 0 ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                Toutes tes photos sont détourées.
              </p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {sample.map((p) => (
                    <PieceTile key={p.id} piece={p} className="rounded-xl" />
                  ))}
                </div>
                {detour.running && (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${detour.progress.total ? ((detour.progress.done + detour.progress.failed.length) / detour.progress.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {detour.progress.done + detour.progress.failed.length} /{" "}
                      {detour.progress.total}
                      {detour.progress.currentId &&
                        ` · ${itemById.get(detour.progress.currentId)?.name ?? "pièce"}`}
                    </p>
                  </div>
                )}
                {detour.running ? (
                  <button
                    type="button"
                    onClick={detour.stop}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold"
                  >
                    <Square className="h-3.5 w-3.5" />
                    Arrêter après cette photo
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void detour.run(toDetour)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-opacity active:opacity-80"
                  >
                    <Scissors className="h-4 w-4" />
                    Détourer{" "}
                    {toDetour.length > 1 ? `les ${toDetour.length} restantes` : "la dernière"}
                  </button>
                )}
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  Sur ton téléphone, comme à l'ajout : aucune photo envoyée à un service tiers.
                  Garde l'écran ouvert ; l'original reste toujours conservé.
                </p>
              </>
            )}
          </section>

          <section className="rounded-3xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-bold">Corrections proposées</h2>
            {pending.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                Rien à corriger.
              </p>
            ) : (
              <ul className="space-y-3">
                {pending.map((fix) => {
                  const piece = itemById.get(fix.itemId);
                  return (
                    <li key={fix.key} className="flex items-start gap-3">
                      {piece && <PieceTile piece={piece} className="w-11 shrink-0 rounded-lg" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {KIND_TITLE[fix.kind]}
                        </p>
                        <p className="truncate text-xs font-semibold">{fix.title}</p>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          {fix.detail}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {fix.patch ? (
                            <button
                              type="button"
                              disabled={apply.isPending}
                              onClick={() =>
                                apply.mutate([{ itemId: fix.itemId, patch: fix.patch! }])
                              }
                              className="rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary disabled:opacity-50"
                            >
                              Corriger
                            </button>
                          ) : (
                            fix.choices.map((choice) => (
                              <button
                                key={choice.label}
                                type="button"
                                disabled={apply.isPending}
                                onClick={() =>
                                  apply.mutate([{ itemId: fix.itemId, patch: choice.patch }])
                                }
                                className="rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary disabled:opacity-50"
                              >
                                {choice.label}
                              </button>
                            ))
                          )}
                          <button
                            type="button"
                            onClick={() => setSkipped((prev) => new Set(prev).add(fix.key))}
                            className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground"
                          >
                            Ignorer
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {direct.length > 1 && (
              <button
                type="button"
                disabled={apply.isPending}
                onClick={() =>
                  apply.mutate(direct.map((f) => ({ itemId: f.itemId, patch: f.patch! })))
                }
                className={cn(
                  "mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold disabled:opacity-50",
                )}
              >
                {apply.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Tout corriger ({direct.length})
              </button>
            )}
            {pending.some((f) => !f.patch) && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Les questions de couleur se tranchent une par une.
              </p>
            )}
          </section>

          <Link
            to="/dressing"
            className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-muted-foreground"
          >
            Voir ma tenue du jour
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </main>
  );
}
