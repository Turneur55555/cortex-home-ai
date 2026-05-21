import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChefHat,
  ChevronRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { ScanSheet } from "@/components/ScanSheet";
import { RecipeAssistantSheet } from "@/components/RecipeAssistantSheet";
import { differenceInDays, parseISO } from "date-fns";
import { useStockItems } from "@/hooks/use-stocks";
import { useHomeCategories } from "@/hooks/useHomeCategories";
import { useHomeSubcategories } from "@/hooks/useHomeSubcategories";
import { getRoomById } from "@/lib/maison/rooms";
import { getIcon } from "@/lib/maison/icons";

// ─── View 2: Compartments (sous-catégories dynamiques) ────────────────────────

export function CompartmentsView({
  roomId,
  onBack,
  onCompartmentClick,
}: {
  roomId: string;
  onBack: () => void;
  onCompartmentClick: (compartmentId: string) => void;
}) {
  const { data: categories = [] } = useHomeCategories();
  const dynCategory = categories.find((c) => c.slug === roomId);
  const staticRoom = getRoomById(roomId);

  // Sous-catégories dynamiques, fallback statiques
  const { data: dynSubs = [], isLoading: subsLoading } = useHomeSubcategories(dynCategory?.id);

  const { data: items, isLoading } = useStockItems(roomId);
  const [scanOpen, setScanOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);

  const compCounts = useMemo(() => {
    const map = new Map<string, { count: number; expiring: number }>();
    for (const it of items ?? []) {
      const key = it.location ?? "__none__";
      const cur = map.get(key) ?? { count: 0, expiring: 0 };
      cur.count++;
      if (it.expiration_date) {
        const d = differenceInDays(parseISO(it.expiration_date as unknown as string), new Date());
        if (d >= 0 && d <= 7) cur.expiring++;
      }
      map.set(key, cur);
    }
    return map;
  }, [items]);

  const totalItems = items?.length ?? 0;
  const totalExpiring = useMemo(
    () =>
      (items ?? []).filter((it) => {
        if (!it.expiration_date) return false;
        const d = differenceInDays(parseISO(it.expiration_date as unknown as string), new Date());
        return d >= 0 && d <= 7;
      }).length,
    [items],
  );

  // Compartiments : DB d'abord, sinon statiques
  const compartments = useMemo(() => {
    if (dynSubs.length > 0) {
      return dynSubs.map((s) => ({
        id: s.slug,
        name: s.name,
        Icon: getIcon(s.icon),
      }));
    }
    return staticRoom?.compartments ?? [];
  }, [dynSubs, staticRoom]);

  // Affichage icône/couleur
  const catColor = dynCategory?.color ?? "#6366f1";
  const CatIcon = dynCategory ? getIcon(dynCategory.icon) : staticRoom?.Icon ?? getIcon("Box");
  const catName = dynCategory?.name ?? staticRoom?.name ?? roomId;

  if (!dynCategory && !staticRoom) return null;

  return (
    <>
      <header className="mb-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Maison
        </button>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: catColor + "30", color: catColor }}
          >
            <CatIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{catName}</h1>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "…" : `${totalItems} objet${totalItems !== 1 ? "s" : ""}`}
              {totalExpiring > 0 && (
                <span className="ml-2 text-warning">{totalExpiring} expirent bientôt</span>
              )}
            </p>
          </div>
        </div>
      </header>

      <div className="mb-5 flex gap-2">
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-glow"
        >
          <Sparkles className="h-4 w-4" />
          Scanner IA
        </button>
        {roomId === "cuisine" && (
          <button
            type="button"
            onClick={() => setRecipeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary"
          >
            <ChefHat className="h-4 w-4" />
            Recettes
          </button>
        )}
      </div>

      {subsLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {compartments.map((comp) => {
            const stats = compCounts.get(comp.id) ?? { count: 0, expiring: 0 };
            return (
              <button
                key={comp.id}
                type="button"
                onClick={() => onCompartmentClick(comp.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left shadow-card transition-all active:scale-[0.98]"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: catColor + "20", color: catColor }}
                >
                  <comp.Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{comp.name}</p>
                  {stats.expiring > 0 && (
                    <p className="text-[10px] text-warning">{stats.expiring} expirent bientôt</p>
                  )}
                </div>
                {stats.count > 0 && (
                  <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-bold tabular-nums text-muted-foreground">
                    {stats.count}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30" />
              </button>
            );
          })}

          {compartments.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun compartiment. Gérez-les depuis la page Maison.
            </p>
          )}
        </div>
      )}

      {scanOpen && <ScanSheet room={roomId} onClose={() => setScanOpen(false)} />}
      {recipeOpen && <RecipeAssistantSheet onClose={() => setRecipeOpen(false)} />}
    </>
  );
}
