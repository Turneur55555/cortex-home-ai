import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Activity,
  Sparkles,
  Leaf,
  Droplet,
  Flame,
  Wheat,
  Beef,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Heart,
  Apple,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/sante-nutritionnelle")({
  head: () => ({
    meta: [
      { title: "Santé nutritionnelle — ICORTEX" },
      { name: "description", content: "Le bilan global de la qualité de ton alimentation." },
    ],
  }),
  component: SanteNutritionnellePage,
});

// ────────────────────────────────────────────────────────────────
// Données fictives (structure UI uniquement, aucun calcul métier)
// ────────────────────────────────────────────────────────────────
const SCORE = 78;

const PILLARS = [
  { key: "quality", label: "Qualité", value: 82, icon: Leaf, tint: "from-emerald-400 to-cyan-400" },
  { key: "balance", label: "Équilibre", value: 74, icon: Activity, tint: "from-primary to-primary-glow" },
  { key: "regularity", label: "Régularité", value: 68, icon: TrendingUp, tint: "from-amber-400 to-orange-400" },
  { key: "hydration", label: "Hydratation", value: 90, icon: Droplet, tint: "from-sky-400 to-cyan-400" },
];

const MACROS = [
  { label: "Protéines", value: 92, unit: "%", icon: Beef, color: "text-red-400", bar: "from-red-500 to-orange-400" },
  { label: "Glucides", value: 78, unit: "%", icon: Wheat, color: "text-amber-400", bar: "from-amber-500 to-yellow-400" },
  { label: "Lipides", value: 65, unit: "%", icon: Flame, color: "text-fuchsia-400", bar: "from-fuchsia-500 to-pink-400" },
];

const MICRONUTRIENTS = [
  { name: "Fer", pct: 88, status: "ok" as const },
  { name: "Magnésium", pct: 72, status: "ok" as const },
  { name: "Vitamine D", pct: 42, status: "low" as const },
  { name: "Oméga-3", pct: 58, status: "low" as const },
  { name: "Vitamine B12", pct: 95, status: "ok" as const },
  { name: "Zinc", pct: 80, status: "ok" as const },
];

const INSIGHTS = [
  {
    icon: ShieldCheck,
    title: "Excellente régularité sur les protéines",
    body: "Tu couvres tes besoins depuis 12 jours consécutifs.",
    tone: "positive" as const,
  },
  {
    icon: AlertTriangle,
    title: "Vitamine D sous le seuil recommandé",
    body: "Envisage une exposition solaire ou une supplémentation.",
    tone: "warning" as const,
  },
  {
    icon: Sparkles,
    title: "Diversité alimentaire en hausse",
    body: "+18% d'aliments distincts consommés cette semaine.",
    tone: "positive" as const,
  },
];

const STATUS_STYLE = {
  ok: { text: "text-emerald-400", bar: "bg-gradient-to-r from-emerald-500 to-cyan-400" },
  low: { text: "text-amber-400", bar: "bg-amber-400/80" },
};

function SanteNutritionnellePage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <Link
          to="/profil"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Retour au profil"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">Santé nutritionnelle</h1>
          <p className="truncate text-[11px] text-muted-foreground">Le bilan global de ton alimentation</p>
        </div>
      </div>

      {/* Score global */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative mb-6 overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-primary/15 via-card/90 to-card/70 p-5 shadow-card"
      >
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
              <motion.circle
                cx="50"
                cy="50"
                r="42"
                stroke="url(#scoreGrad)"
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={2 * Math.PI * 42}
                initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - SCORE / 100) }}
                transition={{ duration: 1.1, ease: "easeOut" }}
              />
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--primary-glow, var(--primary)))" />
                </linearGradient>
              </defs>
            </svg>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold leading-none tracking-tight">{SCORE}</span>
              <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">/ 100</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Bilan global</span>
            </div>
            <p className="text-sm font-semibold leading-tight">Alimentation de très bonne qualité</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Ton profil est équilibré. Continue à diversifier tes sources de micronutriments.
            </p>
          </div>
        </div>
      </motion.section>

      {/* Piliers */}
      <Section title="Piliers nutritionnels">
        <div className="grid grid-cols-2 gap-2">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 * i, ease: "easeOut" }}
              className="rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-3 shadow-card"
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${p.tint} text-white/95`}
                >
                  <p.icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-bold tabular-nums">{p.value}</span>
              </div>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{p.label}</p>
              <div className="h-1 overflow-hidden rounded-full bg-white/8">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${p.tint}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${p.value}%` }}
                  transition={{ duration: 0.9, delay: 0.1 * i, ease: "easeOut" }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Répartition macros */}
      <Section title="Répartition des macronutriments">
        <div className="space-y-3 rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
          {MACROS.map((m, i) => (
            <div key={m.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
                  {m.label}
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {m.value}
                  {m.unit}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${m.bar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${m.value}%` }}
                  transition={{ duration: 0.9, delay: 0.05 * i, ease: "easeOut" }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Micronutriments */}
      <Section title="Micronutriments clés">
        <div className="space-y-2.5 rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
          {MICRONUTRIENTS.map((n) => {
            const st = STATUS_STYLE[n.status];
            return (
              <div key={n.name}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{n.name}</span>
                  <span className={`text-[10px] font-semibold tabular-nums ${st.text}`}>{n.pct}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/8">
                  <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${n.pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Insights */}
      <Section title="Observations">
        <div className="space-y-2">
          {INSIGHTS.map((it, i) => {
            const positive = it.tone === "positive";
            return (
              <motion.div
                key={it.title}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.05 * i, ease: "easeOut" }}
                className={
                  "flex gap-3 rounded-2xl border p-3.5 shadow-card " +
                  (positive
                    ? "border-emerald-400/20 bg-emerald-400/5"
                    : "border-amber-400/25 bg-amber-400/5")
                }
              >
                <span
                  className={
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
                    (positive ? "bg-emerald-400/15 text-emerald-400" : "bg-amber-400/15 text-amber-400")
                  }
                >
                  <it.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold leading-tight">{it.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{it.body}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* Disclaimer */}
      <p className="mt-2 rounded-2xl border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted-foreground">
        ⚠️ Ces indicateurs sont fournis à titre informatif et ne remplacent pas l'avis d'un professionnel de santé.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
