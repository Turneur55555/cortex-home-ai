import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  ChefHat,
  CheckSquare,
  ChevronRight,
  Leaf,
  Loader2,
  Minus,
  Move,
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
import { FoodAutocomplete } from "@/components/FoodAutocomplete";
import { SortableCategoryList } from "@/components/home/SortableCategoryList";
import { AddCategoryButton } from "@/components/home/AddCategoryButton";
import { CategoryModal } from "@/components/home/CategoryModal";
import { DeleteCategoryDialog } from "@/components/home/DeleteCategoryDialog";
import { SubcategoryList } from "@/components/home/SubcategoryList";
import { toast } from "sonner";
import { differenceInDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  useAddStockItem,
  useAllStockStats,
  useBulkAdjustStockItems,
  useBulkDeleteStockItems,
  useDeleteStockItem,
  useStockItems,
  useUpdateStockItem,
} from "@/hooks/use-stocks";
import { useItemsRealtime, useUpdateItemFull } from "@/hooks/use-pantry";
import {
  useHomeCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useReorderCategories,
} from "@/hooks/useHomeCategories";
import { useHomeSubcategories } from "@/hooks/useHomeSubcategories";
import { getRoomById, getCompartmentById } from "@/lib/maison/rooms";
import { getIcon } from "@/lib/maison/icons";
import type { Tables } from "@/integrations/supabase/types";
import type { HomeCategory, CreateCategoryInput, UpdateCategoryInput } from "@/types/home";

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
  const { data: categories = [], isLoading: catsLoading } = useHomeCategories();
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const deleteCat = useDeleteCategory();
  const reorderCats = useReorderCategories();

  // Modals state
  const [catModal, setCatModal] = useState<HomeCategory | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeCategory | null>(null);
  const [subcatTarget, setSubcatTarget] = useState<HomeCategory | null>(null);

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

  return (
    <>
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Gestion
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Maison</h1>
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
      ) : (
        <SortableCategoryList
          categories={filteredCategories}
          statsMap={statsMap}
          onPress={(cat) => onRoomClick(cat.slug)}
          onEdit={(cat) => setCatModal(cat)}
          onDelete={(cat) => setDeleteTarget(cat)}
          onManageCompartments={(cat) => setSubcatTarget(cat)}
          onReorder={handleReorder}
        />
      )}

      {/* FAB */}
      <AddCategoryButton onClick={() => setCatModal("new")} />

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
  const comp = getCompartmentById(roomId, compartmentId);
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
    () => data.filter((it) => { const s = expStateOf(it); return s === "valid" || s === "none"; }).length,
    [data],
  );

  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };

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
              ? active ? "border-destructive bg-destructive text-destructive-foreground" : "border-border text-destructive"
              : c.tone === "warning"
                ? active ? "border-warning bg-warning text-warning-foreground" : "border-border text-warning"
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
              <span className={`rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums ${active ? "bg-background/25" : "bg-surface"}`}>
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
                s.size === filtered.length ? new Set() : new Set(filtered.map((it) => it.id)),
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
      {barcodeOpen && <BarcodeScannerSheet roomId={roomId} onClose={() => setBarcodeOpen(false)} />}

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

// ─── Shared UI ────────────────────────────────────────────────────────────────

function StatChip({ label, value, tone }: { label: string; value: number; tone: "default" | "warning" | "danger" }) {
  const color = tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function BulkActionBar({
  count,
  busy,
  onAdjust,
  onDelete,
}: {
  count: number;
  busy: boolean;
  onAdjust: (delta: number) => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[min(420px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-border bg-card/95 p-2.5 shadow-elevated backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="px-2 text-xs font-semibold text-muted-foreground">{count}</span>
        <div className="flex flex-1 items-center gap-1 rounded-xl border border-border bg-surface p-0.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdjust(-1)}
            className="flex h-9 flex-1 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Qté
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdjust(1)}
            className="flex h-9 flex-1 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-destructive px-3 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Supprimer
        </button>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  onDelete,
  onQty,
  onEdit,
  selecting = false,
  selected = false,
  onToggle,
}: {
  item: Tables<"items">;
  onDelete: () => void;
  onQty: (q: number) => void;
  onEdit?: () => void;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const exp = item.expiration_date ? parseISO(item.expiration_date as unknown as string) : null;
  const daysLeft = exp ? differenceInDays(exp, new Date()) : null;
  const expState =
    daysLeft == null ? null : daysLeft < 0 ? "expired" : daysLeft <= 7 ? "soon" : "ok";
  const isLowStock =
    item.low_stock_threshold != null && item.quantity <= item.low_stock_threshold;
  const hasNutrition = item.calories_per_100g != null;

  return (
    <li
      data-testid="stocks-item"
      data-item-name={item.name}
      onClick={selecting ? onToggle : undefined}
      className={
        "flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-card transition-colors " +
        (selecting
          ? selected
            ? "cursor-pointer border-primary bg-primary/5"
            : "cursor-pointer border-border"
          : "border-border")
      }
    >
      {selecting && (
        <span
          className={
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border " +
            (selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface")
          }
          aria-hidden
        >
          {selected && <CheckSquare className="h-3 w-3" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold leading-tight">{item.name}</p>
          {hasNutrition && (
            <span title="Valeurs nutritionnelles disponibles">
              <Leaf className="h-3 w-3 shrink-0 text-accent opacity-70" />
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {item.unit && <span>{item.unit}</span>}
          {isLowStock && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" />
              Stock bas
            </span>
          )}
          {hasNutrition && (
            <span className="text-[10px] text-muted-foreground/70">
              {Math.round(item.calories_per_100g!)} kcal/100g
            </span>
          )}
          {exp && (
            <span
              className={
                expState === "expired"
                  ? "inline-flex items-center gap-1 text-destructive"
                  : expState === "soon"
                    ? "inline-flex items-center gap-1 text-warning"
                    : "inline-flex items-center gap-1"
              }
            >
              {(expState === "expired" || expState === "soon") && (
                <AlertTriangle className="h-3 w-3" />
              )}
              {expState === "expired"
                ? `Expiré ${format(exp, "d MMM", { locale: fr })}`
                : format(exp, "d MMM yyyy", { locale: fr })}
            </span>
          )}
        </div>
      </div>

      {selecting ? (
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
          ×{item.quantity}
        </span>
      ) : (
        <>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={() => onQty(Math.max(0, item.quantity - 1))}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onQty(item.quantity + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
              aria-label="Modifier"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            data-testid="stocks-item-delete"
            onClick={onDelete}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </li>
  );
}

// ─── Add item sheet ───────────────────────────────────────────────────────────

function AddItemSheet({
  roomId,
  compartmentId,
  roomName,
  compName,
  onClose,
}: {
  roomId: string;
  compartmentId: string;
  roomName: string;
  compName: string;
  onClose: () => void;
}) {
  const add = useAddStockItem();
  const isCuisine = roomId === "cuisine";

  const [form, setForm] = useState({
    name: "",
    quantity: "1",
    unit: "",
    expiration_date: "",
    alert_days_before: "7",
    notes: "",
    low_stock_threshold: "",
    calories_per_100g: "",
    protein_per_100g: "",
    carbs_per_100g: "",
    fat_per_100g: "",
    fiber_per_100g: "",
    sugar_per_100g: "",
    sodium_per_100g: "",
  });

  const setF = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await add.mutateAsync({
      room: roomId,
      location: compartmentId,
      name: form.name.trim(),
      quantity: Number(form.quantity) || 1,
      unit: form.unit.trim() || null,
      expiration_date: form.expiration_date || null,
      alert_days_before: Math.max(0, Number(form.alert_days_before) || 7),
      notes: form.notes.trim() || null,
      low_stock_threshold: num(form.low_stock_threshold),
      ...(isCuisine && {
        calories_per_100g: num(form.calories_per_100g),
        protein_per_100g: num(form.protein_per_100g),
        carbs_per_100g: num(form.carbs_per_100g),
        fat_per_100g: num(form.fat_per_100g),
        fiber_per_100g: num(form.fiber_per_100g),
        sugar_per_100g: num(form.sugar_per_100g),
        sodium_per_100g: num(form.sodium_per_100g),
      }),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-[430px] max-h-[92vh] overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">{roomName}</p>
            <h2 className="text-lg font-bold leading-tight">{compName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3" data-testid="stocks-add-form">
          {/* Name — FoodAutocomplete for cuisine, plain input otherwise */}
          {isCuisine ? (
            <FoodAutocomplete
              value={form.name}
              onChange={setF("name")}
              onSelect={(f) =>
                setForm((prev) => ({
                  ...prev,
                  name: f.name,
                  calories_per_100g: f.calories != null ? String(f.calories) : prev.calories_per_100g,
                  protein_per_100g: f.proteins != null ? String(f.proteins) : prev.protein_per_100g,
                  carbs_per_100g: f.carbs != null ? String(f.carbs) : prev.carbs_per_100g,
                  fat_per_100g: f.fats != null ? String(f.fats) : prev.fat_per_100g,
                }))
              }
              required
            />
          ) : (
            <FormField
              label="Nom *"
              testId="stocks-field-name"
              value={form.name}
              onChange={setF("name")}
              placeholder="Ex: Shampoing"
              required
            />
          )}

          <div className="grid grid-cols-3 gap-3">
            <FormField
              label="Quantité"
              type="number"
              value={form.quantity}
              onChange={setF("quantity")}
            />
            <FormField
              label="Unité"
              value={form.unit}
              onChange={setF("unit")}
              placeholder="g, L, pcs…"
            />
            <FormField
              label="Expire le"
              type="date"
              testId="stocks-field-expiration"
              value={form.expiration_date}
              onChange={setF("expiration_date")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Alerte (j)"
              type="number"
              value={form.alert_days_before}
              onChange={setF("alert_days_before")}
              placeholder="7"
            />
            <FormField
              label="Alerte stock bas"
              type="number"
              value={form.low_stock_threshold}
              onChange={setF("low_stock_threshold")}
              placeholder="ex: 2"
            />
          </div>

          {/* Nutrition section — cuisine only */}
          {isCuisine && (
            <div className="rounded-2xl border border-accent/20 bg-accent/5 p-3">
              <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
                <Leaf className="h-3.5 w-3.5" />
                Valeurs nutritionnelles /100g
              </p>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Calories (kcal)" type="number" value={form.calories_per_100g} onChange={setF("calories_per_100g")} placeholder="ex: 130" />
                <FormField label="Protéines (g)" type="number" step="0.1" value={form.protein_per_100g} onChange={setF("protein_per_100g")} placeholder="ex: 3" />
                <FormField label="Glucides (g)" type="number" step="0.1" value={form.carbs_per_100g} onChange={setF("carbs_per_100g")} placeholder="ex: 28" />
                <FormField label="Lipides (g)" type="number" step="0.1" value={form.fat_per_100g} onChange={setF("fat_per_100g")} placeholder="ex: 0.3" />
              </div>
              <p className="mb-1.5 mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Optionnel
              </p>
              <div className="grid grid-cols-3 gap-2">
                <FormField label="Fibres (g)" type="number" step="0.1" value={form.fiber_per_100g} onChange={setF("fiber_per_100g")} />
                <FormField label="Sucre (g)" type="number" step="0.1" value={form.sugar_per_100g} onChange={setF("sugar_per_100g")} />
                <FormField label="Sodium (mg)" type="number" value={form.sodium_per_100g} onChange={setF("sodium_per_100g")} />
              </div>
            </div>
          )}

          <FormField
            label="Notes"
            textarea
            value={form.notes}
            onChange={setF("notes")}
          />

          <button
            type="submit"
            data-testid="stocks-submit-add"
            disabled={add.isPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Enregistrer
          </button>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  step,
  required,
  placeholder,
  textarea,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  required?: boolean;
  placeholder?: string;
  textarea?: boolean;
  testId?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          rows={2}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
      ) : (
        <input
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          data-testid={testId}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
      )}
    </label>
  );
}

// ─── Item Edit Sheet ──────────────────────────────────────────────────────────

function ItemEditSheet({
  item,
  onClose,
}: {
  item: Tables<"items">;
  onClose: () => void;
}) {
  const updateFull = useUpdateItemFull();
  const del = useDeleteStockItem();
  const isCuisine = item.room === "cuisine";
  const { data: allCategories = [] } = useHomeCategories();

  const [form, setForm] = useState({
    name: item.name,
    quantity: String(item.quantity),
    unit: item.unit ?? "",
    expiration_date: item.expiration_date
      ? (item.expiration_date as unknown as string).slice(0, 10)
      : "",
    notes: item.notes ?? "",
    low_stock_threshold: item.low_stock_threshold != null ? String(item.low_stock_threshold) : "",
    alert_days_before: item.alert_days_before != null ? String(item.alert_days_before) : "7",
    calories_per_100g: item.calories_per_100g != null ? String(item.calories_per_100g) : "",
    protein_per_100g: item.protein_per_100g != null ? String(item.protein_per_100g) : "",
    carbs_per_100g: item.carbs_per_100g != null ? String(item.carbs_per_100g) : "",
    fat_per_100g: item.fat_per_100g != null ? String(item.fat_per_100g) : "",
    fiber_per_100g: item.fiber_per_100g != null ? String(item.fiber_per_100g) : "",
    sugar_per_100g: item.sugar_per_100g != null ? String(item.sugar_per_100g) : "",
    sodium_per_100g: item.sodium_per_100g != null ? String(item.sodium_per_100g) : "",
  });

  const [movingTo, setMovingTo] = useState<{ roomId: string; compartmentId: string }>({
    roomId: item.room ?? "cuisine",
    compartmentId: item.location ?? "",
  });

  const moveRoom = getRoomById(movingTo.roomId);
  const setF = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateFull.mutateAsync({
      id: item.id,
      oldRoom: item.room ?? "maison",
      oldQuantity: item.quantity,
      itemName: item.name,
      patch: {
        name: form.name.trim() || item.name,
        quantity: Number(form.quantity) || item.quantity,
        unit: form.unit.trim() || null,
        location: movingTo.compartmentId || null,
        room: movingTo.roomId,
        module: "maison",
        expiration_date: form.expiration_date || null,
        notes: form.notes.trim() || null,
        low_stock_threshold: num(form.low_stock_threshold),
        alert_days_before: form.alert_days_before.trim() ? Number(form.alert_days_before) : undefined,
        calories_per_100g: num(form.calories_per_100g),
        protein_per_100g: num(form.protein_per_100g),
        carbs_per_100g: num(form.carbs_per_100g),
        fat_per_100g: num(form.fat_per_100g),
        fiber_per_100g: num(form.fiber_per_100g),
        sugar_per_100g: num(form.sugar_per_100g),
        sodium_per_100g: num(form.sodium_per_100g),
      },
    });
    onClose();
  };

  const handleDelete = () => {
    if (!confirm(`Supprimer "${item.name}" ?`)) return;
    del.mutate({ id: item.id, roomId: item.room ?? "maison" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-[430px] max-h-[92vh] overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-elevated">
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Modifier l'item</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <FormField label="Nom" value={form.name} onChange={setF("name")} required />
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Quantité" type="number" value={form.quantity} onChange={setF("quantity")} />
            <FormField label="Unité" value={form.unit} onChange={setF("unit")} placeholder="g, L, pcs…" />
            <FormField label="Expire le" type="date" value={form.expiration_date} onChange={setF("expiration_date")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Alerte (j)" type="number" value={form.alert_days_before} onChange={setF("alert_days_before")} />
            <FormField label="Alerte stock bas" type="number" value={form.low_stock_threshold} onChange={setF("low_stock_threshold")} placeholder="ex: 2" />
          </div>

          {/* Nutrition section — cuisine only */}
          {isCuisine && (
            <div className="rounded-2xl border border-accent/20 bg-accent/5 p-3">
              <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
                <Leaf className="h-3.5 w-3.5" />
                Valeurs nutritionnelles /100g
              </p>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Calories (kcal)" type="number" value={form.calories_per_100g} onChange={setF("calories_per_100g")} />
                <FormField label="Protéines (g)" type="number" step="0.1" value={form.protein_per_100g} onChange={setF("protein_per_100g")} />
                <FormField label="Glucides (g)" type="number" step="0.1" value={form.carbs_per_100g} onChange={setF("carbs_per_100g")} />
                <FormField label="Lipides (g)" type="number" step="0.1" value={form.fat_per_100g} onChange={setF("fat_per_100g")} />
              </div>
              <p className="mb-1.5 mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Optionnel
              </p>
              <div className="grid grid-cols-3 gap-2">
                <FormField label="Fibres (g)" type="number" step="0.1" value={form.fiber_per_100g} onChange={setF("fiber_per_100g")} />
                <FormField label="Sucre (g)" type="number" step="0.1" value={form.sugar_per_100g} onChange={setF("sugar_per_100g")} />
                <FormField label="Sodium (mg)" type="number" value={form.sodium_per_100g} onChange={setF("sodium_per_100g")} />
              </div>
            </div>
          )}

          {/* Move to different room/compartment */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Move className="h-3 w-3" />
              Déplacer vers
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={movingTo.roomId}
                onChange={(e) => setMovingTo({ roomId: e.target.value, compartmentId: "" })}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {allCategories.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
              <select
                value={movingTo.compartmentId}
                onChange={(e) => setMovingTo((s) => ({ ...s, compartmentId: e.target.value }))}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">— Aucun —</option>
                {(moveRoom?.compartments ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <FormField label="Notes" textarea value={form.notes} onChange={setF("notes")} />

          <button
            type="submit"
            disabled={updateFull.isPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {updateFull.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
            Enregistrer
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-destructive/40 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer l'item
          </button>
        </form>
      </div>
    </div>
  );
}
