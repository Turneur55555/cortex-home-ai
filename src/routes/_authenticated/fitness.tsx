import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  Dumbbell,
  Apple,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Clock,
  Calendar,
  X,
  Loader2,
  Trophy,
  Repeat,
  BarChart3,
  Sparkles,
  Camera,
  ImageIcon,
  Target,
  Ruler,
  Minus,
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
import { supabase } from "@/integrations/supabase/client";
import {
  useAddBodyMeasurement,
  useAddNutrition,
  useAddWorkout,
  useBodyMeasurements,
  useDeleteBodyMeasurement,
  useDeleteNutrition,
  useDeleteWorkout,
  useNutrition,
  useNutritionGoals,
  useUpsertNutritionGoals,
  useWorkouts,
  useExerciseImageUrls,
  type NutritionGoals,
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

type MeasurementField =
  | "weight" | "muscle_mass" | "body_fat"
  | "chest" | "waist" | "hips"
  | "left_arm" | "right_arm" | "left_thigh" | "right_thigh";

function CorpsTab() {
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
      {/* Latest snapshot */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Poids" value={latest?.weight} unit="kg" />
        <Stat label="Masse gr." value={latest?.muscle_mass} unit="kg" />
        <Stat label="MG" value={latest?.body_fat} unit="%" />
      </div>

      {/* Silhouette interactive */}
      <BodySilhouette latest={latest} onZone={openWithFocus} />

      {/* Mensurations détaillées */}
      <MeasurementsCard latest={latest} previous={previous} />

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
            <Field id="field-weight" label="Poids (kg)" type="number" step="0.1" value={form.weight} onChange={(v) => setForm({ ...form, weight: v })} />
            <Field id="field-muscle_mass" label="MM (kg)" type="number" step="0.1" value={form.muscle_mass} onChange={(v) => setForm({ ...form, muscle_mass: v })} />
            <Field id="field-body_fat" label="MG (%)" type="number" step="0.1" value={form.body_fat} onChange={(v) => setForm({ ...form, body_fat: v })} />
          </div>
        </FormGroup>

        <FormGroup title="Tronc" subtitle="Tour en cm">
          <div className="grid grid-cols-3 gap-3">
            <Field id="field-chest" label="Poitrine" type="number" step="0.1" value={form.chest} onChange={(v) => setForm({ ...form, chest: v })} />
            <Field id="field-waist" label="Taille" type="number" step="0.1" value={form.waist} onChange={(v) => setForm({ ...form, waist: v })} />
            <Field id="field-hips" label="Hanches" type="number" step="0.1" value={form.hips} onChange={(v) => setForm({ ...form, hips: v })} />
          </div>
        </FormGroup>

        <FormGroup title="Bras" subtitle="Tour contracté en cm">
          <div className="grid grid-cols-2 gap-3">
            <Field id="field-left_arm" label="Bras gauche" type="number" step="0.1" value={form.left_arm} onChange={(v) => setForm({ ...form, left_arm: v })} />
            <Field id="field-right_arm" label="Bras droit" type="number" step="0.1" value={form.right_arm} onChange={(v) => setForm({ ...form, right_arm: v })} />
          </div>
        </FormGroup>

        <FormGroup title="Jambes" subtitle="Tour de cuisse en cm">
          <div className="grid grid-cols-2 gap-3">
            <Field id="field-left_thigh" label="Cuisse gauche" type="number" step="0.1" value={form.left_thigh} onChange={(v) => setForm({ ...form, left_thigh: v })} />
            <Field id="field-right_thigh" label="Cuisse droite" type="number" step="0.1" value={form.right_thigh} onChange={(v) => setForm({ ...form, right_thigh: v })} />
          </div>
        </FormGroup>

        <Field label="Notes" textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        <SubmitButton pending={add.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}

function FormGroup({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-3.5">
      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h4>
        {subtitle && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ----- Carte mensurations détaillées (vue lecture) ----- */

type BodyRow = {
  chest: number | null;
  waist: number | null;
  hips: number | null;
  left_arm: number | null;
  right_arm: number | null;
  left_thigh: number | null;
  right_thigh: number | null;
};

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

  const hasAny =
    latest &&
    groups.some((g) => g.items.some((i) => latest[i.key] != null));

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
                className={`grid gap-2 ${
                  g.items.length === 3 ? "grid-cols-3" : "grid-cols-2"
                }`}
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

/* ============================ SÉANCES ============================ */

type WorkoutTemplate = {
  name: string;
  exercises: Array<{ name: string; sets: string; reps: string; weight: string; image_path: string | null }>;
};



function computePRs(workouts: ReturnType<typeof useWorkouts>["data"]) {
  // PR = max weight per exercise name (case-insensitive trim)
  const prByName = new Map<string, number>();
  // History per exercise = list of {date, maxWeightThatSession}
  const histByName = new Map<string, Array<{ date: string; weight: number }>>();
  // Frequency per exercise
  const freq = new Map<string, number>();

  if (!workouts) return { prByName, histByName, topExercises: [] as string[] };

  for (const w of workouts) {
    const sessionMax = new Map<string, number>();
    for (const ex of w.exercises ?? []) {
      const key = ex.name.trim().toLowerCase();
      if (!key) continue;
      freq.set(key, (freq.get(key) ?? 0) + 1);
      if (ex.weight != null) {
        if (!sessionMax.has(key) || ex.weight > sessionMax.get(key)!) {
          sessionMax.set(key, ex.weight);
        }
        if (!prByName.has(key) || ex.weight > prByName.get(key)!) {
          prByName.set(key, ex.weight);
        }
      }
    }
    for (const [k, v] of sessionMax) {
      if (!histByName.has(k)) histByName.set(k, []);
      histByName.get(k)!.push({ date: w.date, weight: v });
    }
  }

  // Sort histories chronologically
  for (const arr of histByName.values()) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Top 3 exercises: at least 2 weighted sessions, sorted by frequency
  const cleanTop = Array.from(freq.entries())
    .filter(([k, n]) => n >= 2 && (histByName.get(k)?.length ?? 0) >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return { prByName, histByName, topExercises: cleanTop };
}

function SeancesTab() {
  const { data, isLoading } = useWorkouts();
  const del = useDeleteWorkout();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);

  const { prByName, histByName, topExercises } = useMemo(() => computePRs(data), [data]);

  const allImagePaths = useMemo(
    () => (data ?? []).flatMap((w) => (w.exercises ?? []).map((ex) => ex.image_path)),
    [data],
  );
  const { data: listImageUrls } = useExerciseImageUrls(allImagePaths);

  const openNew = () => {
    setTemplate(null);
    setOpen(true);
  };

  const openFromTemplate = (w: NonNullable<typeof data>[number]) => {
    setTemplate({
      name: w.name,
      exercises: (w.exercises ?? []).map((ex) => ({
        name: ex.name,
        sets: ex.sets != null ? String(ex.sets) : "",
        reps: ex.reps != null ? String(ex.reps) : "",
        weight: ex.weight != null ? String(ex.weight) : "",
        image_path: ex.image_path ?? null,
      })),
    });
    setOpen(true);
  };

  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInitialMuscles, setCoachInitialMuscles] = useState<string[] | null>(null);

  const handleCoachResult = (tpl: WorkoutTemplate) => {
    setCoachOpen(false);
    setTemplate(tpl);
    setOpen(true);
  };

  const openCoach = (initial?: string[]) => {
    setCoachInitialMuscles(initial && initial.length > 0 ? initial : null);
    setCoachOpen(true);
  };

  const readiness = useQuery({
    queryKey: ["muscle-readiness"],
    enabled: !!data && data.length > 0,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data: r, error } = await supabase.functions.invoke("muscle-readiness", { body: {} });
      if (error) throw new Error(error.message);
      if (r?.error) throw new Error(r.error);
      return r as {
        fatigued: Array<{ muscle: string; last_trained?: string; reason: string }>;
        recommended: Array<{ muscle: string; reason: string }>;
        advice: string;
      };
    },
  });

  return (
    <section className="flex flex-col gap-4">
      {/* Diagnostic récup IA */}
      {data && data.length > 0 && (
        <ReadinessCard
          query={readiness}
          onStart={(muscles) => openCoach(muscles)}
        />
      )}

      {/* Coach IA CTA */}
      <button
        type="button"
        onClick={() => openCoach()}
        className="group flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-4 text-left shadow-card transition-all active:scale-[0.99]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
          <Sparkles className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">Coach IA — Génère ma séance</span>
          <span className="block text-[11px] text-muted-foreground">
            Choisis muscles, durée, niveau. L'IA crée ta séance.
          </span>
        </span>
      </button>

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Progression top exercices */}
      {topExercises.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Progression — top exercices</h3>
          </div>
          <div className="space-y-4">
            {topExercises.map((key) => {
              const hist = histByName.get(key) ?? [];
              const chart = hist.map((p) => ({
                date: format(parseISO(p.date), "d MMM", { locale: fr }),
                weight: p.weight,
              }));
              const pr = prByName.get(key);
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-semibold capitalize">{key}</p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning">
                      <Trophy className="h-3 w-3" />
                      PR {pr} kg
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={chart} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} domain={["dataMin - 2", "dataMax + 2"]} width={32} />
                      <Tooltip
                        contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                      />
                      <Line type="monotone" dataKey="weight" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 2.5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
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
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openFromTemplate(w)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    aria-label="Refaire cette séance"
                    title="Refaire"
                  >
                    <Repeat className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => del.mutate(w.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {w.exercises && w.exercises.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-border pt-3">
                  {w.exercises.map((ex) => {
                    const key = ex.name.trim().toLowerCase();
                    const isPR = ex.weight != null && prByName.get(key) === ex.weight;
                    const imgUrl = ex.image_path ? listImageUrls?.get(ex.image_path) : null;
                    return (
                      <li key={ex.id} className="flex items-center gap-2.5 text-xs">
                        {ex.image_path ? (
                          imgUrl ? (
                            <img
                              src={imgUrl}
                              alt={ex.name}
                              className="h-9 w-9 shrink-0 rounded-lg object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
                          )
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground/50">
                            <Dumbbell className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <span className="inline-flex flex-1 items-center gap-1 font-medium">
                          {ex.name}
                          {isPR && (
                            <Trophy className="h-3 w-3 text-warning" aria-label="Record personnel" />
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          {[
                            ex.sets != null && `${ex.sets}×${ex.reps ?? "?"}`,
                            ex.weight != null && `${ex.weight} kg`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    );
                  })}
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

      <FabAdd onClick={openNew} label="Nouvelle séance" />
      {open && (
        <WorkoutSheet
          template={template}
          priorPRs={prByName}
          onClose={() => setOpen(false)}
        />
      )}
      {coachOpen && (
        <CoachSheet
          onClose={() => setCoachOpen(false)}
          onResult={handleCoachResult}
          initialMuscles={coachInitialMuscles ?? undefined}
        />
      )}
    </section>
  );
}

/* ============================ READINESS CARD ============================ */

function normalizeMuscleId(label: string): string | null {
  const norm = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
  const match = MUSCLE_OPTIONS.find((m) => m.id === norm);
  return match ? match.id : null;
}

function ReadinessCard({
  query,
  onStart,
}: {
  query: ReturnType<typeof useQuery<{
    fatigued: Array<{
      muscle: string;
      last_trained?: string;
      hours_since_last?: number;
      recovery_window_hours?: number;
      hours_remaining?: number;
      reason: string;
    }>;
    recommended: Array<{
      muscle: string;
      last_trained?: string;
      hours_since_last?: number;
      recovery_window_hours?: number;
      reason: string;
    }>;
    advice: string;
  }, Error>>;
  onStart: (muscles: string[]) => void;
}) {
  const { data, isLoading, isError, refetch, isFetching } = query;

  const fmtHours = (h?: number) => {
    if (h === undefined || h === null || Number.isNaN(h)) return null;
    if (h < 1) return "<1h";
    if (h < 48) return `${Math.round(h)}h`;
    return `${Math.round(h / 24)}j`;
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Récupération musculaire</h3>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {isFetching ? "…" : "Actualiser"}
        </button>
      </div>

      <p className="mb-3 text-[10px] text-muted-foreground">
        Basé sur tes 10 derniers jours · fenêtres de récupération : 48h (petits muscles) / 72h (gros muscles)
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyse de tes dernières séances…
        </div>
      )}

      {isError && (
        <p className="text-xs text-destructive">Analyse indisponible. Réessaie plus tard.</p>
      )}

      {data && (
        <div className="space-y-3">
          {data.fatigued.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-warning">
                ⚠️ Encore fatigués
              </p>
              <ul className="space-y-2">
                {data.fatigued.map((f, i) => {
                  const since = fmtHours(f.hours_since_last);
                  const remaining = fmtHours(f.hours_remaining);
                  return (
                    <li key={i} className="rounded-lg border border-warning/20 bg-warning/5 p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold capitalize">{f.muscle}</span>
                        {f.recovery_window_hours && (
                          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-semibold text-warning">
                            fenêtre {f.recovery_window_hours}h
                          </span>
                        )}
                        {since && (
                          <span className="text-[10px] text-muted-foreground">
                            il y a {since}
                          </span>
                        )}
                        {remaining && (
                          <span className="text-[10px] font-medium text-warning">
                            · encore {remaining} de récup
                          </span>
                        )}
                      </div>
                      {f.last_trained && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Dernière séance : {f.last_trained}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-foreground/80">{f.reason}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {data.recommended.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                ✅ À travailler aujourd'hui
              </p>
              <ul className="space-y-2">
                {data.recommended.map((r, i) => {
                  const since = fmtHours(r.hours_since_last);
                  return (
                    <li key={i} className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold capitalize">{r.muscle}</span>
                        {r.recovery_window_hours && (
                          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                            fenêtre {r.recovery_window_hours}h
                          </span>
                        )}
                        {since && (
                          <span className="text-[10px] text-muted-foreground">
                            il y a {since}
                          </span>
                        )}
                      </div>
                      {r.last_trained && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Dernière séance : {r.last_trained}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-foreground/80">{r.reason}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {data.advice && (
            <p className="rounded-lg bg-muted/50 p-2 text-[11px] italic text-muted-foreground">
              {data.advice}
            </p>
          )}

          {data.recommended.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const ids = data.recommended
                  .map((r) => normalizeMuscleId(r.muscle))
                  .filter((m): m is string => !!m);
                onStart(ids);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-glow"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Générer une séance adaptée
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WorkoutSheet({
  onClose,
  template,
  priorPRs,
}: {
  onClose: () => void;
  template?: WorkoutTemplate | null;
  priorPRs?: Map<string, number>;
}) {
  const add = useAddWorkout();
  const [form, setForm] = useState({
    name: template?.name ?? "",
    date: format(new Date(), "yyyy-MM-dd"),
    duration_minutes: "",
    notes: "",
  });
  const [exercises, setExercises] = useState<Array<{ name: string; sets: string; reps: string; weight: string; image_path: string | null }>>(
    template?.exercises && template.exercises.length > 0
      ? template.exercises
      : [{ name: "", sets: "", reps: "", weight: "", image_path: null }],
  );
  const [uploading, setUploading] = useState<number | null>(null);

  const updateEx = (i: number, k: keyof typeof exercises[number], v: string | null) => {
    setExercises((arr) => arr.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)));
  };

  const uploadImage = async (i: number, file: File) => {
    try {
      setUploading(i);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("exercise-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      updateEx(i, "image_path", path);
      toast.success("Photo ajoutée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec upload");
    } finally {
      setUploading(null);
    }
  };

  const exImagePaths = exercises.map((e) => e.image_path);
  const { data: exImageUrls } = useExerciseImageUrls(exImagePaths);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payloadExercises = exercises
      .filter((ex) => ex.name.trim())
      .map((ex) => ({
        name: ex.name.trim(),
        sets: num(ex.sets),
        reps: num(ex.reps),
        weight: num(ex.weight),
        image_path: ex.image_path,
      }));

    await add.mutateAsync({
      name: form.name.trim(),
      date: form.date,
      duration_minutes: num(form.duration_minutes),
      notes: form.notes.trim() || null,
      exercises: payloadExercises,
    });

    // Détection nouveaux PR
    if (priorPRs) {
      const newPRs: Array<{ name: string; weight: number; prev: number | null }> = [];
      for (const ex of payloadExercises) {
        if (ex.weight == null) continue;
        const key = ex.name.toLowerCase();
        const prev = priorPRs.get(key) ?? null;
        if (prev == null || ex.weight > prev) {
          newPRs.push({ name: ex.name, weight: ex.weight, prev });
        }
      }
      for (const pr of newPRs) {
        toast.success(
          `🏆 Nouveau PR — ${pr.name} : ${pr.weight} kg${pr.prev != null ? ` (avant ${pr.prev} kg)` : ""}`,
          { duration: 5000 },
        );
      }
    }

    onClose();
  };

  return (
    <Sheet title={template ? "Refaire la séance" : "Nouvelle séance"} onClose={onClose}>
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
              onClick={() => setExercises((a) => [...a, { name: "", sets: "", reps: "", weight: "", image_path: null }])}
              className="text-xs font-semibold text-primary"
            >
              + Ajouter
            </button>
          </div>
          <div className="space-y-2">
            {exercises.map((ex, i) => {
              const imgUrl = ex.image_path ? exImageUrls?.get(ex.image_path) : null;
              return (
              <div key={i} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex gap-2">
                  {/* Image thumbnail / picker */}
                  <label
                    className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
                    aria-label="Photo exercice"
                  >
                    {imgUrl ? (
                      <img src={imgUrl} alt={ex.name || "Exercice"} className="h-full w-full object-cover" />
                    ) : ex.image_path ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : uploading === i ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading !== null}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadImage(i, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
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
                {ex.image_path && (
                  <button
                    type="button"
                    onClick={() => updateEx(i, "image_path", null)}
                    className="mt-1 text-[10px] font-medium text-muted-foreground hover:text-destructive"
                  >
                    Retirer la photo
                  </button>
                )}
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
              );
            })}
          </div>
        </div>

        <Field label="Notes" textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        <SubmitButton pending={add.isPending}>Enregistrer la séance</SubmitButton>
      </form>
    </Sheet>
  );
}

/* ============================ COACH IA SHEET ============================ */

const MUSCLE_OPTIONS = [
  { id: "pectoraux", label: "Pectoraux" },
  { id: "dos", label: "Dos" },
  { id: "epaules", label: "Épaules" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "jambes", label: "Jambes" },
  { id: "fessiers", label: "Fessiers" },
  { id: "abdos", label: "Abdos" },
  { id: "cardio", label: "Cardio" },
];

function CoachSheet({
  onClose,
  onResult,
  initialMuscles,
}: {
  onClose: () => void;
  onResult: (tpl: WorkoutTemplate) => void;
  initialMuscles?: string[];
}) {
  const [muscles, setMuscles] = useState<string[]>(
    initialMuscles && initialMuscles.length > 0 ? initialMuscles : ["pectoraux"],
  );
  const [duration, setDuration] = useState("45");
  const [equipment, setEquipment] = useState("salle complète");
  const [level, setLevel] = useState("intermédiaire");
  const [goal, setGoal] = useState("hypertrophie");

  const toggleMuscle = (id: string) =>
    setMuscles((arr) => (arr.includes(id) ? arr.filter((m) => m !== id) : [...arr, id]));

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("coach-workout", {
        body: {
          muscles: muscles.map((m) => MUSCLE_OPTIONS.find((o) => o.id === m)?.label ?? m),
          duration_minutes: Number(duration) || 45,
          equipment,
          level,
          goal,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        name: string;
        exercises: Array<{ name: string; sets: number; reps: number; weight?: number }>;
      };
    },
    onSuccess: (data) => {
      const tpl: WorkoutTemplate = {
        name: data.name,
        exercises: data.exercises.map((ex) => ({
          name: ex.name,
          sets: String(ex.sets ?? ""),
          reps: String(ex.reps ?? ""),
          weight: ex.weight != null && ex.weight > 0 ? String(ex.weight) : "",
          image_path: null,
        })),
      };
      toast.success("Séance générée — ajuste-la avant d'enregistrer");
      onResult(tpl);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (muscles.length === 0) {
      toast.error("Sélectionne au moins un groupe musculaire");
      return;
    }
    generate.mutate();
  };

  return (
    <Sheet title="Coach IA — Génère ma séance" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Groupes musculaires
          </label>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_OPTIONS.map((m) => {
              const active = muscles.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMuscle(m.id)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all " +
                    (active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground")
                  }
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Durée (min)" type="number" value={duration} onChange={setDuration} />
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Niveau
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="débutant">Débutant</option>
              <option value="intermédiaire">Intermédiaire</option>
              <option value="avancé">Avancé</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Matériel
            </label>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="salle complète">Salle complète</option>
              <option value="haltères + banc">Haltères + banc</option>
              <option value="élastiques">Élastiques</option>
              <option value="poids du corps">Poids du corps</option>
              <option value="kettlebell">Kettlebell</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Objectif
            </label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="hypertrophie">Hypertrophie</option>
              <option value="force">Force</option>
              <option value="endurance">Endurance</option>
              <option value="perte de gras">Perte de gras</option>
            </select>
          </div>
        </div>

        <SubmitButton pending={generate.isPending}>
          {generate.isPending ? "Génération…" : "Générer la séance"}
        </SubmitButton>
      </form>
    </Sheet>
  );
}

/* ============================ NUTRITION ============================ */

function NutritionTab() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data, isLoading } = useNutrition(date);
  const { data: goals } = useNutritionGoals();
  const del = useDeleteNutrition();
  const [open, setOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [prefill, setPrefill] = useState<MealPrefill | null>(null);

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

  const openManual = () => {
    setPrefill(null);
    setOpen(true);
  };

  const handleScanResult = (p: MealPrefill) => {
    setScanOpen(false);
    setPrefill(p);
    setOpen(true);
  };

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
        <button
          type="button"
          onClick={() => setGoalsOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <Target className="h-3.5 w-3.5" />
          Objectifs
        </button>
      </div>

      {/* Totaux + progression vs objectifs */}
      <div className="rounded-2xl border border-border bg-gradient-surface p-4 shadow-elevated">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Aujourd'hui
          </p>
          <p className="text-2xl font-bold text-primary">
            {totals.calories}
            {goals?.calories ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / {goals.calories} kcal
              </span>
            ) : (
              <span className="ml-1 text-xs font-normal text-muted-foreground">kcal</span>
            )}
          </p>
        </div>
        {goals?.calories ? (
          <ProgressBar value={totals.calories} target={goals.calories} className="mt-2" />
        ) : null}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MacroProgress label="Protéines" value={totals.proteins} target={goals?.proteins} color="text-accent" barColor="bg-accent" />
          <MacroProgress label="Glucides" value={totals.carbs} target={goals?.carbs} color="text-warning" barColor="bg-warning" />
          <MacroProgress label="Lipides" value={totals.fats} target={goals?.fats} color="text-destructive" barColor="bg-destructive" />
        </div>
      </div>

      {/* Bouton scan IA */}
      <button
        type="button"
        onClick={() => setScanOpen(true)}
        className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-4 text-left shadow-card transition-all active:scale-[0.99]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
          <Sparkles className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">Scanner mon repas</span>
          <span className="block text-[11px] text-muted-foreground">
            Une photo → kcal + macros estimés par l'IA.
          </span>
        </span>
      </button>

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
                    {m.calories ?? 0} kcal · P{m.proteins ?? 0} G{m.carbs ?? 0} L{m.fats ?? 0}
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

      <FabAdd onClick={openManual} label="Ajouter un repas" />
      {open && (
        <NutritionSheet date={date} prefill={prefill} onClose={() => setOpen(false)} />
      )}
      {goalsOpen && <GoalsSheet current={goals ?? null} onClose={() => setGoalsOpen(false)} />}
      {scanOpen && <MealScanSheet onClose={() => setScanOpen(false)} onResult={handleScanResult} />}
    </section>
  );
}

function MacroProgress({
  label,
  value,
  target,
  color,
  barColor,
}: {
  label: string;
  value: number;
  target: number | null | undefined;
  color: string;
  barColor: string;
}) {
  const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="rounded-xl bg-surface p-2">
      <p className={`text-base font-bold ${color}`}>
        {Math.round(value)}
        <span className="text-[10px] font-normal text-muted-foreground">
          {target ? ` / ${Math.round(target)}g` : "g"}
        </span>
      </p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {target ? (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function ProgressBar({
  value,
  target,
  className = "",
}: {
  value: number;
  target: number;
  className?: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-border ${className}`}>
      <div
        className={`h-full transition-all ${over ? "bg-destructive" : "bg-gradient-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ---- Goals editor ---- */

function GoalsSheet({
  current,
  onClose,
}: {
  current: NutritionGoals | null;
  onClose: () => void;
}) {
  const upsert = useUpsertNutritionGoals();
  const [form, setForm] = useState({
    calories: current?.calories != null ? String(current.calories) : "",
    proteins: current?.proteins != null ? String(current.proteins) : "",
    carbs: current?.carbs != null ? String(current.carbs) : "",
    fats: current?.fats != null ? String(current.fats) : "",
  });

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const numInt = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsert.mutateAsync({
      calories: numInt(form.calories),
      proteins: num(form.proteins),
      carbs: num(form.carbs),
      fats: num(form.fats),
    });
    onClose();
  };

  return (
    <Sheet title="Mes objectifs quotidiens" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Définis tes cibles. Laisse vide pour ne pas afficher de barre de progression.
        </p>
        <Field
          label="Calories (kcal)"
          type="number"
          value={form.calories}
          onChange={(v) => setForm({ ...form, calories: v })}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Prot. (g)"
            type="number"
            step="0.1"
            value={form.proteins}
            onChange={(v) => setForm({ ...form, proteins: v })}
          />
          <Field
            label="Gluc. (g)"
            type="number"
            step="0.1"
            value={form.carbs}
            onChange={(v) => setForm({ ...form, carbs: v })}
          />
          <Field
            label="Lip. (g)"
            type="number"
            step="0.1"
            value={form.fats}
            onChange={(v) => setForm({ ...form, fats: v })}
          />
        </div>
        <SubmitButton pending={upsert.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}

/* ---- Meal scanner ---- */

type MealPrefill = {
  name: string;
  meal: string;
  calories: string;
  proteins: string;
  carbs: string;
  fats: string;
};

async function fileToBase64Compressed(file: File): Promise<{ b64: string; mime: string }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const max = 1600;
  const ratio = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.85);
  return { b64: out.split(",")[1] ?? "", mime: "image/jpeg" };
}

function MealScanSheet({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (p: MealPrefill) => void;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: async (file: File) => {
      const { b64, mime } = await fileToBase64Compressed(file);
      setPreview(`data:${mime};base64,${b64}`);
      const { data, error } = await supabase.functions.invoke("scan-meal", {
        body: { image_base64: b64, mime_type: mime },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        name: string;
        meal?: string;
        calories: number;
        proteins: number;
        carbs: number;
        fats: number;
        confidence?: number;
        details?: string;
      };
    },
    onSuccess: (d) => {
      onResult({
        name: d.name,
        meal: d.meal ?? "dejeuner",
        calories: String(Math.round(d.calories ?? 0)),
        proteins: String(Math.round((d.proteins ?? 0) * 10) / 10),
        carbs: String(Math.round((d.carbs ?? 0) * 10) / 10),
        fats: String(Math.round((d.fats ?? 0) * 10) / 10),
      });
      const conf = d.confidence != null ? ` (${Math.round(d.confidence * 100)}%)` : "";
      toast.success(`Repas analysé${conf} — ajuste si besoin`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPick = (f: File | null | undefined) => {
    if (!f) return;
    scan.mutate(f);
  };

  return (
    <Sheet title="Scanner mon repas" onClose={onClose}>
      <div className="space-y-4">
        {!preview && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
              <Sparkles className="h-7 w-7" />
            </div>
            <p className="text-xs text-muted-foreground">
              L'IA estime calories et macros depuis ta photo.
            </p>
          </div>
        )}
        {preview && (
          <div className="overflow-hidden rounded-2xl border border-border">
            <img src={preview} alt="Aperçu" className="max-h-64 w-full object-cover" />
          </div>
        )}
        {scan.isPending && (
          <div className="flex flex-col items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyse en cours…
          </div>
        )}

        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />

        <div className="flex gap-2">
          <button
            type="button"
            disabled={scan.isPending}
            onClick={() => camRef.current?.click()}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
            Photo
          </button>
          <button
            type="button"
            disabled={scan.isPending}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface text-xs font-semibold disabled:opacity-60"
          >
            <ImageIcon className="h-4 w-4" />
            Galerie
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function NutritionSheet({
  date,
  onClose,
  prefill,
}: {
  date: string;
  onClose: () => void;
  prefill?: MealPrefill | null;
}) {
  const add = useAddNutrition();
  const [form, setForm] = useState({
    name: prefill?.name ?? "",
    meal: prefill?.meal ?? "petit-dej",
    calories: prefill?.calories ?? "",
    proteins: prefill?.proteins ?? "",
    carbs: prefill?.carbs ?? "",
    fats: prefill?.fats ?? "",
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
    <Sheet title={prefill ? "Confirmer le repas" : "Nouveau repas"} onClose={onClose}>
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
