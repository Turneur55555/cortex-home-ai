// ============================================================
// Rendu générique d'une question Sensei — piloté par les données
// (SenseiQuestionSpec), zéro connaissance de discipline.
//
// Si une entrée existe dans CUSTOM_QUESTION_RENDERERS pour
// "disciplineId.questionId", elle prend le dessus (ex: le picker de
// muscles avec récupération). Sinon, rendu générique selon
// `question.type` — c'est ce chemin générique qui sera utilisé par
// toutes les disciplines futures qui n'ont pas besoin d'un widget
// spécial (HYROX, Course, Cardio, Activités accompagnées...).
// ============================================================

import type {
  DisciplineId,
  SenseiAnswerValue,
  SenseiQuestionSpec,
} from "@/lib/fitness/engines/types";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import { CUSTOM_QUESTION_RENDERERS } from "./senseiCustomRenderers";

export function QuestionRenderer({
  disciplineId,
  question,
  value,
  onChange,
  recoveryMap,
}: {
  disciplineId: DisciplineId;
  question: SenseiQuestionSpec;
  value: SenseiAnswerValue;
  onChange: (value: SenseiAnswerValue) => void;
  recoveryMap: Map<MuscleId, MuscleRecovery>;
}) {
  const Custom = CUSTOM_QUESTION_RENDERERS[`${disciplineId}.${question.id}`];
  if (Custom) return <Custom value={value} onChange={onChange} recoveryMap={recoveryMap} />;

  switch (question.type) {
    case "single-choice":
    case "location":
      return (
        <div className="grid grid-cols-2 gap-2">
          {(question.options ?? []).map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={
                  "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors " +
                  (active
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-card text-muted-foreground")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );

    case "multi-choice": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(question.options ?? []).map((opt) => {
            const active = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onChange(
                    active ? selected.filter((v) => v !== opt.value) : [...selected, opt.value],
                  )
                }
                className={
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all " +
                  (active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    }

    case "number":
      return (
        <input
          type="number"
          value={typeof value === "number" ? value : ((value as string | undefined) ?? "")}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-primary"
        />
      );

    case "text":
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-primary"
        />
      );

    default:
      return null;
  }
}

/** Résumé lisible d'une réponse — générique, utilisé par l'étape "Résumé".
 *  Cherche le libellé dans question.options si possible, sinon affiche la
 *  valeur brute (suffisant : les identifiants sont déjà des mots lisibles). */
export function formatAnswerForSummary(
  question: SenseiQuestionSpec,
  value: SenseiAnswerValue,
): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => question.options?.find((o) => o.value === v)?.label ?? v).join(", ");
  }
  const opt = question.options?.find((o) => o.value === value);
  if (opt) return opt.label;
  return String(value);
}

/** Validation générique minimale : un multi-choice doit avoir au moins une
 *  sélection. Les autres types sont considérés valides dès qu'une valeur
 *  (même par défaut) existe — pas de règle propre à une discipline ici. */
export function isAnswerValid(question: SenseiQuestionSpec, value: SenseiAnswerValue): boolean {
  if (question.type === "multi-choice") return Array.isArray(value) && value.length > 0;
  return value !== undefined && value !== "";
}
