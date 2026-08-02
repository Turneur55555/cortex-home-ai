import { useState } from "react";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { useCreatePhysicalGoal } from "@/hooks/usePhysicalGoal";
import {
  CALORIE_STRATEGY_RATES,
  type CalorieStrategyGoal,
  type FatLossRate,
  type MuscleGainRate,
} from "@/lib/fitness/calorieStrategy";
import { validatePhysicalGoalInput } from "@/lib/fitness/physicalGoal";
import {
  computeBodyFatTargetProjection,
  computeGoalTrajectory,
} from "@/lib/fitness/goalTrajectory";
import type { SelectedBodyComposition } from "@/lib/fitness/bodyCompositionForNutrition";
import type { BodyFatMethod } from "@/lib/fitness/bodyComposition";
import { localDateYMD } from "@/lib/dates";

/**
 * Sheet "Objectif physique" (Phase 8) — création d'un nouvel objectif.
 * Preview obligatoire avant enregistrement (§38 du brief) : trajectoire +
 * projection BF (si cible BF renseignée) toujours qualifiées comme des
 * estimations, jamais une date/valeur promise (§39). Un objectif actif
 * existant est automatiquement clôturé côté hook (§21).
 */
export function PhysicalGoalSheet({
  onClose,
  currentWeightKg,
  selectedBodyComposition,
  defaultGoal,
}: {
  onClose: () => void;
  currentWeightKg: number | null;
  selectedBodyComposition: SelectedBodyComposition | null;
  defaultGoal: CalorieStrategyGoal;
}) {
  const createGoal = useCreatePhysicalGoal();
  const today = localDateYMD();

  const [goal, setGoal] = useState<CalorieStrategyGoal>(defaultGoal);
  const [targetRate, setTargetRate] = useState<FatLossRate | MuscleGainRate | null>(
    goal === "maintenance" ? null : "moderate",
  );
  const [targetWeight, setTargetWeight] = useState("");
  const [targetBodyFat, setTargetBodyFat] = useState("");

  const targetWeightKg = targetWeight.trim() === "" ? null : Number(targetWeight);
  const targetBodyFatPercent = targetBodyFat.trim() === "" ? null : Number(targetBodyFat);

  const startingBodyFatPercent = selectedBodyComposition?.bodyFatPercent ?? null;
  const startingBodyFatMethod: BodyFatMethod | null = selectedBodyComposition?.method ?? null;
  const startingLeanMassKg = selectedBodyComposition?.leanMassKg ?? null;

  const validation = validatePhysicalGoalInput({
    goal,
    targetRate,
    targets: { targetWeightKg, targetBodyFatPercent },
    starting: { startingWeightKg: currentWeightKg, startingBodyFatPercent },
  });

  const trajectory =
    validation.status === "valid"
      ? computeGoalTrajectory({
          goal,
          targetRate,
          currentWeightKg,
          targetWeightKg,
          todayIso: today,
        })
      : null;

  const bodyFatProjection =
    validation.status === "valid" && targetBodyFatPercent != null
      ? computeBodyFatTargetProjection({
          currentWeightKg,
          currentBodyFatPercent: startingBodyFatPercent,
          targetBodyFatPercent,
          confidence: selectedBodyComposition?.confidence ?? null,
        })
      : null;

  const handleGoalSelect = (g: CalorieStrategyGoal) => {
    setGoal(g);
    setTargetRate(g === "maintenance" ? null : "moderate");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validation.status !== "valid") return;
    createGoal.mutate(
      {
        goal,
        targetRate,
        startedAt: today,
        startingWeightKg: currentWeightKg,
        startingBodyFatPercent,
        startingBodyFatMethod,
        startingLeanMassKg,
        targetWeightKg,
        targetBodyFatPercent,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet title="Objectif physique" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Objectif
          </p>
          <div className="flex rounded-xl border border-border bg-card/50 p-0.5">
            {(
              [
                { value: "fat_loss" as const, label: "Perte de gras" },
                { value: "maintenance" as const, label: "Maintien" },
                { value: "muscle_gain" as const, label: "Prise de masse" },
              ] as const
            ).map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => handleGoalSelect(g.value)}
                className={
                  "flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors " +
                  (goal === g.value
                    ? "bg-gradient-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {goal !== "maintenance" && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Rythme
            </p>
            <div className="flex gap-1.5">
              {Object.entries(CALORIE_STRATEGY_RATES[goal]).map(([key, rate]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTargetRate(key as FatLossRate | MuscleGainRate)}
                  className={
                    "flex-1 rounded-full border px-2 py-1.5 text-[11px] font-medium transition-colors " +
                    (targetRate === key
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-surface text-muted-foreground")
                  }
                >
                  {rate.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {goal !== "maintenance" && (
          <Field
            label="Poids cible (kg) — facultatif"
            type="number"
            step="0.1"
            value={targetWeight}
            onChange={setTargetWeight}
            placeholder={currentWeightKg != null ? String(currentWeightKg) : undefined}
          />
        )}

        <Field
          label="Body Fat cible (%) — facultatif"
          type="number"
          step="0.1"
          value={targetBodyFat}
          onChange={setTargetBodyFat}
        />

        {validation.status === "invalid" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
            {validation.reasons.map((r) => (
              <p key={r} className="text-[11px] text-destructive">
                {r}
              </p>
            ))}
          </div>
        )}

        {validation.status === "valid" && (currentWeightKg != null || targetWeightKg != null) && (
          <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Départ</p>
            <p className="text-sm font-bold">
              {currentWeightKg != null ? `${currentWeightKg} kg` : "Poids inconnu"}
            </p>

            {targetWeightKg != null && (
              <>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Cible
                </p>
                <p className="text-sm font-bold">{targetWeightKg} kg</p>
              </>
            )}

            {trajectory?.status === "ok" && trajectory.weeklyTargetChangeKg != null && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Rythme ≈ {trajectory.weeklyTargetChangeKg > 0 ? "+" : ""}
                {trajectory.weeklyTargetChangeKg} kg/semaine au poids actuel
              </p>
            )}
            {trajectory?.status === "ok" && trajectory.estimatedDurationWeeks != null && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Durée estimée ≈ {trajectory.estimatedDurationWeeks} semaine
                {trajectory.estimatedDurationWeeks > 1 ? "s" : ""} (estimation, pas une date
                promise)
              </p>
            )}
            {trajectory?.status === "already_at_target" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Le poids cible est déjà (quasiment) atteint.
              </p>
            )}
            {trajectory?.maintenanceZoneKg && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Zone de maintien ≈ {trajectory.maintenanceZoneKg.minKg}–
                {trajectory.maintenanceZoneKg.maxKg} kg
              </p>
            )}

            {bodyFatProjection?.status === "ok" && (
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Poids théorique à {targetBodyFatPercent} % de Body Fat ≈{" "}
                {bodyFatProjection.projectedWeightAtTargetBFKg} kg — projection théorique si la
                masse maigre actuelle était conservée, pas une prédiction exacte.
              </p>
            )}
            {bodyFatProjection?.status === "unavailable" && startingBodyFatPercent == null && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Aucune composition corporelle récente disponible pour projeter un poids à ce Body
                Fat.
              </p>
            )}
          </div>
        )}

        <SubmitButton pending={createGoal.isPending || validation.status !== "valid"}>
          {validation.status === "valid"
            ? "Enregistrer l'objectif"
            : "Corriger les valeurs ci-dessus"}
        </SubmitButton>
      </form>
    </Sheet>
  );
}
