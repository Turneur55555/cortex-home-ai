import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Dumbbell,
  Apple,
  Plus,
  Trash2,
  TrendingUp,
  Clock,
  Calendar,
  X,
  Loader2,
  Trophy,
  Repeat,
  BarChart3,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  useAddBodyMeasurement,
  useAddNutrition,
  useAddWorkout,
  useBodyMeasurements,
  useDeleteBodyMeasurement,
  useDeleteNutrition,
  useDeleteWorkout,
  useNutrition,
  useWorkouts,
} from "@/hooks/use-fitness";

export const Route = createFileRoute("/_authenticated/fitness")({
  head: () => ({
    meta: [
      { title: "Fitness — ICORTEX" },
      { name: "description", content: "Suivi corps, séances et nutrition." },
    ],
  }),
  component: FitnessPage,
});

type Tab = "corps" | "seances" | "nutrition";

function FitnessPage() {
  const [tab, setTab] = useState<Tab>("corps");

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Fitness</h1>
      </header>

      <nav className="mb-6 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1">
        <TabButton active={tab === "corps"} onClick={() => setTab("corps")} icon={<Activity className="h-4 w-4" />} label="Corps" />
        <TabButton active={tab === "seances"} onClick={() => setTab("seances")} icon={<Dumbbell className="h-4 w-4" />} label="Séances" />
        <TabButton active={tab === "nutrition"} onClick={() => setTab("nutrition")} icon={<Apple className="h-4 w-4" />} label="Nutrition" />
      </nav>

      {tab === "corps" && <CorpsTab />}
      {tab === "seances" && <SeancesTab />}
      {tab === "nutrition" && <NutritionTab />}
    </main>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all " +
        (active
          ? "bg-gradient-primary text-primary-foreground shadow-glow"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );
}

/* ============================ CORPS ============================ */

function CorpsTab() {
  const { data, isLoading } = useBodyMeasurements();
  const [open, setOpen] = useState(false);
  const del = useDeleteBodyMeasurement();

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

  return (
    <section className="flex flex-col gap-5">
      {/* Latest snapshot */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Poids" value={latest?.weight} unit="kg" />
        <Stat label="Masse gr." value={latest?.muscle_mass} unit="kg" />
        <Stat label="MG" value={latest?.body_fat} unit="%" />
      </div>

      {/* Chart */}
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
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} domain={["dataMin - 2", "dataMax + 2"]} />
              <Tooltip
                contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "var(--color-muted-foreground)" }}
              />
              <Area type="monotone" dataKey="weight" stroke="var(--color-primary)" strokeWidth={2} fill="url(#weightGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* History */}
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
                  <Trash2 className="h-4 w-4" />
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

      <FabAdd onClick={() => setOpen(true)} label="Ajouter mesure" />
      {open && <BodyMeasurementSheet onClose={() => setOpen(false)} />}
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">
        {value != null ? value : "—"}
        {value != null && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}

function BodyMeasurementSheet({ onClose }: { onClose: () => void }) {
  const add = useAddBodyMeasurement();
  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    weight: "",
    muscle_mass: "",
    body_fat: "",
    chest: "",
    waist: "",
    hips: "",
    notes: "",
  });

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
      notes: form.notes.trim() || null,
    });
    onClose();
  };

  return (
    <Sheet title="Nouvelle mesure" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Poids (kg)" type="number" step="0.1" value={form.weight} onChange={(v) => setForm({ ...form, weight: v })} />
          <Field label="MM (kg)" type="number" step="0.1" value={form.muscle_mass} onChange={(v) => setForm({ ...form, muscle_mass: v })} />
          <Field label="MG (%)" type="number" step="0.1" value={form.body_fat} onChange={(v) => setForm({ ...form, body_fat: v })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Poitrine" type="number" step="0.1" value={form.chest} onChange={(v) => setForm({ ...form, chest: v })} />
          <Field label="Taille" type="number" step="0.1" value={form.waist} onChange={(v) => setForm({ ...form, waist: v })} />
          <Field label="Hanches" type="number" step="0.1" value={form.hips} onChange={(v) => setForm({ ...form, hips: v })} />
        </div>
        <Field label="Notes" textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        <SubmitButton pending={add.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}

/* ============================ SÉANCES ============================ */

function SeancesTab() {
  const { data, isLoading } = useWorkouts();
  const del = useDeleteWorkout();
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune séance</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lancez-vous, votre première séance vous attend.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((w) => (
            <li
              key={w.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{w.name}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(parseISO(w.date), "d MMM yyyy", { locale: fr })}
                    </span>
                    {w.duration_minutes != null && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {w.duration_minutes} min
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => del.mutate(w.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {w.exercises && w.exercises.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {w.exercises.map((ex) => (
                    <li key={ex.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium">{ex.name}</span>
                      <span className="text-muted-foreground">
                        {[
                          ex.sets != null && `${ex.sets}×${ex.reps ?? "?"}`,
                          ex.weight != null && `${ex.weight} kg`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {w.notes && (
                <p className="mt-3 border-t border-border pt-3 text-xs italic text-muted-foreground">
                  {w.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <FabAdd onClick={() => setOpen(true)} label="Nouvelle séance" />
      {open && <WorkoutSheet onClose={() => setOpen(false)} />}
    </section>
  );
}

function WorkoutSheet({ onClose }: { onClose: () => void }) {
  const add = useAddWorkout();
  const [form, setForm] = useState({
    name: "",
    date: format(new Date(), "yyyy-MM-dd"),
    duration_minutes: "",
    notes: "",
  });
  const [exercises, setExercises] = useState<Array<{ name: string; sets: string; reps: string; weight: string }>>([
    { name: "", sets: "", reps: "", weight: "" },
  ]);

  const updateEx = (i: number, k: keyof typeof exercises[number], v: string) => {
    setExercises((arr) => arr.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)));
  };

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await add.mutateAsync({
      name: form.name.trim(),
      date: form.date,
      duration_minutes: num(form.duration_minutes),
      notes: form.notes.trim() || null,
      exercises: exercises
        .filter((ex) => ex.name.trim())
        .map((ex) => ({
          name: ex.name.trim(),
          sets: num(ex.sets),
          reps: num(ex.reps),
          weight: num(ex.weight),
        })),
    });
    onClose();
  };

  return (
    <Sheet title="Nouvelle séance" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom" placeholder="Push, Jambes, Cardio…" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
          <Field label="Durée (min)" type="number" value={form.duration_minutes} onChange={(v) => setForm({ ...form, duration_minutes: v })} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Exercices
            </label>
            <button
              type="button"
              onClick={() => setExercises((a) => [...a, { name: "", sets: "", reps: "", weight: "" }])}
              className="text-xs font-semibold text-primary"
            >
              + Ajouter
            </button>
          </div>
          <div className="space-y-2">
            {exercises.map((ex, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ex.name}
                    onChange={(e) => updateEx(i, "name", e.target.value)}
                    placeholder="Exercice"
                    className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {exercises.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setExercises((a) => a.filter((_, idx) => idx !== i))}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Retirer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    value={ex.sets}
                    onChange={(e) => updateEx(i, "sets", e.target.value)}
                    placeholder="Séries"
                    className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    value={ex.reps}
                    onChange={(e) => updateEx(i, "reps", e.target.value)}
                    placeholder="Reps"
                    className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={ex.weight}
                    onChange={(e) => updateEx(i, "weight", e.target.value)}
                    placeholder="Kg"
                    className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <Field label="Notes" textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        <SubmitButton pending={add.isPending}>Enregistrer la séance</SubmitButton>
      </form>
    </Sheet>
  );
}

/* ============================ NUTRITION ============================ */

function NutritionTab() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data, isLoading } = useNutrition(date);
  const del = useDeleteNutrition();
  const [open, setOpen] = useState(false);

  const totals = useMemo(() => {
    return (data ?? []).reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories ?? 0),
        proteins: acc.proteins + (m.proteins ?? 0),
        carbs: acc.carbs + (m.carbs ?? 0),
        fats: acc.fats + (m.fats ?? 0),
      }),
      { calories: 0, proteins: 0, carbs: 0, fats: 0 },
    );
  }, [data]);

  const grouped = useMemo(() => {
    type Meal = NonNullable<typeof data>[number];
    const order = ["petit-dej", "dejeuner", "diner", "collation"] as const;
    const labels: Record<string, string> = {
      "petit-dej": "Petit-déjeuner",
      dejeuner: "Déjeuner",
      diner: "Dîner",
      collation: "Collation",
    };
    const map = new Map<string, Meal[]>();
    (data ?? []).forEach((m) => {
      const k = m.meal ?? "autre";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    });
    const result: Array<{ key: string; label: string; items: Meal[] }> = [];
    for (const k of order) {
      const items = map.get(k);
      if (items) result.push({ key: k, label: labels[k], items });
    }
    for (const [k, v] of map) {
      if (!order.includes(k as typeof order[number])) {
        result.push({ key: k, label: labels[k] ?? "Autre", items: v });
      }
    }
    return result;
  }, [data]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface p-4 shadow-elevated">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total du jour
          </p>
          <p className="text-2xl font-bold text-primary">
            {totals.calories}
            <span className="ml-1 text-xs font-normal text-muted-foreground">kcal</span>
          </p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Macro label="Protéines" value={totals.proteins} color="text-accent" />
          <Macro label="Glucides" value={totals.carbs} color="text-warning" />
          <Macro label="Lipides" value={totals.fats} color="text-destructive" />
        </div>
      </div>

      {isLoading && (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && grouped.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Apple className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Pas de repas enregistré</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Suivez votre alimentation pour atteindre vos objectifs.
          </p>
        </div>
      )}

      {grouped.map((g) => (
        <div key={g.key}>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </h3>
          <ul className="space-y-2">
            {g.items.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.calories ?? 0} kcal ·{" "}
                    P{m.proteins ?? 0} G{m.carbs ?? 0} L{m.fats ?? 0}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => del.mutate(m.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <FabAdd onClick={() => setOpen(true)} label="Ajouter un repas" />
      {open && <NutritionSheet date={date} onClose={() => setOpen(false)} />}
    </section>
  );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-surface p-2">
      <p className={`text-base font-bold ${color}`}>{Math.round(value)}<span className="text-[10px] font-normal text-muted-foreground">g</span></p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function NutritionSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const add = useAddNutrition();
  const [form, setForm] = useState({
    name: "",
    meal: "petit-dej",
    calories: "",
    proteins: "",
    carbs: "",
    fats: "",
  });

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await add.mutateAsync({
      date,
      name: form.name.trim(),
      meal: form.meal,
      calories: num(form.calories) as number | null,
      proteins: num(form.proteins),
      carbs: num(form.carbs),
      fats: num(form.fats),
    });
    onClose();
  };

  return (
    <Sheet title="Nouveau repas" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom" placeholder="Poulet riz, Salade…" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Repas
          </label>
          <select
            value={form.meal}
            onChange={(e) => setForm({ ...form, meal: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="petit-dej">Petit-déjeuner</option>
            <option value="dejeuner">Déjeuner</option>
            <option value="diner">Dîner</option>
            <option value="collation">Collation</option>
          </select>
        </div>
        <Field label="Calories (kcal)" type="number" value={form.calories} onChange={(v) => setForm({ ...form, calories: v })} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Prot. (g)" type="number" step="0.1" value={form.proteins} onChange={(v) => setForm({ ...form, proteins: v })} />
          <Field label="Gluc. (g)" type="number" step="0.1" value={form.carbs} onChange={(v) => setForm({ ...form, carbs: v })} />
          <Field label="Lip. (g)" type="number" step="0.1" value={form.fats} onChange={(v) => setForm({ ...form, fats: v })} />
        </div>
        <SubmitButton pending={add.isPending}>Ajouter le repas</SubmitButton>
      </form>
    </Sheet>
  );
}

/* ============================ SHARED UI ============================ */

function FabAdd({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-24 left-1/2 z-30 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-gradient-primary px-6 text-sm font-semibold text-primary-foreground shadow-glow transition-transform active:scale-95"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted-foreground"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  placeholder,
  required,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
}) {
  const cls =
    "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={cls}
        />
      ) : (
        <input
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={cls}
        />
      )}
    </div>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow transition-opacity disabled:opacity-60"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
