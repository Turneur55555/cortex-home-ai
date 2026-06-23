import { useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from "recharts";
import {
  ArrowLeft,
  Download,
  Loader2,
  AlertCircle,
  Dumbbell,
  Apple,
  Scale,
  Sparkles,
  LayoutDashboard,
} from "lucide-react";
import { useWeeklyReport } from "@/hooks/useWeeklyReports";
import type { WeeklyReport } from "@/types/weekly-report";

type Tab = "resume" | "fitness" | "nutrition" | "corps" | "ia";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "resume", label: "Résumé", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { id: "fitness", label: "Fitness", icon: <Dumbbell className="h-3.5 w-3.5" /> },
  { id: "nutrition", label: "Nutrition", icon: <Apple className="h-3.5 w-3.5" /> },
  { id: "corps", label: "Corps", icon: <Scale className="h-3.5 w-3.5" /> },
  { id: "ia", label: "Analyse IA", icon: <Sparkles className="h-3.5 w-3.5" /> },
];

function formatWeekRange(weekStart: string, weekEnd: string) {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(weekEnd + "T00:00:00");
  return `${start.getDate()} – ${end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function ReportDetail({ id }: { id: string }) {
  const { data: report, isLoading, error } = useWeeklyReport(id);
  const [activeTab, setActiveTab] = useState<Tab>("resume");
  const contentRef = useRef<HTMLDivElement>(null);

  const handleExportPdf = async () => {
    if (!report || !contentRef.current) return;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: "#0f0f13",
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`rapport-semaine-${report.week_start}.pdf`);
    } catch (e) {
      console.error("PDF export failed:", e);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Rapport introuvable</p>
        <Link to="/rapports" className="text-xs font-medium text-primary">
          ← Retour aux rapports
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col pb-6 pt-12">
      {/* Header */}
      <header className="mb-4 flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <Link to="/rapports" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-base font-bold leading-tight">
              {formatWeekRange(report.week_start, report.week_end)}
            </h1>
            <p className="text-[11px] text-muted-foreground">Rapport hebdomadaire</p>
          </div>
        </div>
        <button
          onClick={handleExportPdf}
          className="flex h-8 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold transition-colors hover:border-primary/40"
        >
          <Download className="h-3.5 w-3.5" />
          PDF
        </button>
      </header>

      {/* Tab nav */}
      <div className="mb-4 overflow-x-auto px-5">
        <div className="flex gap-1.5 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div ref={contentRef} className="flex-1 px-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "resume" && <ResumeTab report={report} />}
            {activeTab === "fitness" && <FitnessTab report={report} />}
            {activeTab === "nutrition" && <NutritionTab report={report} />}
            {activeTab === "corps" && <CorpsTab report={report} />}
            {activeTab === "ia" && <IATab report={report} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Résumé Tab ────────────────────────────────────────────────────────────────

function ResumeTab({ report }: { report: WeeklyReport }) {
  const s = report.summary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Séances" value={String(s.sessions_count ?? 0)} sub="cette semaine" />
        <KpiCard label="Temps total" value={`${s.total_training_time ?? 0} min`} sub="d'entraînement" />
        <KpiCard label="Calories moy." value={`${s.avg_calories ?? 0} kcal`} sub="par jour" />
        <KpiCard label="Protéines moy." value={`${s.avg_proteins ?? 0} g`} sub="par jour" />
      </div>

      {s.current_weight != null && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Poids actuel</p>
              <p className="mt-0.5 text-2xl font-bold">{s.current_weight} kg</p>
            </div>
            {s.weight_evolution != null && (
              <div
                className={`rounded-xl px-3 py-1.5 text-sm font-bold ${
                  s.weight_evolution < 0
                    ? "bg-emerald-500/15 text-emerald-400"
                    : s.weight_evolution > 0
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-border/30 text-muted-foreground"
                }`}
              >
                {s.weight_evolution > 0 ? "+" : ""}
                {s.weight_evolution} kg
              </div>
            )}
          </div>
        </div>
      )}

      {s.goals_respect_pct > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Respect des objectifs</p>
            <p className="text-sm font-bold">{s.goals_respect_pct}%</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                s.goals_respect_pct >= 80
                  ? "bg-gradient-to-r from-emerald-500 to-cyan-400"
                  : s.goals_respect_pct >= 50
                  ? "bg-gradient-to-r from-amber-500 to-orange-400"
                  : "bg-gradient-to-r from-red-500 to-red-400"
              }`}
              style={{ width: `${Math.min(100, s.goals_respect_pct)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fitness Tab ───────────────────────────────────────────────────────────────

function FitnessTab({ report }: { report: WeeklyReport }) {
  const f = report.fitness_data;
  const chartData = f.top_exercises.map((ex) => ({
    name: ex.name.length > 12 ? ex.name.slice(0, 12) + "…" : ex.name,
    séries: ex.sets,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Volume total" value={`${f.total_volume ?? 0} kg`} sub="charge déplacée" />
        <KpiCard label="Analyse récup." value={f.recovery_analysis ?? "—"} sub="" />
      </div>

      {f.top_exercises.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Exercices principaux
          </p>
          <div className="space-y-2">
            {f.top_exercises.map((ex, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2">
                <span className="text-xs font-medium">{ex.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {ex.sets} × {ex.reps}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Séries par exercice
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: "rgba(255,255,255,0.8)" }}
              />
              <Bar dataKey="séries" fill="#6c63ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {f.most_worked_muscles.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Muscles les plus sollicités
          </p>
          <div className="flex flex-wrap gap-1.5">
            {f.most_worked_muscles.map((m, i) => (
              <span key={i} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nutrition Tab ─────────────────────────────────────────────────────────────

function NutritionTab({ report }: { report: WeeklyReport }) {
  const n = report.nutrition_data;
  const macroData = [
    { name: "Protéines", value: n.avg_proteins ?? 0, color: "#6c63ff" },
    { name: "Glucides", value: n.avg_carbs ?? 0, color: "#4dafff" },
    { name: "Lipides", value: n.avg_fats ?? 0, color: "#ff6c6c" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Calories moy." value={`${n.avg_calories ?? 0} kcal`} sub="par jour" />
        <KpiCard label="Respect objectifs" value={`${n.goals_respect_pct ?? 0}%`} sub="nutrition" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Macronutriments moyens / jour
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={macroData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} />
            <Tooltip
              contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {macroData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MacroChip label="Protéines" value={`${n.avg_proteins ?? 0}g`} color="text-violet-400" />
        <MacroChip label="Glucides" value={`${n.avg_carbs ?? 0}g`} color="text-blue-400" />
        <MacroChip label="Lipides" value={`${n.avg_fats ?? 0}g`} color="text-red-400" />
      </div>

      {n.best_days.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Meilleurs jours
          </p>
          <div className="flex flex-wrap gap-1.5">
            {n.best_days.map((d, i) => (
              <span key={i} className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                {new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Corps Tab ─────────────────────────────────────────────────────────────────

const MEASUREMENT_LABELS: Record<string, string> = {
  chest: "Poitrine",
  waist: "Taille",
  hips: "Hanches",
  left_arm: "Bras gauche",
  right_arm: "Bras droit",
  left_thigh: "Cuisse gauche",
  right_thigh: "Cuisse droite",
};

function CorpsTab({ report }: { report: WeeklyReport }) {
  const b = report.body_data;
  const hasWeightData = b.weight_start != null || b.weight_end != null;
  const chartData = hasWeightData
    ? [
        { label: "Début", poids: b.weight_start },
        { label: "Fin", poids: b.weight_end },
      ].filter((d) => d.poids != null)
    : [];

  return (
    <div className="space-y-4">
      {hasWeightData ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {b.weight_start != null && (
              <KpiCard label="Poids début" value={`${b.weight_start} kg`} sub="semaine" />
            )}
            {b.weight_end != null && (
              <KpiCard label="Poids fin" value={`${b.weight_end} kg`} sub="semaine" />
            )}
          </div>

          {b.weight_delta != null && (
            <div
              className={`rounded-2xl border p-4 ${
                b.weight_delta < 0
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : b.weight_delta > 0
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-border bg-card"
              }`}
            >
              <p className="text-xs text-muted-foreground">Évolution du poids</p>
              <p className={`mt-1 text-2xl font-bold ${b.weight_delta < 0 ? "text-emerald-400" : b.weight_delta > 0 ? "text-amber-400" : "text-foreground"}`}>
                {b.weight_delta > 0 ? "+" : ""}
                {b.weight_delta} kg
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {b.physical_progress_estimate}
              </p>
            </div>
          )}

          {chartData.length >= 2 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Évolution poids
              </p>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6c63ff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6c63ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Area type="monotone" dataKey="poids" stroke="#6c63ff" fill="url(#weightGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <Scale className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Aucune donnée corporelle cette semaine</p>
        </div>
      )}

      {Object.keys(b.measurements_evolution).length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Évolution des mensurations
          </p>
          <div className="space-y-2">
            {Object.entries(b.measurements_evolution).map(([key, delta]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs">{MEASUREMENT_LABELS[key] ?? key}</span>
                <span
                  className={`text-xs font-semibold ${
                    delta < 0 ? "text-emerald-400" : delta > 0 ? "text-amber-400" : "text-muted-foreground"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta} cm
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analyse IA Tab ────────────────────────────────────────────────────────────

function IATab({ report }: { report: WeeklyReport }) {
  const ai = report.ai_analysis;
  const isEmpty = !ai.strengths?.length && !ai.weaknesses?.length && !ai.risks?.length && !ai.recommendations?.length;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Sparkles className="mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Analyse IA non disponible</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ai.strengths?.length > 0 && (
        <AISection title="Points forts" items={ai.strengths} color="emerald" />
      )}
      {ai.weaknesses?.length > 0 && (
        <AISection title="Axes d'amélioration" items={ai.weaknesses} color="red" />
      )}
      {ai.risks?.length > 0 && (
        <AISection title="Risques détectés" items={ai.risks} color="orange" />
      )}
      {ai.recommendations?.length > 0 && (
        <AISection title="Recommandations" items={ai.recommendations} color="blue" />
      )}
    </div>
  );
}

type ColorKey = "emerald" | "red" | "orange" | "blue";

const COLOR_MAP: Record<ColorKey, { bg: string; border: string; text: string; dot: string }> = {
  emerald: {
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  red: {
    bg: "bg-red-500/8",
    border: "border-red-500/20",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  orange: {
    bg: "bg-orange-500/8",
    border: "border-orange-500/20",
    text: "text-orange-400",
    dot: "bg-orange-400",
  },
  blue: {
    bg: "bg-blue-500/8",
    border: "border-blue-500/20",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
};

function AISection({ title, items, color }: { title: string; items: string[]; color: ColorKey }) {
  const c = COLOR_MAP[color];
  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-4`}>
      <p className={`mb-3 text-xs font-semibold uppercase tracking-wider ${c.text}`}>{title}</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
            <span className="text-xs leading-relaxed">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <p className="text-base font-bold">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-foreground/80">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MacroChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 px-2 py-2 text-center">
      <p className={`text-sm font-bold ${color}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
