import { Minus, Star, TrendingDown, TrendingUp } from "lucide-react";
import { RECOVERY_COLORS, RECOVERY_LABELS } from "@/lib/fitness/recovery";
import type { MuscleContribution, Trend } from "@/lib/fitness/analysis";

// ============================================================
// Petits éléments visuels partagés par ExerciseAnalysisSheet (fiche d'un
// exercice déjà pratiqué) et ExerciseDiscoveryPage (fiche "encyclopédie"
// d'un exercice jamais pratiqué). Centralisés ici pour que les deux pages
// restent visuellement cohérentes sans dupliquer de style.
// ============================================================

export function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function StarRating({ stars }: { stars: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= stars ? "fill-warning text-warning" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

export function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
  if (trend === "flat") return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground/40" />;
}

export function Bar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/5">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

export function MuscleRow({ m }: { m: MuscleContribution }) {
  const c = RECOVERY_COLORS[m.recovery];
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-[11.5px] text-foreground/85">{m.label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-primary" style={{ width: `${m.solicitation}%` }} />
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold"
        style={{ color: c.stroke, background: c.fill }}
      >
        {RECOVERY_LABELS[m.recovery]}
      </span>
    </div>
  );
}

export function StatTileMini({
  icon,
  label,
  value,
  highlight,
  valueClass,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={`rounded-xl p-3 text-center ${highlight ? "bg-warning/10" : "bg-surface"}`}>
      <div className="mb-1 flex items-center justify-center gap-1">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className={`text-sm font-bold ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}

export function ObjChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}
