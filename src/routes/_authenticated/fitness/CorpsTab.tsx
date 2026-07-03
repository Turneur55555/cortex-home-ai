import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Ruler, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
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
} from "@/hooks/use-fitness";
import { FabAdd, Field, FormGroup, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import type { MeasurementField } from "@/components/fitness/BodyMap";
import {
  computeFormScore,
  detectPlateau,
  directionForField,
  findLatestValue,
  findPreviousValue,
  movingAverage,
  type BodyField,
} from "@/lib/fitness/body";

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

type AllBodyField = keyof BodyRow | "weight" | "muscle_mass" | "body_fat";


export function CorpsTab() {
  const { data, isLoading } = useBodyMeasurements();
  const [open, setOpen] = useState(false);
  const [focusField, setFocusField] = useState<MeasurementField | null>(null);
  const [quickField, setQuickField] = useState<{ key: AllBodyField; label: string; unit: string } | null>(null);
  const [period, setPeriod] = useState<"semaine" | "mois" | "trimestre">("trimestre");

  const openWithFocus = (f: MeasurementField | null) => {
    setFocusField(f);
    setOpen(true);
  };

  const periodDays = period === "semaine" ? 7 : period === "mois" ? 30 : 90;

  const periodRows = useMemo(() => {
    if (!data) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    return [...data]
      .filter((d) => d.weight != null && new Date(d.date + "T00:00:00") >= cutoff)
      .reverse();
  }, [data, periodDays]);

  // Série + moyenne mobile 7 jours (lissage des variations quotidiennes).
  const chartData = useMemo(() => {
    const series = periodRows.map((d) => ({ date: d.date, value: d.weight ?? null }));
    return movingAverage(series, 7).map((p) => ({
      date: format(parseISO(p.date), "d MMM", { locale: fr }),
      weight: p.value,
      avg: p.avg,
    }));
  }, [periodRows]);

  const periodDelta = useMemo(() => {
    if (periodRows.length < 2) return null;
    const first = periodRows[0].weight;
    const last = periodRows[periodRows.length - 1].weight;
    if (first == null || last == null) return null;
    return Math.round((last - first) * 10) / 10;
  }, [periodRows]);

  // Détection de plateau (poids stable sur 21j).
  const plateau = useMemo(
    () =>
      data
        ? detectPlateau(
            data.map((d) => ({ date: d.date, weight: d.weight })),
            21,
            0.3,
          )
        : false,
    [data],
  );

  // Score forme global (0-100).
  const formScore = useMemo(
    () =>
      data
        ? computeFormScore(
            data.map((d) => ({
              date: d.date,
              weight: d.weight,
              body_fat: d.body_fat,
              muscle_mass: d.muscle_mass,
            })),
          )
        : { score: 0, consistency: 0, bodyFat: 0, muscle: 0 },
    [data],
  );

  const latest = data?.[0];

  return (
    <section className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Poids"
          value={latest?.weight}
          unit="kg"
          onClick={() => setQuickField({ key: "weight", label: "Poids", unit: "kg" })}
        />
        <Stat
          label="Masse gr."
          value={latest?.muscle_mass}
          unit="kg"
          onClick={() => setQuickField({ key: "muscle_mass", label: "Masse grasse", unit: "kg" })}
        />
        <Stat
          label="MG"
          value={latest?.body_fat}
          unit="%"
          onClick={() => setQuickField({ key: "body_fat", label: "Masse grasse %", unit: "%" })}
        />
      </div>

      <FormScoreCard score={formScore.score} plateau={plateau} count={data?.length ?? 0} />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Évolution du poids</h3>
            {periodDelta != null && (
              <span
                className={
                  "text-[11px] font-semibold " +
                  (periodDelta < 0
                    ? "text-success"
                    : periodDelta > 0
                      ? "text-amber-400"
                      : "text-muted-foreground")
                }
              >
                {periodDelta > 0 ? "+" : ""}
                {periodDelta} kg
              </span>
            )}
          </div>
          <div className="flex rounded-lg border border-border bg-card/50 p-0.5">
            {(["semaine", "mois", "trimestre"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={
                  "min-h-[36px] rounded-md px-2.5 py-2 text-[10px] font-semibold capitalize transition-colors active:scale-95 " +
                  (period === p
                    ? "bg-gradient-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {p}
              </button>
            ))}
          </div>
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
          <>
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
                  name="Poids"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  fill="url(#weightGrad)"
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  name="Moy. 7j"
                  stroke="var(--color-amber-400, #fbbf24)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            <p className="mt-1 px-1 text-[10px] text-muted-foreground">
              Ligne pleine : poids brut · pointillé : moyenne mobile 7j
            </p>
          </>
        )}
      </div>

      <MeasurementsCard
        rows={data}
        onChipClick={(key, label) => setQuickField({ key, label, unit: "cm" })}
      />

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
      {quickField && (
        <QuickMeasurementSheet
          field={quickField.key}
          label={quickField.label}
          unit={quickField.unit}
          onClose={() => setQuickField(null)}
        />
      )}
    </section>
  );
}

function FormScoreCard({
  score,
  plateau,
  count,
}: {
  score: number;
  plateau: boolean;
  count: number;
}) {
  const tone =
    score >= 75
      ? "text-success"
      : score >= 50
        ? "text-amber-400"
        : count === 0
          ? "text-muted-foreground"
          : "text-destructive";
  const label =
    count === 0
      ? "Ajoutez vos premières mesures"
      : score >= 75
        ? "Excellente dynamique"
        : score >= 50
          ? "Bonne régularité"
          : "À relancer";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Score forme
            </p>
            <p className={"text-sm font-semibold " + tone}>{label}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={"text-2xl font-bold tabular-nums " + tone}>
            {count === 0 ? "—" : score}
            {count > 0 && <span className="ml-0.5 text-xs font-medium text-muted-foreground">/100</span>}
          </p>
        </div>
      </div>
      {plateau && (
        <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-300">
          ⚠️ Plateau détecté — variation &lt; 0.3 kg sur 21 jours.
        </p>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
  onClick,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => { navigator.vibrate?.(30); onClick?.(); }}
      disabled={!onClick}
      className="rounded-2xl border border-border bg-card p-3 shadow-card text-left active:opacity-70 disabled:cursor-default w-full"
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold">
        {value != null ? value : "—"}
        {value != null && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
        )}
      </p>
      {onClick && (
        <p className="mt-0.5 text-[9px] text-primary/70">Tap pour modifier</p>
      )}
    </button>
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
  rows,
  onChipClick,
}: {
  rows: ReadonlyArray<BodyRow & { id: string }> | undefined;
  onChipClick?: (key: keyof BodyRow, label: string) => void;
}) {
  const latest = rows?.[0];
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
                    field={it.key as BodyField}
                    value={latest?.[it.key] ?? null}
                    // Dernière valeur **non nulle** pour ce champ précis,
                    // pas la ligne d'index 1 (corrige le delta absent / faux).
                    previous={findPreviousValue(rows, it.key as keyof BodyRow)}
                    accent={g.accent}
                    onClick={() => onChipClick?.(it.key, it.label)}
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
  field,
  value,
  previous,
  accent,
  onClick,
}: {
  label: string;
  field: BodyField;
  value: number | null;
  previous: number | null;
  accent: string;
  onClick?: () => void;
}) {
  const delta =
    value != null && previous != null ? Math.round((value - previous) * 10) / 10 : null;
  // Couleur contextuelle: taille/hanches ↓ = vert, bras/cuisses ↑ = vert,
  // poitrine = neutre (peut être musculaire ou graisseux).
  const direction: "good" | "bad" | "neutral" =
    delta == null ? "neutral" : directionForField(field, delta);

  return (
    <button
      type="button"
      onClick={() => { navigator.vibrate?.(30); onClick?.(); }}
      className={`relative w-full overflow-hidden rounded-xl border border-border bg-gradient-to-br ${accent} p-2.5 text-left active:opacity-70`}
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
            (direction === "good"
              ? "bg-success/15 text-success"
              : direction === "bad"
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-muted-foreground")
          }
        >
          {delta > 0 ? (
            <TrendingUp className="h-2.5 w-2.5" />
          ) : delta < 0 ? (
            <TrendingDown className="h-2.5 w-2.5" />
          ) : (
            <Minus className="h-2.5 w-2.5" />
          )}
          {delta > 0 ? "+" : ""}
          {delta}
        </div>
      )}
    </button>
  );
}


function QuickMeasurementSheet({
  field,
  label,
  unit,
  onClose,
}: {
  field: AllBodyField;
  label: string;
  unit: string;
  onClose: () => void;
}) {
  const add = useAddBodyMeasurement();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [value, setValue] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    await add.mutateAsync({ date, [field]: num(value) });
    onClose();
  };

  return (
    <Sheet title={label} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Date"
          type="date"
          value={date}
          onChange={setDate}
          required
        />
        <Field
          label={`${label} (${unit})`}
          type="number"
          step="0.1"
          value={value}
          onChange={setValue}
        />
        <SubmitButton pending={add.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}

