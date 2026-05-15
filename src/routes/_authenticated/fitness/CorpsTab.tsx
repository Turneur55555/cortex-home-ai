import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Ruler, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  useAddBodyMeasurement,
  useBodyMeasurements,
  useDeleteBodyMeasurement,
} from "@/hooks/use-fitness";
import { FabAdd, Field, FormGroup, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { BodyMap } from "@/components/fitness/BodyMap";
import type { MeasurementField } from "@/components/fitness/BodyMap";

// Re-export so existing code referencing this path still compiles
export type { MeasurementField };

type BodyRow = {
  chest: number | null;
  waist: number | null;
  hips: number | null;
  left_arm: number | null;
  right_arm: number | null;
  left_thigh: number | null;
  right_thigh: number | null;
};


export function CorpsTab() {
  const { data, isLoading } = useBodyMeasurements();
  const [open, setOpen] = useState(false);
  const [focusField, setFocusField] = useState<MeasurementField | null>(null);
  const del = useDeleteBodyMeasurement();

  const openWithFocus = (f: MeasurementField | null) => {
    setFocusField(f);
    setOpen(true);
  };

  const chartData = useMemo(() => {
    if (!data) return [];
    return [...data]
      .filter((d) => d.weight != null)
      .reverse()
      .map((d) => ({
        date: format(parseISO(d.date), "d MMM", { locale: fr }),
        weight: d.weight,
      }));
  }, [data]);

  const latest = data?.[0];
  const previous = data?.[1];

  return (
    <section className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Poids" value={latest?.weight} unit="kg" />
        <Stat label="Masse gr." value={latest?.muscle_mass} unit="kg" />
        <Stat label="MG" value={latest?.body_fat} unit="%" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Évolution du poids</h3>
        </div>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            Pas encore de mesures. Ajoutez votre première ↓
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--color-border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--color-muted-foreground)" }}
              />
              <Area
                type="monotone"
                dataKey="weight"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#weightGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <MeasurementsCard latest={latest} previous={previous} />

      <BodyMap mode="measurement" latest={latest} onZoneClick={openWithFocus} />

      <div>
        <h3 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Historique
        </h3>
        {data && data.length > 0 ? (
          <ul className="space-y-2">
            {data.slice(0, 20).map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-card"
              >
                <div>
                  <p className="text-sm font-medium">
                    {format(parseISO(m.date), "d MMM yyyy", { locale: fr })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      m.weight != null && `${m.weight} kg`,
                      m.muscle_mass != null && `MM ${m.muscle_mass}`,
                      m.body_fat != null && `${m.body_fat}% MG`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => del.mutate(m.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Supprimer"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !isLoading && (
            <p className="rounded-xl border border-border bg-card p-4 text-center text-xs text-muted-foreground">
              Aucune mesure pour le moment.
            </p>
          )
        )}
      </div>

      <FabAdd onClick={() => openWithFocus(null)} label="Ajouter mesure" />
      {open && (
        <BodyMeasurementSheet
          focusField={focusField}
          onClose={() => {
            setOpen(false);
            setFocusField(null);
          }}
        />
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold">
        {value != null ? value : "—"}
        {value != null && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
        )}
      </p>
    </div>
  );
}


function BodyMeasurementSheet({
  onClose,
  focusField,
}: {
  onClose: () => void;
  focusField?: MeasurementField | null;
}) {
  const add = useAddBodyMeasurement();
  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    weight: "",
    muscle_mass: "",
    body_fat: "",
    chest: "",
    waist: "",
    hips: "",
    left_arm: "",
    right_arm: "",
    left_thigh: "",
    right_thigh: "",
    notes: "",
  });

  useEffect(() => {
    if (!focusField) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`field-${focusField}`) as HTMLInputElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [focusField]);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await add.mutateAsync({
      date: form.date,
      weight: num(form.weight),
      muscle_mass: num(form.muscle_mass),
      body_fat: num(form.body_fat),
      chest: num(form.chest),
      waist: num(form.waist),
      hips: num(form.hips),
      left_arm: num(form.left_arm),
      right_arm: num(form.right_arm),
      left_thigh: num(form.left_thigh),
      right_thigh: num(form.right_thigh),
      notes: form.notes.trim() || null,
    });
    onClose();
  };

  return (
    <Sheet title="Nouvelle mesure" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field
          label="Date"
          type="date"
          value={form.date}
          onChange={(v) => setForm({ ...form, date: v })}
          required
        />

        <FormGroup title="Composition corporelle" subtitle="Données globales">
          <div className="grid grid-cols-3 gap-3">
            <Field
              id="field-weight"
              label="Poids (kg)"
              type="number"
              step="0.1"
              value={form.weight}
              onChange={(v) => setForm({ ...form, weight: v })}
            />
            <Field
              id="field-muscle_mass"
              label="MM (kg)"
              type="number"
              step="0.1"
              value={form.muscle_mass}
              onChange={(v) => setForm({ ...form, muscle_mass: v })}
            />
            <Field
              id="field-body_fat"
              label="MG (%)"
              type="number"
              step="0.1"
              value={form.body_fat}
              onChange={(v) => setForm({ ...form, body_fat: v })}
            />
          </div>
        </FormGroup>

        <FormGroup title="Tronc" subtitle="Tour en cm">
          <div className="grid grid-cols-3 gap-3">
            <Field
              id="field-chest"
              label="Poitrine"
              type="number"
              step="0.1"
              value={form.chest}
              onChange={(v) => setForm({ ...form, chest: v })}
            />
            <Field
              id="field-waist"
              label="Taille"
              type="number"
              step="0.1"
              value={form.waist}
              onChange={(v) => setForm({ ...form, waist: v })}
            />
            <Field
              id="field-hips"
              label="Hanches"
              type="number"
              step="0.1"
              value={form.hips}
              onChange={(v) => setForm({ ...form, hips: v })}
            />
          </div>
        </FormGroup>

        <FormGroup title="Bras" subtitle="Tour contracté en cm">
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="field-left_arm"
              label="Bras gauche"
              type="number"
              step="0.1"
              value={form.left_arm}
              onChange={(v) => setForm({ ...form, left_arm: v })}
            />
            <Field
              id="field-right_arm"
              label="Bras droit"
              type="number"
              step="0.1"
              value={form.right_arm}
              onChange={(v) => setForm({ ...form, right_arm: v })}
            />
          </div>
        </FormGroup>

        <FormGroup title="Jambes" subtitle="Tour de cuisse en cm">
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="field-left_thigh"
              label="Cuisse gauche"
              type="number"
              step="0.1"
              value={form.left_thigh}
              onChange={(v) => setForm({ ...form, left_thigh: v })}
            />
            <Field
              id="field-right_thigh"
              label="Cuisse droite"
              type="number"
              step="0.1"
              value={form.right_thigh}
              onChange={(v) => setForm({ ...form, right_thigh: v })}
            />
          </div>
        </FormGroup>

        <Field
          label="Notes"
          textarea
          value={form.notes}
          onChange={(v) => setForm({ ...form, notes: v })}
        />
        <SubmitButton pending={add.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}

function MeasurementsCard({
  latest,
  previous,
}: {
  latest: BodyRow | undefined;
  previous: BodyRow | undefined;
}) {
  const groups: Array<{
    title: string;
    accent: string;
    items: Array<{ label: string; key: keyof BodyRow }>;
  }> = [
    {
      title: "Tronc",
      accent: "from-violet-500/20 to-fuchsia-500/10",
      items: [
        { label: "Poitrine", key: "chest" },
        { label: "Taille", key: "waist" },
        { label: "Hanches", key: "hips" },
      ],
    },
    {
      title: "Bras",
      accent: "from-cyan-500/20 to-blue-500/10",
      items: [
        { label: "Bras G.", key: "left_arm" },
        { label: "Bras D.", key: "right_arm" },
      ],
    },
    {
      title: "Jambes",
      accent: "from-emerald-500/20 to-teal-500/10",
      items: [
        { label: "Cuisse G.", key: "left_thigh" },
        { label: "Cuisse D.", key: "right_thigh" },
      ],
    },
  ];

  const hasAny = latest && groups.some((g) => g.items.some((i) => latest[i.key] != null));

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Ruler className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold">Mensurations</h3>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          en cm
        </span>
      </div>

      {!hasAny ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Ajoutez votre première mesure pour visualiser vos progrès.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.title}
              </p>
              <div
                className={`grid gap-2 ${g.items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
              >
                {g.items.map((it) => (
                  <MeasurementChip
                    key={it.key}
                    label={it.label}
                    value={latest?.[it.key] ?? null}
                    previous={previous?.[it.key] ?? null}
                    accent={g.accent}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MeasurementChip({
  label,
  value,
  previous,
  accent,
}: {
  label: string;
  value: number | null;
  previous: number | null;
  accent: string;
}) {
  const delta =
    value != null && previous != null ? Math.round((value - previous) * 10) / 10 : null;
  const trend =
    delta == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border bg-gradient-to-br ${accent} p-2.5`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-bold tabular-nums text-foreground">
          {value != null ? value : "—"}
        </span>
        {value != null && (
          <span className="text-[10px] font-medium text-muted-foreground">cm</span>
        )}
      </div>
      {delta != null && (
        <div
          className={
            "mt-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums " +
            (trend === "up"
              ? "bg-success/15 text-success"
              : trend === "down"
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-muted-foreground")
          }
        >
          {trend === "up" ? (
            <TrendingUp className="h-2.5 w-2.5" />
          ) : trend === "down" ? (
            <TrendingDown className="h-2.5 w-2.5" />
          ) : (
            <Minus className="h-2.5 w-2.5" />
          )}
          {delta > 0 ? "+" : ""}
          {delta}
        </div>
      )}
    </div>
  );
}
