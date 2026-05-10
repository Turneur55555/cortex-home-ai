import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Apple,
  Pill,
  Shirt,
  SprayCan,
  Plus,
  Trash2,
  AlertTriangle,
  Loader2,
  X,
  Search,
  MapPin,
  Minus,
  CheckSquare,
  Sparkles,
} from "lucide-react";
import { ScanSheet } from "@/components/ScanSheet";
import { toast } from "sonner";
import { format, parseISO, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import {
  STOCK_MODULE_LABELS,
  useAddStockItem,
  useBulkAdjustStockItems,
  useBulkDeleteStockItems,
  useDeleteStockItem,
  useStockItems,
  useUpdateStockItem,
  type StockModule,
} from "@/hooks/use-stocks";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/stocks")({
  head: () => ({
    meta: [
      { title: "Stocks — ICORTEX" },
      {
        name: "description",
        content: "Inventaire intelligent : alimentation, pharmacie, garde-robe, ménager.",
      },
    ],
  }),
  component: StocksPage,
});

const TABS: { key: StockModule; icon: typeof Apple; accent: string }[] = [
  { key: "alimentation", icon: Apple, accent: "from-emerald-400 to-teal-500" },
  { key: "pharmacie", icon: Pill, accent: "from-rose-400 to-pink-500" },
  { key: "habits", icon: Shirt, accent: "from-violet-400 to-fuchsia-500" },
  { key: "menager", icon: SprayCan, accent: "from-amber-400 to-orange-500" },
];

function StocksPage() {
  const [tab, setTab] = useState<StockModule>("alimentation");

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Stocks</h1>
      </header>

      <nav className="mb-6 grid grid-cols-4 gap-1 rounded-2xl border border-border bg-surface p-1">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              "flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold transition-all " +
              (tab === key
                ? "bg-gradient-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:text-foreground")
            }
            aria-label={STOCK_MODULE_LABELS[key]}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate">{STOCK_MODULE_LABELS[key].split(" ")[0]}</span>
          </button>
        ))}
      </nav>

      <StockTab module={tab} />
    </main>
  );
}

function StockTab({ module }: { module: StockModule }) {
  const { data, isLoading } = useStockItems(module);
  const del = useDeleteStockItem();
  const update = useUpdateStockItem();
  const bulkDel = useBulkDeleteStockItems();
  const bulkAdj = useBulkAdjustStockItems();
  const [open, setOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [q, setQ] = useState("");
  const [expFilter, setExpFilter] = useState<"all" | "valid" | "soon" | "expired">("all");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const expStateOf = (it: Tables<"items">): "none" | "valid" | "soon" | "expired" => {
    if (!it.expiration_date) return "none";
    const d = differenceInDays(parseISO(it.expiration_date as unknown as string), new Date());
    if (d < 0) return "expired";
    if (d <= 7) return "soon";
    return "valid";
  };

  const filtered = useMemo(() => {
    if (!data) return [];
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
        (it.category ?? "").toLowerCase().includes(needle) ||
        (it.location ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, q, expFilter]);

  const expiringSoon = useMemo(
    () =>
      (data ?? []).filter((it) => {
        if (!it.expiration_date) return false;
        const d = differenceInDays(parseISO(it.expiration_date as unknown as string), new Date());
        return d >= 0 && d <= 7;
      }),
    [data],
  );

  const expired = useMemo(
    () =>
      (data ?? []).filter((it) => {
        if (!it.expiration_date) return false;
        return (
          differenceInDays(parseISO(it.expiration_date as unknown as string), new Date()) < 0
        );
      }),
    [data],
  );

  const validCount = useMemo(
    () => (data ?? []).filter((it) => {
      const s = expStateOf(it);
      return s === "valid" || s === "none";
    }).length,
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

  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Items" value={data?.length ?? 0} tone="default" />
        <Stat label="< 7 j" value={expiringSoon.length} tone="warning" />
        <Stat label="Expirés" value={expired.length} tone="danger" />
      </div>

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
          aria-label="Scanner une photo"
        >
          <Sparkles className="h-4 w-4" />
          Scan
        </button>
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
          {selecting ? "Annuler" : "Sélection"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: "all", label: "Tous", count: data?.length ?? 0, tone: "default" },
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
                className={
                  "rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums " +
                  (active ? "bg-background/25" : "bg-surface")
                }
              >
                {c.count}
              </span>
            </button>
          );
        })}
      </div>

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

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
          <p className="text-sm font-medium">Inventaire vide</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajoute un item ou importe un PDF dans Documents.
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
                    onDelete={() => del.mutate({ id: it.id, module })}
                    onQty={(q) =>
                      update.mutate({ id: it.id, module, patch: { quantity: q } })
                    }
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!selecting && <FabAdd onClick={() => setOpen(true)} />}
      {open && <AddItemSheet module={module} onClose={() => setOpen(false)} />}
      {scanOpen && <ScanSheet module={module} onClose={() => setScanOpen(false)} />}

      {selecting && selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          busy={bulkDel.isPending || bulkAdj.isPending}
          onAdjust={(delta) => {
            const targets = (data ?? [])
              .filter((it) => selected.has(it.id))
              .map((it) => ({ id: it.id, quantity: Math.max(0, it.quantity + delta) }));
            bulkAdj.mutate(
              { items: targets, module },
              { onSuccess: () => exitSelect() },
            );
          }}
          onDelete={() => {
            if (!confirm(`Supprimer ${selected.size} item(s) ?`)) return;
            bulkDel.mutate(
              { ids: [...selected], module },
              { onSuccess: () => exitSelect() },
            );
          }}
        />
      )}
    </section>
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
            aria-label="Diminuer"
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
            aria-label="Augmenter"
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
  const exp = item.expiration_date
    ? parseISO(item.expiration_date as unknown as string)
    : null;
  const daysLeft = exp ? differenceInDays(exp, new Date()) : null;
  const expState =
    daysLeft == null ? null : daysLeft < 0 ? "expired" : daysLeft <= 7 ? "soon" : "ok";

  return (
    <li
      onClick={selecting ? onToggle : undefined}
      className={
        "flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-card transition-colors " +
        (selecting
          ? selected
            ? "border-primary bg-primary/5 cursor-pointer"
            : "border-border cursor-pointer"
          : "border-border")
      }
    >
      {selecting && (
        <span
          className={
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border " +
            (selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface")
          }
          aria-hidden
        >
          {selected && <CheckSquare className="h-3 w-3" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{item.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {item.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {item.location}
            </span>
          )}
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
                : `${format(exp, "d MMM yyyy", { locale: fr })}`}
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
              aria-label="Diminuer"
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
              aria-label="Augmenter"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onDelete}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "warning" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function FabAdd({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-24 right-1/2 z-30 inline-flex h-14 translate-x-[200px] items-center gap-2 rounded-full bg-gradient-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform active:scale-95"
    >
      <Plus className="h-5 w-5" />
      Ajouter
    </button>
  );
}

function AddItemSheet({ module, onClose }: { module: StockModule; onClose: () => void }) {
  const add = useAddStockItem();
  const [form, setForm] = useState({
    name: "",
    category: defaultCategory(module),
    quantity: "1",
    unit: defaultUnit(module),
    location: "",
    expiration_date: "",
    alert_days_before: "7",
    notes: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.expiration_date) {
      toast.error("La date de péremption est obligatoire");
      return;
    }
    await add.mutateAsync({
      module,
      name: form.name.trim(),
      category: form.category.trim() || "autre",
      quantity: Number(form.quantity) || 1,
      unit: form.unit.trim() || null,
      location: form.location.trim() || null,
      expiration_date: form.expiration_date,
      alert_days_before: Math.max(0, Number(form.alert_days_before) || 7),
      notes: form.notes.trim() || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-[430px] rounded-t-3xl border border-border bg-card p-5 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Ajouter à {STOCK_MODULE_LABELS[module]}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Field
            label="Nom"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="Ex: Yaourt nature"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Catégorie"
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
            />
            <Field
              label="Emplacement"
              value={form.location}
              onChange={(v) => setForm({ ...form, location: v })}
              placeholder={defaultLocation(module)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field
              label="Quantité"
              type="number"
              value={form.quantity}
              onChange={(v) => setForm({ ...form, quantity: v })}
            />
            <Field
              label="Unité"
              value={form.unit}
              onChange={(v) => setForm({ ...form, unit: v })}
            />
            <Field
              label="Expire le *"
              type="date"
              value={form.expiration_date}
              onChange={(v) => setForm({ ...form, expiration_date: v })}
              required
            />
          </div>
          <Field
            label="Alerter X jours avant expiration"
            type="number"
            value={form.alert_days_before}
            onChange={(v) => setForm({ ...form, alert_days_before: v })}
            placeholder="7"
          />
          <Field
            label="Notes"
            textarea
            value={form.notes}
            onChange={(v) => setForm({ ...form, notes: v })}
          />

          <button
            type="submit"
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  textarea?: boolean;
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
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
      )}
    </label>
  );
}

function defaultCategory(m: StockModule) {
  return m === "alimentation"
    ? "produit_laitier"
    : m === "pharmacie"
      ? "antalgique"
      : m === "habits"
        ? "haut"
        : "entretien";
}
function defaultUnit(m: StockModule) {
  return m === "pharmacie" ? "comprimé" : "";
}
function defaultLocation(m: StockModule) {
  return m === "alimentation"
    ? "Frigo"
    : m === "pharmacie"
      ? "Armoire"
      : m === "habits"
        ? "Penderie"
        : "Placard";
}
