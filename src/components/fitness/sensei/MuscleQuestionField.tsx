// ============================================================
// Champ de question "muscles" — spécifique à la Musculation.
//
// Déplacé tel quel depuis CoachSheet.tsx (phase 2) : aucune logique
// n'a changé, seul l'emplacement a bougé pour que CoachSheet devienne
// un orchestrateur générique. Ce fichier reste le SEUL endroit du
// code qui connaît la notion d'alias musculaire ("jambes") ou de
// détection cardio — aucune autre discipline n'en a besoin.
//
// Branché dans le Sensei via le registre de renderers custom
// (senseiCustomRenderers.tsx), jamais importé directement par
// l'orchestrateur générique.
// ============================================================

import { BatteryWarning } from "lucide-react";
import { MUSCLE_META, type MuscleId } from "@/lib/fitness/muscleMapping";
import { RECOVERY_COLORS, RECOVERY_LABELS, type MuscleRecovery } from "@/lib/fitness/recovery";
import {
  MUSCLE_AI_NAME,
  worstStatus,
  selectionRecovery,
  buildAiRecoveryContext,
  type AiRecoveryItem,
} from "@/lib/fitness/recoveryAdvice";
import {
  inferSenseiAutoProfile,
  type AutoProfileWorkout,
  type SenseiAutoProfile,
} from "@/lib/fitness/engines/senseiAutoProfile";

type MuscleDomainOption = { id: MuscleId; label: string };
type MuscleAliasOption = { id: "jambes"; label: string; isAlias: true; resolves: MuscleId[] };
type MuscleCardioOption = { id: "cardio"; label: string; isCardio: true };
type MuscleOption = MuscleDomainOption | MuscleAliasOption | MuscleCardioOption;

// Only the major groups shown in the coach UI — not all 14 MUSCLE_META entries.
// Labels are sourced from MUSCLE_META so they stay in sync with the domain.
export const MUSCLE_OPTIONS: MuscleOption[] = [
  { id: "pectoraux", label: MUSCLE_META.pectoraux.label },
  { id: "dos", label: MUSCLE_META.dos.label },
  { id: "epaules", label: MUSCLE_META.epaules.label },
  { id: "biceps", label: MUSCLE_META.biceps.label },
  { id: "triceps", label: MUSCLE_META.triceps.label },
  { id: "fessiers", label: MUSCLE_META.fessiers.label },
  { id: "abdos", label: MUSCLE_META.abdos.label },
  { id: "jambes", label: "Jambes", isAlias: true, resolves: ["quadriceps", "ischio", "fessiers"] },
  { id: "cardio", label: "Cardio", isCardio: true },
];

// Muscles fins du domaine sollicités par une option UI (vide pour le cardio).
function optionMuscleIds(opt: MuscleOption): MuscleId[] {
  if ("isCardio" in opt) return [];
  if ("isAlias" in opt) return opt.resolves;
  return [opt.id];
}

// Résout les sélections UI → MuscleId[] du domaine (cardio ignoré, alias étendus).
export function resolveMuscleIds(selected: string[]): MuscleId[] {
  return selected.flatMap((id) => {
    const opt = MUSCLE_OPTIONS.find((o) => o.id === id);
    return opt ? optionMuscleIds(opt) : [];
  });
}

export function hasCardio(selected: string[]): boolean {
  return selected.some((id) => {
    const opt = MUSCLE_OPTIONS.find((o) => o.id === id);
    return opt != null && "isCardio" in opt;
  });
}

// Noms de groupes attendus par l'edge (minuscules), dédupliqués. + "cardio" si sélectionné.
export function aiMuscleNames(selected: string[]): string[] {
  const names = resolveMuscleIds(selected).map((id) => MUSCLE_AI_NAME[id]);
  if (hasCardio(selected)) names.push("cardio");
  return [...new Set(names)];
}

/** Contexte Sensei (SenseiContext) pour StrengthWorkoutEngine : calculé par
 *  l'app à partir de la récupération musculaire connue et de l'historique de
 *  séances, jamais demandé à l'utilisateur (niveau/objectif ne sont plus des
 *  questions — voir senseiAutoProfile.ts). Seul point d'entrée utilisé par le
 *  registre de builders de contexte par discipline (voir senseiCustomRenderers.tsx). */
export function buildMuscuSenseiContext(
  selectedMuscleOptionIds: string[],
  recoveryMap: Map<MuscleId, MuscleRecovery>,
  workouts: ReadonlyArray<AutoProfileWorkout> | null | undefined,
): { recovery: AiRecoveryItem[]; autoProfile: SenseiAutoProfile } {
  const selectedIds = resolveMuscleIds(selectedMuscleOptionIds);
  return {
    recovery: buildAiRecoveryContext(selectedIds, recoveryMap),
    autoProfile: inferSenseiAutoProfile(workouts),
  };
}

export function MuscleQuestionField({
  value,
  onChange,
  recoveryMap,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  recoveryMap: Map<MuscleId, MuscleRecovery>;
}) {
  const toggleMuscle = (id: string) =>
    onChange(value.includes(id) ? value.filter((m) => m !== id) : [...value, id]);

  const selectedIds = resolveMuscleIds(value);
  const { fatigued: fatiguedSel, recovering: recoveringSel } = selectionRecovery(
    selectedIds,
    recoveryMap,
  );
  // Alternatives prêtes : options non sélectionnées dont tous les muscles sont 'ready'.
  const readyOptions = MUSCLE_OPTIONS.filter(
    (o) =>
      !("isCardio" in o) &&
      !value.includes(o.id) &&
      worstStatus(optionMuscleIds(o), recoveryMap) === "ready",
  );
  const hasRecoveryData = recoveryMap.size > 0;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {MUSCLE_OPTIONS.map((m) => {
          const active = value.includes(m.id);
          const status = "isCardio" in m ? "unknown" : worstStatus(optionMuscleIds(m), recoveryMap);
          const showDot = hasRecoveryData && status !== "unknown";
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggleMuscle(m.id)}
              title={showDot ? `Récupération : ${RECOVERY_LABELS[status]}` : undefined}
              className={
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all " +
                (active
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground")
              }
            >
              {showDot && (
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: RECOVERY_COLORS[status].stroke }}
                />
              )}
              {m.label}
            </button>
          );
        })}
      </div>

      {(fatiguedSel.length > 0 || recoveringSel.length > 0) && (
        <div className="mt-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-start gap-2">
            <BatteryWarning className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1 text-xs">
              {fatiguedSel.length > 0 && (
                <p className="text-foreground">
                  <span className="font-semibold">Encore fatigué :</span>{" "}
                  {fatiguedSel
                    .map((f) =>
                      f.hoursRemaining ? `${f.label} (récup ~${f.hoursRemaining}h)` : f.label,
                    )
                    .join(", ")}
                  . Le coach l'évitera ou l'allègera.
                </p>
              )}
              {recoveringSel.length > 0 && (
                <p className="text-muted-foreground">
                  <span className="font-semibold">En récupération :</span>{" "}
                  {recoveringSel
                    .map((f) => (f.hoursRemaining ? `${f.label} (~${f.hoursRemaining}h)` : f.label))
                    .join(", ")}
                  . Volume réduit conseillé.
                </p>
              )}
              {readyOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-muted-foreground">Prêts :</span>
                  {readyOptions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleMuscle(o.id)}
                      className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition hover:bg-primary/20"
                    >
                      + {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
