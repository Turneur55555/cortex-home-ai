import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  ChefHat,
  CheckSquare,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
  ArrowLeft,
} from "lucide-react";
import { ScanSheet } from "@/components/ScanSheet";
import { BarcodeScannerSheet } from "@/components/BarcodeScannerSheet";
import { RecipeAssistantSheet } from "@/components/RecipeAssistantSheet";
import { SortableCategoryList } from "@/components/home/SortableCategoryList";
import { AddCategoryButton } from "@/components/home/AddCategoryButton";
import { CategoryModal } from "@/components/home/CategoryModal";
import { DeleteCategoryDialog } from "@/components/home/DeleteCategoryDialog";
import { SubcategoryList } from "@/components/home/SubcategoryList";
import { differenceInDays, parseISO } from "date-fns";
import {
  useAllStockStats,
  useBulkAdjustStockItems,
  useBulkDeleteStockItems,
  useDeleteStockItem,
  useStockItems,
  useUpdateStockItem,
} from "@/hooks/use-stocks";
import { useItemsRealtime } from "@/hooks/use-pantry";
import {
  useHomeCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useBulkDeleteCategories,
  useReorderCategories,
} from "@/hooks/useHomeCategories";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useHomeSubcategories } from "@/hooks/useHomeSubcategories";
import { getRoomById } from "@/lib/maison/rooms";
import { getIcon } from "@/lib/maison/icons";
import type { Tables } from "@/integrations/supabase/types";
import type { HomeCategory, CreateCategoryInput, UpdateCategoryInput } from "@/types/home";

// Extracted components
import { StatChip } from "@/components/stocks/StatChip";
import { BulkActionBar } from "@/components/stocks/BulkActionBar";
import { ItemRow } from "@/components/stocks/ItemRow";
import { AddItemSheet } from "@/components/stocks/AddItemSheet";
import { ItemEditSheet } from "@/components/stocks/ItemEditSheet";

export const Route = createFileRoute("/_authenticated/stocks")({
  head: () => ({
    meta: [
      { title: "Maison — ICORTEX" },
      { name: "description", content: "Gestion intelligente de votre maison par pièces et compartiments." },
    ],
  }),
  component: MaisonPage,
});

// ─── Navigation state ─────────────────────────────────────────────────────────

type View =
  | { level: "rooms" }
  | { level: "compartments"; roomId: string }
  | { level: "items"; roomId: string; compartmentId: string };

// ─── Page ─────────────────────────────────────────────────────────────────────

function MaisonPage() {
  const [view, setView] = useState<View>({ level: "rooms" });
  const [globalSearch, setGlobalSearch] = useState("");
  useItemsRealtime();

  const goToRoom = (roomId: string) => setView({ level: "compartments", roomId });
  const goToCompartment = (roomId: string, compartmentId: string) =>
    setView({ level: "items", roomId, compartmentId });
  const goBack = () => {
    if (view.level === "items") setView({ level: "compartments", roomId: view.roomId });
    else if (view.level === "compartments") setView({ level: "rooms" });
  };

  return (
    <main className="flex flex-1 flex-col px-4 pb-6 pt-12">
      {view.level === "rooms" && (
        <RoomsView
          globalSearch={globalSearch}
          onSearchChange={setGlobalSearch}
          onRoomClick={goToRoom}
        />
      )}
      {view.level === "compartments" && (
        <CompartmentsView
          roomId={view.roomId}
          onBack={goBack}
          onCompartmentClick={(compId) => goToCompartment(view.roomId, compId)}
        />
      )}
      {view.level === "items" && (
        <ItemsView
          roomId={view.roomId}
          compartmentId={view.compartmentId}
          onBack={goBack}
        />
      )}
    </main>
  );
}

// ─── View 1: Rooms (catégories dynamiques) ───────────────────────────────────

function RoomsView({
  globalSearch,
  onSearchChange,
  onRoomClick,
}: {
  globalSearch: string;
  onSearchChange: (v: string) => void;
  onRoomClick: (roomId: string) => void;
}) {
  const { data: allStats } = useAllStockStats();
  const { data: categories = [], isLoading: catsLoading, error: catsError } = useHomeCategories();
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const deleteCat = useDeleteCategory();
  const bulkDeleteCats = useBulkDeleteCategories();
  const reorderCats = useReorderCategories();

  // Modals state
  const [catModal, setCatModal] = useState<HomeCategory | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeCategory | null>(null);
  const [subcatTarget, setSubcatTarget] = useState<HomeCategory | null>(null);

  // Multi-select edit mode
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const enterEditMode = useCallback(() => {
    setEditMode(true);
    setSelectedIds(new Set());
  }, []);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setSelectedIds(new Set());
    setBulkConfirmOpen(false);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(categories.map((c) => c.id)));
  }, [categories]);


  const statsMap = useMemo(() => {
    const map = new Map<string, { count: number; expiring: number; lowStock: number }>();
    for (const item of allStats ?? []) {
      const key = item.room ?? "__none__";
      const cur = map.get(key) ?? { count: 0, expiring: 0, lowStock: 0 };
      cur.count++;
      if (item.expiration_date) {
        const d = differenceInDays(parseISO(item.expiration_date as unknown as string), new Date());
        if (d >= 0 && d <= 7) cur.expiring++;
      }
      if (item.low_stock_threshold != null && item.quantity <= item.low_stock_threshold) cur.lowStock++;
      map.set(key, cur);
    }
    return map;
  }, [allStats]);

  const totalItems = (allStats ?? []).length;
  const totalExpiring = useMemo(
    () =>
      (allStats ?? []).filter((it) => {
        if (!it.expiration_date) return false;
        const d = differenceInDays(parseISO(it.expiration_date as unknown as string), new Date());
        return d >= 0 && d <= 7;
      }).length,
    [allStats],
  );

  const filteredCategories = useMemo(() => {
    const needle = globalSearch.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(needle));
  }, [globalSearch, categories]);

  const handleReorder = useCallback(
    (newOrder: HomeCategory[]) => {
      const ordered = newOrder.map((c, i) => ({ id: c.id, position: i }));
      reorderCats.mutate(ordered);
    },
    [reorderCats],
  );

  const handleSaveCategory = async (data: CreateCategoryInput | UpdateCategoryInput) => {
    if (catModal === "new") {
      await createCat.mutateAsync(data as CreateCategoryInput);
    } else if (catModal) {
      await updateCat.mutateAsync({ id: catModal.id, patch: data as UpdateCategoryInput });
    }
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteCat.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleBulkDeleteConfirm = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkDeleteCats.mutate(ids);
    exitEditMode();
  };

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Gestion
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Maison</h1>
        </div>
        {categories.length > 0 && (
          <button
            type="button"
            onClick={() => (editMode ? exitEditMode() : enterEditMode())}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
              editMode
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-surface text-foreground hover:bg-accent"
            }`}
            aria-pressed={editMode}
            aria-label={editMode ? "Terminer la sélection" : "Modifier les catégories"}
          >
            {editMode ? (
              <>
                <X className="h-3.5 w-3.5" />
                Terminer
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Modifier
              </>
            )}
          </button>
        )}
      </header>


      {/* Stats globales */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Total objets
          </p>
          <p className="mt-1 text-2xl font-bold">{totalItems}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Expirent bientôt
          </p>
          <p className={`mt-1 text-2xl font-bold ${totalExpiring > 0 ? "text-warning" : ""}`}>
            {totalExpiring}
          </p>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={globalSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Rechercher une catégorie…"
          className="w-full rounded-2xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* Liste triable */}
      {catsLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : catsError ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-6 text-center">
          <p className="text-sm font-semibold text-destructive">Erreur de chargement</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {(catsError as Error).message}
          </p>
        </div>
      ) : (
        <div className={editMode ? "pb-24" : undefined}>
          <SortableCategoryList
            categories={filteredCategories}
            statsMap={statsMap}
            onPress={(cat) => onRoomClick(cat.slug)}
            onEdit={(cat) => setCatModal(cat)}
            onDelete={(cat) => setDeleteTarget(cat)}
            onManageCompartments={(cat) => setSubcatTarget(cat)}
            onReorder={handleReorder}
            editMode={editMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onRequestEditMode={enterEditMode}
          />
        </div>
      )}

      {/* FAB — masqué en mode édition */}
      {!editMode && <AddCategoryButton onClick={() => setCatModal("new")} />}

      {/* Barre d'action fixe — mode édition */}
      {editMode && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-xl animate-in slide-in-from-bottom duration-200"
          role="toolbar"
          aria-label="Actions de sélection"
        >
          <div className="mx-auto flex max-w-md items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface text-xs font-semibold text-foreground active:scale-[0.98]"
            >
              <CheckCircle2 className="h-4 w-4" />
              Tout sélectionner
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || bulkDeleteCats.isPending}
              onClick={() => setBulkConfirmOpen(true)}
              className="inline-flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-destructive text-sm font-semibold text-destructive-foreground shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulkDeleteCats.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Supprimer ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {/* Confirmation suppression multiple */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer {selectedIds.size} catégorie{selectedIds.size > 1 ? "s" : ""} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les objets associés ne seront pas supprimés mais
              perdront leur catégorie.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Modal création / édition */}
      {catModal !== null && (
        <CategoryModal
          category={catModal === "new" ? undefined : catModal}
          onSave={handleSaveCategory}
          onClose={() => setCatModal(null)}
        />
      )}

      {/* Dialog suppression */}
      {deleteTarget && (
        <DeleteCategoryDialog
          category={deleteTarget}
          otherCategories={categories.filter((c) => c.id !== deleteTarget.id)}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* Gestionnaire de sous-catégories */}
      {subcatTarget && (
        <SubcategoryList
          categoryId={subcatTarget.id}
          categoryName={subcatTarget.name}
          onClose={() => setSubcatTarget(null)}
        />
      )}
    </>
  );
}

// ─── View 2: Compartments (sous-catégories dynamiques) ────────────────────────

function CompartmentsView({
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

// ─── View 3: Items ────────────────────────────────────────────────────────────

function ItemsView({
  roomId,
  compartmentId,
  onBack,
}: {
  roomId: string;
  compartmentId: string;
  onBack: () => void;
}) {
  const room = getRoomById(roomId);
  const comp = room?.compartments.find((c) => c.id === compartmentId);
  const { data: allRoomItems, isLoading } = useStockItems(roomId);
  const del = useDeleteStockItem();
  const update = useUpdateStockItem();
  const bulkDel = useBulkDeleteStockItems();
  const bulkAdj = useBulkAdjustStockItems();

  const [open, setOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Tables<"items"> | null>(null);
  const [q, setQ] = useState("");
  const [expFilter, setExpFilter] = useState<"all" | "valid" | "soon" | "expired">("all");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const data = useMemo(
    () => (allRoomItems ?? []).filter((it) => it.location === compartmentId),
    [allRoomItems, compartmentId],
  );

  const expStateOf = (it: Tables<"items">): "none" | "valid" | "soon" | "expired" => {
    if (!it.expiration_date) return "none";
    const d = differenceInDays(parseISO(it.expiration_date as unknown as string), new Date());
    if (d < 0) return "expired";
    if (d <= 7) return "soon";
    return "valid";
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((it) => {
      if (expFilter !== "all") {
        const s = expStateOf(it);
        if (expFilter === "valid" && s !== "valid" && s !== "none") return false;
        if (expFilter === "soon" && s !== "soon") return false;
        if (expFilter === "expired" && s !== "expired") return false;
      }
      if (!needle) return true;
      return it.name.toLowerCase().includes(needle);
    });
  }, [data, q, expFilter]);

  const expiringSoon = useMemo(
    () =>
      data.filter((it) => {
        if (!it.expiration_date) return false;
        const d = differenceInDays(parseISO(it.expiration_date as unknown as string), new Date());
        return d >= 0 && d <= 7;
      }),
    [data],
  );

  const expired = useMemo(
    () =>
      data.filter((it) => {
        if (!it.expiration_date) return false;
        return differenceInDays(parseISO(it.expiration_date as unknown as string), new Date()) < 0;
      }),
    [data],
  );

  const validCount = useMemo(
    () =>
      data.filter((it) => {
        const s = expStateOf(it);
        return s === "valid" || s === "none";
      }).length,
    [data],
  );

  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  if (!room || !comp) return null;

  return (
    <section className="flex flex-col gap-4">
      <header>
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {room.name}
        </button>
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${room.iconBg}`}
          >
            <comp.Icon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{comp.name}</h1>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "…" : `${data.length} objet${data.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <StatChip label="Total" value={data.length} tone="default" />
        <StatChip label="< 7 j" value={expiringSoon.length} tone="warning" />
        <StatChip label="Expirés" value={expired.length} tone="danger" />
      </div>

      {/* Search + Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-primary px-3 text-xs font-semibold text-primary-foreground shadow-glow"
        >
          <Sparkles className="h-4 w-4" />
          Scan
        </button>
        {roomId === "cuisine" && (
          <button
            type="button"
            onClick={() => setBarcodeOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <Barcode className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => (selecting ? exitSelect() : setSelecting(true))}
          className={
            "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors " +
            (selecting
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-muted-foreground hover:text-foreground")
          }
          aria-pressed={selecting}
        >
          <CheckSquare className="h-4 w-4" />
        </button>
      </div>

      {/* Expiry filters */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: "all", label: "Tous", count: data.length, tone: "default" },
            { key: "valid", label: "Valides", count: validCount, tone: "success" },
            { key: "soon", label: "Bientôt", count: expiringSoon.length, tone: "warning" },
            { key: "expired", label: "Expirés", count: expired.length, tone: "danger" },
          ] as const
        ).map((c) => {
          const active = expFilter === c.key;
          const toneCls =
            c.tone === "danger"
              ? active
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-border text-destructive"
              : c.tone === "warning"
                ? active
                  ? "border-warning bg-warning text-warning-foreground"
                  : "border-border text-warning"
                : active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground";
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setExpFilter(c.key)}
              aria-pressed={active}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${toneCls}`}
            >
              {c.label}
              <span
                className={`rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums ${active ? "bg-background/25" : "bg-surface"}`}
              >
                {c.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selection toolbar */}
      {selecting && filtered.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">
            {selected.size} / {filtered.length} sélectionné(s)
          </span>
          <button
            type="button"
            onClick={() =>
              setSelected((s) =>
                s.size === filtered.length
                  ? new Set()
                  : new Set(filtered.map((it) => it.id)),
              )
            }
            className="font-semibold text-primary"
          >
            {selected.size === filtered.length ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
        </div>
      )}

      {/* Items list */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
          <p className="text-sm font-medium">Compartiment vide</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Appuie sur <strong>+</strong> ou sur <strong>Scan</strong> pour ajouter.
          </p>
        </div>
      ) : (
        <ul className={`space-y-2 ${selecting && selected.size > 0 ? "pb-28" : ""}`}>
          {filtered.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              selecting={selecting}
              selected={selected.has(it.id)}
              onToggle={() => toggleOne(it.id)}
              onDelete={() => del.mutate({ id: it.id, roomId })}
              onQty={(qty) => update.mutate({ id: it.id, roomId, patch: { quantity: qty } })}
              onEdit={() => setEditingItem(it)}
            />
          ))}
        </ul>
      )}

      {/* FAB */}
      {!selecting && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-1/2 z-30 inline-flex h-14 translate-x-[200px] items-center gap-2 rounded-full bg-gradient-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform active:scale-95"
        >
          <Plus className="h-5 w-5" />
          Ajouter
        </button>
      )}

      {open && (
        <AddItemSheet
          roomId={roomId}
          compartmentId={compartmentId}
          roomName={room.name}
          compName={comp.name}
          onClose={() => setOpen(false)}
        />
      )}
      {editingItem && (
        <ItemEditSheet item={editingItem} onClose={() => setEditingItem(null)} />
      )}
      {scanOpen && (
        <ScanSheet
          room={roomId}
          defaultLocation={compartmentId}
          onClose={() => setScanOpen(false)}
        />
      )}
      {barcodeOpen && (
        <BarcodeScannerSheet roomId={roomId} onClose={() => setBarcodeOpen(false)} />
      )}

      {selecting && selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          busy={bulkDel.isPending || bulkAdj.isPending}
          onAdjust={(delta) => {
            const targets = data
              .filter((it) => selected.has(it.id))
              .map((it) => ({ id: it.id, quantity: Math.max(0, it.quantity + delta) }));
            bulkAdj.mutate({ items: targets, roomId }, { onSuccess: () => exitSelect() });
          }}
          onDelete={() => {
            if (!confirm(`Supprimer ${selected.size} item(s) ?`)) return;
            bulkDel.mutate(
              { ids: [...selected], roomId },
              { onSuccess: () => exitSelect() },
            );
          }}
        />
      )}
    </section>
  );
}
