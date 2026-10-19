import { useCallback, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Footprints, Heart, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { MissingPiecesCard } from "@/components/wardrobe/MissingPiecesCard";
import { OutfitThumbnails } from "@/components/wardrobe/OutfitThumbnails";
import { useGenerateOutfits, useOutfitFeedback, useSaveOutfit } from "@/hooks/useOutfitGenerator";
import { useWardrobePersonalization } from "@/hooks/useWardrobeInsights";
import {
  OUTFIT_CONTEXTS,
  type GeneratedOutfit,
  type OutfitContext,
} from "@/lib/wardrobe/outfitEngine";
import type { WardrobeItemView } from "@/hooks/useWardrobe";

export const Route = createFileRoute("/_authenticated/dressing/generer")({
  head: () => ({
    meta: [{ title: "Générer une tenue — ICORTEX" }],
  }),
  component: GenerateOutfitPage,
});

/** Nombre de tenues calculées en amont, pour pouvoir proposer "Nouvelle tenue" sans re-générer. */
const POOL_SIZE = 9;
const VISIBLE_COUNT = 3;

function GenerateOutfitPage() {
  const navigate = useNavigate();
  const { generate, resolveItem, isLoading, wardrobeCount } = useGenerateOutfits();
  const { engineOptions, suggestions } = useWardrobePersonalization();

  const [context, setContext] = useState<OutfitContext | null>(null);
  const [pool, setPool] = useState<GeneratedOutfit[]>([]);
  const [visibleIndexes, setVisibleIndexes] = useState<number[]>([]);
  const [poorDataMessage, setPoorDataMessage] = useState<string | null>(null);

  function handleGenerate(selected: OutfitContext) {
    setContext(selected);
    // Saison courante, rotation (pièces portées récemment), goûts 👍 et pièces
    // oubliées : la tenue proposée change avec ce que tu as réellement porté.
    const result = generate(selected, { ...engineOptions, maxResults: POOL_SIZE });
    if (!result.ok) {
      setPool([]);
      setVisibleIndexes([]);
      setPoorDataMessage(result.reason);
      return;
    }
    setPoorDataMessage(null);
    setPool(result.outfits);
    setVisibleIndexes(result.outfits.map((_, i) => i).slice(0, VISIBLE_COUNT));
  }

  const cycleSlot = useCallback(
    (slot: number) => {
      setVisibleIndexes((prev) => {
        const used = new Set(prev);
        let next = (prev[slot] + 1) % pool.length;
        // Cherche la prochaine tenue du pool pas déjà affichée ailleurs.
        while (used.has(next) && next !== prev[slot]) {
          next = (next + 1) % pool.length;
        }
        const updated = [...prev];
        updated[slot] = next;
        return updated;
      });
    },
    [pool.length],
  );

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-6">
        <Link
          to="/dressing"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Mon dressing
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Générer une tenue</h1>
      </header>

      {/* Choix du contexte — volontairement petit, pas un gros panneau de filtres */}
      <div className="mb-6">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Contexte
        </p>
        <div className="flex flex-wrap gap-2">
          {OUTFIT_CONTEXTS.map((c) => {
            const active = context === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => handleGenerate(c.value)}
                disabled={isLoading}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  active
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {!context ? (
        <p className="text-sm text-muted-foreground">
          Choisis un contexte pour que Cortex compose des tenues à partir de ton dressing (
          {wardrobeCount} {wardrobeCount > 1 ? "pièces" : "pièce"}).
        </p>
      ) : poorDataMessage ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <TriangleAlert className="mx-auto h-7 w-7 text-amber-500" />
          <p className="mt-2 text-sm font-medium">Pas assez de pièces pour ce contexte</p>
          <p className="mx-auto mt-1 max-w-[22rem] text-xs text-muted-foreground">
            {poorDataMessage}
          </p>
          <Link
            to="/dressing/ajouter"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"
          >
            Ajouter une pièce
          </Link>
          <div className="mt-4 text-left">
            <MissingPiecesCard suggestions={suggestions} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleIndexes.map((poolIndex, slot) => (
            <OutfitCard
              key={`${context}-${slot}-${pool[poolIndex]?.items.map((i) => i.id).join("-")}`}
              outfit={pool[poolIndex]}
              context={context}
              resolveItem={resolveItem}
              canCycle={pool.length > VISIBLE_COUNT}
              onNewOutfit={() => cycleSlot(slot)}
              onUsed={() => void navigate({ to: "/dressing/semaine" })}
            />
          ))}
          <MissingPiecesCard suggestions={suggestions} />
        </div>
      )}
    </main>
  );
}

function OutfitCard({
  outfit,
  context,
  resolveItem,
  canCycle,
  onNewOutfit,
  onUsed,
}: {
  outfit: GeneratedOutfit;
  context: OutfitContext;
  resolveItem: (id: string) => WardrobeItemView | undefined;
  canCycle: boolean;
  onNewOutfit: () => void;
  onUsed: () => void;
}) {
  const saveOutfit = useSaveOutfit();
  const feedback = useOutfitFeedback();
  const [savedOutfitId, setSavedOutfitId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);

  const pieces = useMemo(
    () =>
      outfit.items
        .map((scored) => resolveItem(scored.id))
        .filter((i): i is WardrobeItemView => !!i),
    [outfit.items, resolveItem],
  );

  async function ensureSaved(wornNow = false): Promise<string> {
    if (savedOutfitId) return savedOutfitId;
    const id = await saveOutfit.mutateAsync({ outfit, context, wornNow });
    setSavedOutfitId(id);
    return id;
  }

  async function handleLike() {
    try {
      const id = await ensureSaved();
      await feedback.mutateAsync({ outfitId: id, liked: true });
      setLiked(true);
    } catch {
      // Le toast d'erreur est déjà géré par les mutations (useSaveOutfit / useOutfitFeedback).
    }
  }

  async function handleUse() {
    try {
      await ensureSaved(true);
      onUsed();
    } catch {
      // idem
    }
  }

  const isBusy = saveOutfit.isPending || feedback.isPending;

  return (
    <article className="overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-card backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {outfit.score}%
        </span>
        {outfit.missing.includes("chaussures") && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-500">
            <Footprints className="h-3 w-3" />
            Sans chaussures
          </span>
        )}
      </div>

      <div className="px-4 py-4">
        <OutfitThumbnails pieces={pieces} forgottenIds={outfit.forgottenItemIds} />
      </div>

      <p className="px-4 text-xs text-muted-foreground">{outfit.explanation}</p>

      <div className="mt-4 flex items-center gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => void handleLike()}
          disabled={isBusy}
          aria-pressed={liked}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            liked
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border bg-card text-muted-foreground"
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
          J'aime
        </button>
        {canCycle && (
          <button
            type="button"
            onClick={onNewOutfit}
            disabled={isBusy}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-semibold text-muted-foreground disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Nouvelle tenue
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleUse()}
          disabled={isBusy}
          className="ml-auto flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Utiliser cette tenue
        </button>
      </div>
    </article>
  );
}
