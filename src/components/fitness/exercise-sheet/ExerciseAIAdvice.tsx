import { useState } from "react";
import { AlertTriangle, Brain, Loader2, Sparkles, Target } from "lucide-react";
import { SectionCard, ObjChip } from "../ExerciseAnalysisPrimitives";
import { useDeepExerciseAI } from "@/hooks/useDeepExerciseAI";
import { useTrainingObjective } from "@/hooks/useTrainingObjective";
import {
  OBJECTIVE_LABELS,
  type ExerciseAnalysis,
  type TrainingObjective,
} from "@/lib/fitness/analysis";

// ============================================================
// Conseils IA — une seule carte fusionnant l'analyse rédigée, l'objectif,
// les recommandations et les déséquilibres détectés (auparavant 4 cartes
// dispersées dans ExerciseAnalysisSheet). Toujours basée sur le même
// moteur déterministe (lib/fitness/analysis) + l'appel IA à la demande
// (analyze-exercise) — aucun contenu nouveau inventé ici, uniquement
// réorganisé.
// ============================================================

const OBJECTIVE_ORDER: TrainingObjective[] = [
  "force",
  "hypertrophie",
  "seche",
  "endurance",
  "posture",
  "general",
];

export function ExerciseAIAdviceCard({ analysis }: { analysis: ExerciseAnalysis }) {
  const deep = useDeepExerciseAI(analysis);
  const { objective: explicitObjective, setObjective } = useTrainingObjective();
  const [showObjective, setShowObjective] = useState(false);

  return (
    <SectionCard icon={<Sparkles className="h-3.5 w-3.5" />} title="Conseils IA">
      <div className="space-y-4">
        {/* Analyse rédigée */}
        <div>
          <p className="text-[12px] leading-relaxed text-foreground/85">
            {deep.text ?? analysis.narrative}
          </p>
          {deep.error && <p className="mt-2 text-[11px] text-destructive">{deep.error}</p>}
          {!deep.text && (
            <button
              onClick={deep.run}
              disabled={deep.isLoading}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary disabled:opacity-60"
            >
              {deep.isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Brain className="h-3.5 w-3.5" />
              )}
              Analyse IA approfondie
            </button>
          )}
        </div>

        {/* Objectif */}
        <div className="border-t border-border pt-3">
          <button
            onClick={() => setShowObjective((v) => !v)}
            className="flex w-full items-center justify-between text-[11px] text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" />
              Objectif :{" "}
              <span className="font-semibold text-foreground">
                {OBJECTIVE_LABELS[analysis.objective]}
              </span>
              {!explicitObjective && <span className="text-muted-foreground/70">(auto)</span>}
            </span>
            <span className="text-primary">{showObjective ? "Fermer" : "Modifier"}</span>
          </button>
          {showObjective && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ObjChip
                active={!explicitObjective}
                label="Auto"
                onClick={() => setObjective(null)}
              />
              {OBJECTIVE_ORDER.map((o) => (
                <ObjChip
                  key={o}
                  active={explicitObjective === o}
                  label={OBJECTIVE_LABELS[o]}
                  onClick={() => setObjective(o)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recommandations */}
        {analysis.recommendations.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Recommandations
            </p>
            <div className="space-y-2.5">
              {analysis.recommendations.map((r, i) => (
                <div key={i} className="rounded-xl bg-surface p-3">
                  <p className="text-[12px] font-semibold text-foreground">{r.text}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {r.rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Déséquilibres */}
        <div className="border-t border-border pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="h-3 w-3" /> Déséquilibres détectés
          </p>
          {analysis.imbalances.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground">
              Aucun déséquilibre majeur détecté à partir de tes données. 👍
            </p>
          ) : (
            <div className="space-y-2.5">
              {analysis.imbalances.map((im, i) => (
                <div
                  key={i}
                  className={`rounded-xl border-l-2 bg-surface p-3 ${
                    im.severity === "alert"
                      ? "border-destructive"
                      : im.severity === "warning"
                        ? "border-warning"
                        : "border-primary"
                  }`}
                >
                  <p className="text-[12px] font-medium text-foreground">{im.text}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {im.recommendation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
