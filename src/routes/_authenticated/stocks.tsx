import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  ChefHat,
  CheckSquare,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
  MapPin,
  ArrowLeft,
} from "lucide-react";
import { ScanSheet } from "@/components/ScanSheet";
import { BarcodeScannerSheet } from "@/components/BarcodeScannerSheet";
import { RecipeAssistantSheet } from "@/components/RecipeAssistantSheet";
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
import { ROOMS, getRoomById, getCompartmentById } from "@/lib/maison/rooms";
import type { Tables } from "@/integrations/supabase/types";

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

// ─── View 1: Rooms ────────────────────────────────────────────────────────────

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

  const statsMap = useMemo(() => {
    const map = new Map<string, { count: number; expiring: number }>();
    for (const item of allStats ?? []) {
      const cur = map.get(item.module) ?? { count: 0, expiring: 0 };
      cur.count++;
      if (item.expiration_date) {
        const d = differenceInDays(parseISO(item.expiration_date as unknown as string), new Date());
        if (d >= 0 && d <= 7) cur.expiring++;
      }
      map.set(item.module, cur);
    }
    return map;
  }, [allStats]);

  const totalItems = useMemo(
    () => (allStats ?? []).length,
    [allStats],
  );

  const totalExpiring = useMemo(
    () =>
      (allStats ?? []).filter((it) => {
        if (!it.expiration_date) return false;
        const d = differenceInDays(parseISO(it.expiration_date as unknown as string), new Date());
        return d >= 0 && d <= 7;
      }).length,
    [allStats],
  );

  const filteredRooms = useMemo(() => {
    const needle = globalSearch.trim().toLowerCase();
    if (!needle) return ROOMS;
    return ROOMS.filter((r) => r.name.toLowerCase().includes(needle));
  }, [globalSearch]);

  return (
    <>
      {/* Header */}
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Gestion
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Maison</h1>
      </header>

      {/* Global stats */}
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

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={globalSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Rechercher une pièce…"
          className="w-full rounded-2xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* Room grid */}
      <div className="grid grid-cols-2 gap-3">
        {filteredRooms.map((room) => {
          const stats = statsMap.get(room.id) ?? { count: 0, expiring: 0 };
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => onRoomClick(room.id)}
              className="relative overflow-hidden rounded-2xl border border-white/5 bg-card p-4 text-left shadow-card transition-all active:scale-95"
            >
              {/* Gradient overlay */}
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${room.gradient}`}
              />

              <div className="relative">
                {/* Icon */}
                <div
                  className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${room.iconBg}`}
                >
                  <room.Icon className="h-5 w-5" />
                </div>

                {/* Name & count */}
                <p className="truncate text-sm font-semibold leading-tight">{room.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {stats.count} objet{stats.count !== 1 ? "s" : ""}
                </p>

                {/* Expiry badge */}
                {stats.expiring > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {stats.expiring} exp.
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─── View 2: Compartments ─────────────────────────────────────────────────────

function CompartmentsView({
  roomId,
  onBack,
  onCompartmentClick,
}: {
  roomId: string;
  onBack: () => void;
  onCompartmentClick: (compartmentId: string) => void;
}) {
  const room = getRoomById(roomId);
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

  if (!room) return null;

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

  return (
    <>
      {/* Header */}
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
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${room.iconBg}`}
          >
            <room.Icon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{room.name}</h1>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "…" : `${totalItems} objet${totalItems !== 1 ? "s" : ""}`}
              {totalExpiring > 0 && (
                <span className="ml-2 text-warning">{totalExpiring} expirent bientôt</span>
              )}
            </p>
          </div>
        </div>
      </header>

      {/* Action buttons */}
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

      {/* Compartments list */}
      <div className="space-y-2">
        {room.compartments.map((comp) => {
          const stats = compCounts.get(comp.id) ?? { count: 0, expiring: 0 };
          return (
            <button
              key={comp.id}
              type="button"
              onClick={() => onCompartmentClick(comp.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left shadow-card transition-all active:scale-[0.98]"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${room.iconBg}`}
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
      </div>

      {scanOpen && (
        <ScanSheet module={roomId} onClose={() => setScanOpen(false)} />
      )}
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
  const [q, setQ] = useState("");
  const [expFilter, setExpFilter] = useState<"all" | "valid" | "soon" | "expired">("all");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Items belonging to this compartment
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
      return (
        it.name.toLowerCase().includes(needle) ||
        (it.category ?? "").toLowerCase().includes(needle)
      );
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

  const grouped = useMemo(() => {
    const map = new Map<string, Tables<"items">[]>();
    for (const it of filtered) {
      const k = it.category ?? "autre";
      const arr = map.get(k) ?? [];
      arr.push(it);
      map.set(k, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

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
      {/* Header */}
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

      {/* Stats */}
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
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
          <p className="text-sm font-medium">Compartiment vide</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Appuie sur <strong>+</strong> ou sur <strong>Scan</strong> pour ajouter.
          </p>
        </div>
      ) : (
        <div className={`flex flex-col gap-4 ${selecting && selected.size > 0 ? "pb-28" : ""}`}>
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {cat}
              </h3>
              <ul className="space-y-2">
                {items.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    selecting={selecting}
                    selected={selected.has(it.id)}
                    onToggle={() => toggleOne(it.id)}
                    onDelete={() => del.mutate({ id: it.id, module: roomId })}
                    onQty={(qty) => update.mutate({ id: it.id, module: roomId, patch: { quantity: qty } })}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* FAB + sheets */}
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
      {scanOpen && (
        <ScanSheet
          module={roomId}
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
            bulkAdj.mutate({ items: targets, module: roomId }, { onSuccess: () => exitSelect() });
          }}
          onDelete={() => {
            if (!confirm(`Supprimer ${selected.size} item(s) ?`)) return;
            bulkDel.mutate(
              { ids: [...selected], module: roomId },
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
  selecting = false,
  selected = false,
  onToggle,
}: {
  item: Tables<"items">;
  onDelete: () => void;
  onQty: (q: number) => void;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const exp = item.expiration_date ? parseISO(item.expiration_date as unknown as string) : null;
  const daysLeft = exp ? differenceInDays(exp, new Date()) : null;
  const expState =
    daysLeft == null ? null : daysLeft < 0 ? "expired" : daysLeft <= 7 ? "soon" : "ok";

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
        <p className="truncate text-sm font-semibold leading-tight">{item.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {item.unit && <span>{item.unit}</span>}
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
  const [form, setForm] = useState({
    name: "",
    category: "",
    quantity: "1",
    unit: "",
    expiration_date: "",
    alert_days_before: "7",
    notes: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await add.mutateAsync({
      module: roomId,
      name: form.name.trim(),
      category: form.category.trim() || "autre",
      quantity: Number(form.quantity) || 1,
      unit: form.unit.trim() || null,
      location: compartmentId,
      expiration_date: form.expiration_date || null,
      alert_days_before: Math.max(0, Number(form.alert_days_before) || 7),
      notes: form.notes.trim() || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-[430px] rounded-t-3xl border border-border bg-card p-5 shadow-elevated">
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
          <FormField
            label="Nom *"
            testId="stocks-field-name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="Ex: Yaourt nature"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Catégorie"
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              placeholder="alimentaire, soin…"
            />
            <FormField
              label="Expire le"
              type="date"
              testId="stocks-field-expiration"
              value={form.expiration_date}
              onChange={(v) => setForm({ ...form, expiration_date: v })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField
              label="Quantité"
              type="number"
              value={form.quantity}
              onChange={(v) => setForm({ ...form, quantity: v })}
            />
            <FormField
              label="Unité"
              value={form.unit}
              onChange={(v) => setForm({ ...form, unit: v })}
              placeholder="g, L, pcs…"
            />
            <FormField
              label="Alerte (j)"
              type="number"
              value={form.alert_days_before}
              onChange={(v) => setForm({ ...form, alert_days_before: v })}
              placeholder="7"
            />
          </div>
          <FormField
            label="Notes"
            textarea
            value={form.notes}
            onChange={(v) => setForm({ ...form, notes: v })}
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
  required,
  placeholder,
  textarea,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
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
