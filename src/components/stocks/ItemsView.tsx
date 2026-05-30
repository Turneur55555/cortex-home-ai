import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Barcode,
  CheckSquare,
  Loader2,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { ScanSheet } from "@/components/ScanSheet";
import { BarcodeScannerSheet } from "@/components/BarcodeScannerSheet";
import { differenceInDays, parseISO } from "date-fns";
import {
  useBulkAdjustStockItems,
  useBulkDeleteStockItems,
  useDeleteStockItem,
  useStockItems,
  useUpdateStockItem,
} from "@/hooks/use-stocks";
import { useHomeCategories } from "@/hooks/useHomeCategories";
import { useHomeSubcategories } from "@/hooks/useHomeSubcategories";
import { getRoomById } from "@/lib/maison/rooms";
import { getIcon } from "@/lib/maison/icons";
import type { Tables } from "@/integrations/supabase/types";
import { StatChip } from "@/components/stocks/StatChip";
import { BulkActionBar } from "@/components/stocks/BulkActionBar";
import { ItemRow } from "@/components/stocks/ItemRow";
import { AddItemSheet } from "@/components/stocks/AddItemSheet";
import { ItemEditSheet } from "@/components/stocks/ItemEditSheet";

// ─── View 3: Items ────────────────────────────────────────────────────────────

export function ItemsView({
  roomId,
  compartmentId,
  onBack,
}: {
  roomId: string;
  compartmentId: string;
  onBack: () => void;
}) {
  // Résolution dynamique (catégories/sous-catégories DB) avec fallback statique
  const { data: categories = [] } = useHomeCategories();
  const dynCategory = categories.find((c) => c.slug === roomId);
  const staticRoom = getRoomById(roomId);
  const { data: dynSubs = [] } = useHomeSubcategories(dynCategory?.id);
  const dynComp = dynSubs.find((s) => s.slug === compartmentId);
  const staticComp = staticRoom?.compartments.find((c) => c.id === compartmentId);

  const catName = dynCategory?.name ?? staticRoom?.name ?? roomId;
  const catColor = dynCategory?.color ?? null;
  const compName = dynComp?.name ?? staticComp?.name ?? compartmentId;
  const CompIcon = dynComp
    ? getIcon(dynComp.icon)
    : staticComp?.Icon ?? getIcon("Box");

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

  // Ne bloque que si la catégorie elle-même est introuvable (ni dynamique ni statique).
  if (!dynCategory && !staticRoom) return null;

  return (
    <section className="flex flex-col gap-4">
      <header>
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {catName}
        </button>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={
              catColor
                ? { backgroundColor: catColor + "20", color: catColor }
                : undefined
            }
          >
            <CompIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{compName}</h1>
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
          roomName={catName}
          compName={compName}
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
