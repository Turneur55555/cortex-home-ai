import { useCallback, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { SortableCategoryList } from "@/components/home/SortableCategoryList";
import { AddCategoryButton } from "@/components/home/AddCategoryButton";
import { CategoryModal } from "@/components/home/CategoryModal";
import { DeleteCategoryDialog } from "@/components/home/DeleteCategoryDialog";
import { SubcategoryList } from "@/components/home/SubcategoryList";
import { differenceInDays, parseISO } from "date-fns";
import { useAllStockStats } from "@/hooks/use-stocks";
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
import type { HomeCategory, CreateCategoryInput, UpdateCategoryInput } from "@/types/home";

// ─── View 1: Rooms (catégories dynamiques) ───────────────────────────────────

export function RoomsView({
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
