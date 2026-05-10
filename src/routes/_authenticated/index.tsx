import { createFileRoute, Link } from "@tanstack/react-router";
import { Package, Dumbbell, FileText, Sparkles, Plus, Bell } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ICORTEX — Accueil" },
      { name: "description", content: "Votre tableau de bord intelligent ICORTEX." },
    ],
  }),
  component: HomePage,
});

const modules = [
  { to: "/stocks", label: "Stocks", icon: Package, accent: "from-violet-500 to-fuchsia-500", desc: "Frigo, habits, pharmacie" },
  { to: "/fitness", label: "Fitness", icon: Dumbbell, accent: "from-cyan-400 to-blue-500", desc: "Corps, séances, nutrition" },
  { to: "/documents", label: "Documents", icon: FileText, accent: "from-amber-400 to-orange-500", desc: "PDF analysés par IA" },
] as const;

function HomePage() {
  const { user } = useAuth();
  const greeting = getGreeting();
  const name = user?.email?.split("@")[0] ?? "vous";

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      {/* Header */}
      <header className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {greeting}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Bonjour, <span className="text-primary">{name}</span>
          </h1>
        </div>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>
      </header>

      {/* Hero card */}
      <section className="mb-8 overflow-hidden rounded-3xl border border-border bg-gradient-surface p-6 shadow-elevated">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Assistant IA
        </div>
        <h2 className="text-xl font-semibold leading-snug text-balance">
          Scannez un objet, l'IA s'occupe du reste.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Photo de votre frigo, garde-robe ou armoire à pharmacie — inventaire instantané et alertes automatiques.
        </p>
        <Link
          to="/stocks"
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-gradient-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow transition-opacity hover:opacity-95"
        >
          <Plus className="h-4 w-4" />
          Ajouter un item
        </Link>
      </section>

      {/* Modules grid */}
      <section className="mb-6">
        <h3 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Vos modules
        </h3>
        <ul className="space-y-3">
          {modules.map(({ to, label, icon: Icon, accent, desc }) => (
            <li key={to}>
              <Link
                to={to}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:border-primary/40 hover:shadow-elevated"
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} shadow-glow`}
                >
                  <Icon className="h-6 w-6 text-white" />
                </span>
                <div className="flex-1">
                  <p className="font-semibold leading-tight">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <span className="text-muted-foreground transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Stats placeholder */}
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="Items suivis" value="0" tone="primary" />
        <StatCard label="Alertes actives" value="0" tone="warning" />
      </section>
    </main>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "primary" | "warning" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={
          tone === "primary"
            ? "mt-2 text-3xl font-bold text-primary"
            : "mt-2 text-3xl font-bold text-warning"
        }
      >
        {value}
      </p>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}
