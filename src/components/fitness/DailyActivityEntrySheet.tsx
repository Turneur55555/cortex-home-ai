import { useState } from "react";
import { useUpsertManualDailyActivity } from "@/hooks/useDailyActivity";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { localDateYMD } from "@/lib/dates";

interface DailyActivityEntrySheetProps {
  current?: {
    steps?: number | null;
    restingHr?: number | null;
    hrvMs?: number | null;
  };
  onClose: () => void;
}

/**
 * Saisie manuelle Cortex-native de pas/FC repos/HRV (Phase 10 §5/§6/§7) —
 * ouverte depuis les tuiles correspondantes de Santé nutritionnelle.
 * Cortex ne PRÉTEND PAS mesurer ces valeurs : il stocke/affiche une valeur
 * saisie (ou, plus tard, importée) — jamais un calcul ou une estimation.
 * Un seul Sheet pour les trois champs (tous facultatifs, au moins un
 * requis) plutôt que trois formulaires séparés — réutilise `daily_activity`
 * (`source: "manual"`), aucune nouvelle table.
 */
export function DailyActivityEntrySheet({ current, onClose }: DailyActivityEntrySheetProps) {
  const upsert = useUpsertManualDailyActivity();
  const [date] = useState(localDateYMD());
  const [steps, setSteps] = useState(current?.steps != null ? String(current.steps) : "");
  const [restingHr, setRestingHr] = useState(
    current?.restingHr != null ? String(current.restingHr) : "",
  );
  const [hrvMs, setHrvMs] = useState(current?.hrvMs != null ? String(current.hrvMs) : "");

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const hasAnyValue = steps.trim() !== "" || restingHr.trim() !== "" || hrvMs.trim() !== "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAnyValue) return;
    await upsert.mutateAsync({
      date,
      ...(steps.trim() !== "" ? { steps: num(steps) } : {}),
      ...(restingHr.trim() !== "" ? { restingHr: num(restingHr) } : {}),
      ...(hrvMs.trim() !== "" ? { hrvMs: num(hrvMs) } : {}),
    });
    onClose();
  };

  return (
    <Sheet title="Activité du jour" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Saisis ce que tu connais aujourd'hui — chaque champ est facultatif. Cortex n'invente
          jamais une mesure : il affiche exactement ce que tu renseignes.
        </p>
        <Field id="field-steps" label="Pas" type="number" value={steps} onChange={setSteps} />
        <Field
          id="field-resting-hr"
          label="FC au repos (bpm)"
          type="number"
          value={restingHr}
          onChange={setRestingHr}
        />
        <div>
          <Field id="field-hrv" label="HRV (ms)" type="number" value={hrvMs} onChange={setHrvMs} />
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            La méthode/l'appareil de mesure influence fortement la HRV — reste cohérent d'une mesure
            à l'autre pour que le suivi ait un sens.
          </p>
        </div>
        {!hasAnyValue && (
          <p className="text-[11px] text-muted-foreground">Renseigne au moins une valeur.</p>
        )}
        <SubmitButton pending={upsert.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}
