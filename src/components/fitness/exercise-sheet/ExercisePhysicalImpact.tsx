import { Gauge } from "lucide-react";
import { SectionCard, Bar } from "../ExerciseAnalysisPrimitives";
import type { TraitImpact } from "@/lib/fitness/analysis";

// ============================================================
// Impact sur le physique — même moteur (computePhysicalImpact), présentation
// en grille plutôt qu'en liste verticale pour un rendu plus premium.
// ============================================================

export function ExercisePhysicalImpactCard({ impact }: { impact: TraitImpact[] }) {
  if (impact.length === 0) return null;

  return (
    <SectionCard icon={<Gauge className="h-3.5 w-3.5" />} title="Impact sur le physique">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {impact.map((t) => (
          <div key={t.trait}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-foreground/85">{t.label}</span>
              <span className="font-semibold text-muted-foreground">{t.score}</span>
            </div>
            <Bar value={t.score} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
