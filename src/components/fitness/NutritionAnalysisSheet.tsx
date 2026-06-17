import { useEffect, useState } from "react";
import { Loader2, Activity, AlertTriangle, Pill, Sparkles } from "lucide-react";
import { Sheet } from "@/components/shared/FormComponents";
import {
  useNutritionAnalysis,
  type AnalysisNutrient,
} from "@/hooks/useNutritionAnalysis";

const STATUS_STYLE: Record<
  AnalysisNutrient["status"],
  { bar: string; text: string; label: string }
> = {
  ok: { bar: "bg-gradient-to-r from-emerald-500 to-cyan-400", text: "text-emerald-400", label: "OK" },
  low: { bar: "bg-amber-400/80", text: "text-amber-400", label: "Bas" },
  deficient: { bar: "bg-red-400/80", text: "text-red-400", label: "Très bas" },
  unknown: { bar: "bg-white/15", text: "text-muted-foreground", label: "—" },
};

export function NutritionAnalysisSheet({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(7);
  const analysis = useNutritionAnalysis();
  const run = analysis.mutate;

  useEffect(() => {
    run(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const data = analysis.data;

  return (
    <Sheet title="Analyse nutritionnelle" onClose={onClose}>
      <div className="space-y-5">
        {/* Période */}
        <div className="flex rounded-xl border border-border bg-card/50 p-0.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={
                "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors " +
                (days === d
                  ? "bg-gradient-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {d} j
            </button>
          ))}
        </div>

        {analysis.isPending && (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-xs">Analyse en cours…</p>
          </div>
        )}

        {analysis.isError && (
          <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Impossible de lancer l'analyse pour le moment.
          </p>
        )}

        {data && !analysis.isPending && (
          <>
            {/* Couverture */}
            <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Couverture des données</span>
                <span className="ml-auto text-sm font-bold">{data.coverage}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                  style={{ width: `${Math.min(100, data.coverage)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {data.meals_analyzed} repas analysés sur {data.period_days} jours.{" "}
                {data.coverage < 50
                  ? "Couverture faible : logge plus de repas pour fiabiliser l'analyse."
                  : "Bonne base de données."}
              </p>
            </div>

            {/* Signaux */}
            {data.signals.length > 0 ? (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold">Signaux à surveiller</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.signals.map((s) => (
                    <span
                      key={s.key}
                      className={
                        "rounded-full border border-white/8 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium " +
                        STATUS_STYLE[s.status].text
                      }
                    >
                      {s.label} · {s.pct}%
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-xs text-emerald-300">
                Aucun signal de carence détecté sur la période (selon les données disponibles).
              </p>
            )}

            {/* Résumé IA */}
            {data.ai_summary && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Observations</span>
                </div>
                <p className="whitespace-pre-line text-[12px] leading-relaxed text-foreground/90">
                  {data.ai_summary}
                </p>
              </div>
            )}

            {/* Détail par nutriment */}
            <div className="space-y-3">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Apports estimés / jour
              </h3>
              {data.nutrients.map((n) => {
                const st = STATUS_STYLE[n.status];
                return (
                  <div key={n.key}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{n.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {n.intake} / {n.rda} {n.unit}
                        <span className={"ml-1 font-semibold " + st.text}>
                          {n.status === "unknown" ? "—" : `${n.pct}%`}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div
                        className={"h-full rounded-full transition-all " + st.bar}
                        style={{ width: `${Math.min(100, Math.max(2, n.pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Compléments pris en compte */}
            {data.supplements_considered.length > 0 && (
              <div className="rounded-2xl border border-border bg-card/50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Pill className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Compléments pris en compte</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.supplements_considered.map((s, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-white/8 bg-white/5 px-2.5 py-0.5 text-[10px] font-medium"
                    >
                      {s.name} · {s.daily}
                      {s.unit}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <p className="rounded-2xl border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted-foreground">
              ⚠️ {data.disclaimer}
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
