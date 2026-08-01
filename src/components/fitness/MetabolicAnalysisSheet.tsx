import { AlertTriangle, Info } from "lucide-react";
import { Sheet } from "@/components/shared/FormComponents";
import { formatSignedKcal, type MetabolicAnalysisViewModel } from "@/lib/fitness/metabolicAnalysis";

interface MetabolicAnalysisSheetProps {
  analysis: MetabolicAnalysisViewModel;
  onClose: () => void;
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        {label}
        {sub && <span className="ml-1 text-[10px] text-muted-foreground/50">{sub}</span>}
      </span>
      <span className="shrink-0 text-xs font-semibold">{value}</span>
    </div>
  );
}

function Card({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={
        "rounded-2xl border p-4 " +
        (tone === "warning"
          ? "border-amber-400/30 bg-amber-400/5"
          : "border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-card")
      }
    >
      {children}
    </div>
  );
}

/**
 * Analyse détaillée des trois niveaux de TDEE (modélisé, observé,
 * adaptatif) — Phase 3C. Ne recalcule rien : consomme uniquement le
 * `MetabolicAnalysisViewModel` déjà assemblé par
 * `lib/fitness/metabolicAnalysis.ts` à partir des moteurs existants
 * (tdee.ts, adaptiveTdee.ts, adaptiveTdeeCalibration.ts).
 */
export function MetabolicAnalysisSheet({ analysis, onClose }: MetabolicAnalysisSheetProps) {
  const { modeled, observed, calibration, calorieGoalKcal } = analysis;

  return (
    <Sheet title="Analyse métabolique" onClose={onClose}>
      <div className="space-y-4">
        {/* TDEE adaptatif — en tête, la meilleure estimation actuelle */}
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            TDEE adaptatif
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            {calibration.adaptiveTdeeKcal != null ? `${calibration.adaptiveTdeeKcal} kcal/j` : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{calibration.stateLabel}</p>
        </Card>

        {/* Divergence suspecte */}
        {calibration.divergenceSuspected && (
          <Card tone="warning">
            <div className="mb-1.5 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold">Écart inhabituel détecté</span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {calibration.explanation}
            </p>
          </Card>
        )}

        {/* Calibration appliquée */}
        {calibration.modeledTdeeKcal != null && (
          <Card>
            <p className="mb-2 text-sm font-semibold">Calcul du TDEE adaptatif</p>
            <Row label="TDEE modélisé" value={`${calibration.modeledTdeeKcal} kcal`} />
            {calibration.observedTdeeKcal != null && (
              <>
                <Row label="TDEE observé" value={`${calibration.observedTdeeKcal} kcal`} />
                <Row label="Écart brut" value={formatSignedKcal(calibration.rawDeltaKcal ?? 0)} />
              </>
            )}
            <Row
              label="Correction appliquée"
              value={formatSignedKcal(calibration.appliedCorrectionKcal)}
            />
            <div className="my-1.5 border-t border-border" />
            <Row
              label="TDEE adaptatif"
              value={
                calibration.adaptiveTdeeKcal != null ? `${calibration.adaptiveTdeeKcal} kcal` : "—"
              }
            />
            {!calibration.divergenceSuspected && calibration.appliedCorrectionKcal !== 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {calibration.explanation}
              </p>
            )}
          </Card>
        )}

        {/* Dépense modélisée — composition */}
        <Card>
          <p className="mb-2 text-sm font-semibold">Dépense modélisée</p>
          {modeled.components.map((c) => (
            <Row
              key={c.key}
              label={c.label}
              sub={c.acronym}
              value={c.kcal != null ? `${c.kcal} kcal` : "—"}
            />
          ))}
          <div className="my-1.5 border-t border-border" />
          <Row
            label="TDEE modélisé"
            value={modeled.totalKcal != null ? `${modeled.totalKcal} kcal` : "—"}
          />
          {modeled.status === "incomplete" && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Profil métabolique ou activité incomplets — certaines composantes manquent encore.
            </p>
          )}
        </Card>

        {/* TDEE observé */}
        <Card>
          <p className="mb-2 text-sm font-semibold">TDEE observé</p>
          {observed.available ? (
            <>
              <Row label="Période analysée" value={`${observed.windowDays} j`} />
              <Row label="Pesées" value={String(observed.measurementCount)} />
              <Row label="Nutrition renseignée" value={`${observed.nutritionCoveragePercent} %`} />
              {observed.averageCaloriesKcal != null && (
                <Row label="Apport moyen" value={`${observed.averageCaloriesKcal} kcal/j`} />
              )}
              {observed.weeklyTrendKgPerWeek != null && (
                <Row
                  label="Tendance de poids"
                  value={`${observed.weeklyTrendKgPerWeek > 0 ? "+" : ""}${observed.weeklyTrendKgPerWeek} kg/semaine`}
                />
              )}
              <div className="my-1.5 border-t border-border" />
              <Row label="TDEE observé" value={`${observed.observedTdeeKcal} kcal`} />
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="text-[11px] font-medium">Fiabilité des données</span>
                <span className="text-[11px] font-semibold">{observed.confidence.label}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {observed.confidence.description}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium">Calibration en attente</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Cortex a besoin de davantage de données pour estimer ta dépense réelle.
              </p>
              <div className="mt-3 space-y-1.5">
                <Row
                  label="Pesées"
                  value={`${observed.progress.weighIns.current} / ${observed.progress.weighIns.required}`}
                />
                <Row
                  label="Nutrition renseignée"
                  value={`${observed.progress.nutritionCoveragePercent.current} % / ${observed.progress.nutritionCoveragePercent.required} %`}
                />
                <Row
                  label="Période"
                  value={`${observed.progress.calendarDays.current} / ${observed.progress.calendarDays.required} j`}
                />
              </div>
            </>
          )}
        </Card>

        {/* Objectif calorique — toujours séparé d'une dépense */}
        {calorieGoalKcal != null && (
          <Card>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Objectif calorique</span>
              <span className="text-xs font-semibold">{calorieGoalKcal} kcal/j</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Ton objectif alimentaire — distinct de la dépense estimée ci-dessus.
            </p>
          </Card>
        )}

        {/* Explicabilité */}
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            Comment Cortex calcule ces valeurs ?
          </summary>
          <div className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">Métabolisme de base</span> — basé sur
              âge, sexe, poids et taille.
            </p>
            <p>
              <span className="font-semibold text-foreground">Activité quotidienne</span> — estimée
              depuis le niveau d'activité hors sport renseigné dans Cortex.
            </p>
            <p>
              <span className="font-semibold text-foreground">Entraînement</span> — estimé depuis
              les séances enregistrées.
            </p>
            <p>
              <span className="font-semibold text-foreground">Digestion</span> — estimée depuis les
              macronutriments consommés.
            </p>
            <p>
              <span className="font-semibold text-foreground">TDEE observé</span> — déduit de
              l'apport énergétique et de la tendance du poids sur plusieurs semaines.
            </p>
            <p>
              <span className="font-semibold text-foreground">TDEE adaptatif</span> — combine le
              modèle physiologique et les données observées, avec des garde-fous contre les
              variations temporaires.
            </p>
          </div>
        </details>
      </div>
    </Sheet>
  );
}
