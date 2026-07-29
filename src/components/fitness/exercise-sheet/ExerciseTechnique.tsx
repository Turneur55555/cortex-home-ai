import { AlertTriangle, ListOrdered } from "lucide-react";
import { SectionCard } from "../ExerciseAnalysisPrimitives";

// ============================================================
// Technique — étapes d'exécution issues de config.instruction_steps_fr
// (dataset). Aucune consigne de tempo/respiration/amplitude n'est
// affichée : ces données n'existent nulle part dans le dataset ni dans
// Cortex, et en inventer serait un risque de blessure (voir
// ExerciseDiscoveryPage.tsx, principe conservé ici). Section absente tant
// qu'aucune étape n'est disponible plutôt que remplie de texte générique.
// ============================================================

export function ExerciseTechniqueCard({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;

  return (
    <SectionCard icon={<ListOrdered className="h-3.5 w-3.5" />} title="Technique d'exécution">
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
              {i + 1}
            </span>
            <span className="text-[12px] leading-relaxed text-foreground/85">{step}</span>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

/**
 * Erreurs fréquentes — section prête à l'emploi, non alimentée : aucune
 * source de données fiable n'existe encore (ni dataset, ni curation
 * Cortex). Le jour où une source existera (curation manuelle ou pipeline
 * IA vérifié), il suffira de passer `mistakes` non vide — la section
 * s'affiche automatiquement, sans changement de layout ni d'appelant.
 */
export function ExerciseMistakesCard({
  mistakes,
}: {
  mistakes?: Array<{ text: string; risk?: string; correction?: string; illustrationUrl?: string }>;
}) {
  if (!mistakes || mistakes.length === 0) return null;

  return (
    <SectionCard icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Erreurs fréquentes">
      <div className="space-y-3">
        {mistakes.map((m, i) => (
          <div key={i} className="rounded-xl border-l-2 border-destructive/60 bg-surface p-3">
            {m.illustrationUrl && (
              <img
                src={m.illustrationUrl}
                alt=""
                className="mb-2 max-h-32 w-full rounded-lg object-contain"
                loading="lazy"
              />
            )}
            <p className="text-[12px] font-medium text-foreground">{m.text}</p>
            {m.risk && (
              <p className="mt-1 text-[11px] leading-relaxed text-destructive/90">
                Risque : {m.risk}
              </p>
            )}
            {m.correction && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Correction : {m.correction}
              </p>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
