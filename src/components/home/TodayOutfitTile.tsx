import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Shirt } from "lucide-react";
import { OutfitThumbnails } from "@/components/wardrobe/OutfitThumbnails";
import { useSaveOutfit } from "@/hooks/useOutfitGenerator";
import { useWeeklyOutfits } from "@/hooks/useWardrobeInsights";
import type { WardrobeItemView } from "@/hooks/useWardrobe";

/**
 * Tenue du jour, sur l'Accueil — la case « aujourd'hui » de Mes tenues de la
 * semaine (même calcul, même tenue). Invisible tant que le dressing est vide
 * ou en chargement : l'Accueil ne parle jamais d'une fonctionnalité qu'on
 * n'utilise pas.
 */
export function TodayOutfitTile() {
  const { days, personalization } = useWeeklyOutfits();
  const saveOutfit = useSaveOutfit();
  const [justWorn, setJustWorn] = useState(false);

  const itemById = useMemo(
    () => new Map(personalization.items.map((i) => [i.id, i])),
    [personalization.items],
  );
  const today = days.find((d) => d.isToday);

  if (personalization.isLoading || personalization.items.length === 0 || !today) return null;
  if (today.status !== "worn" && today.status !== "planned") return null;

  const ids =
    today.status === "worn" && today.worn
      ? today.worn.itemIds
      : (today.outfit?.items.map((i) => i.id) ?? []);
  const pieces = ids.map((id) => itemById.get(id)).filter((i): i is WardrobeItemView => !!i);
  const worn = today.status === "worn" || justWorn;

  async function wear() {
    if (!today?.outfit) return;
    try {
      await saveOutfit.mutateAsync({ outfit: today.outfit, context: today.context, wornNow: true });
      setJustWorn(true);
    } catch {
      // Le toast d'erreur est déjà géré par useSaveOutfit.
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3.5">
      <Link to="/dressing/semaine" className="mb-3 flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
        >
          <Shirt className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Tenue du jour</span>
          <span className="block text-xs text-muted-foreground">
            {worn ? "Portée aujourd'hui" : "Préparée à partir de ton dressing"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
      <OutfitThumbnails pieces={pieces} size="sm" />
      {!worn && (
        <button
          type="button"
          onClick={() => void wear()}
          disabled={saveOutfit.isPending}
          className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Je la porte
        </button>
      )}
      {worn && (
        <p className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-primary">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
          Inscrite dans ton journal de style
        </p>
      )}
    </section>
  );
}
