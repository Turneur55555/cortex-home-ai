import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useAddBodyMeasurement } from "@/hooks/use-fitness";
import { useMetabolicProfile } from "@/hooks/useMetabolicProfile";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import {
  BODY_FAT_METHOD_LABELS,
  CONFIDENCE_LABELS,
  computeFatMass,
  computeLeanMass,
} from "@/lib/fitness/bodyComposition";
import {
  estimateBodyFatFromMeasurements,
  type NavyMeasurementsInput,
} from "@/lib/fitness/bodyFatMeasurements";

/**
 * Sheet "Estimer avec mes mensurations" (Phase 6B) — méthode U.S. Navy
 * (voir `lib/fitness/bodyFatMeasurements.ts` pour la formule et sa
 * source). Réutilise sexe/taille déjà connus (§5 du brief) : ne demande
 * QUE les mensurations manquantes, jamais une resaisie du profil.
 */
export function EstimateBodyFatSheet({
  onClose,
  latestWeightKg,
}: {
  onClose: () => void;
  latestWeightKg: number | null;
}) {
  const { data: metabolicProfile } = useMetabolicProfile();
  const { prefs } = useUserPreferences();
  const add = useAddBodyMeasurement();

  const sex = metabolicProfile?.sex ?? null;
  const heightCm = prefs.height_cm ?? null;

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [waist, setWaist] = useState("");
  const [neck, setNeck] = useState("");
  const [hip, setHip] = useState("");
  const [weight, setWeight] = useState(latestWeightKg != null ? String(latestWeightKg) : "");

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const measurementsInput: NavyMeasurementsInput = useMemo(
    () => ({
      sex,
      heightCm,
      waistCm: num(waist),
      neckCm: num(neck),
      hipCm: sex === "femme" ? num(hip) : null,
    }),
    [sex, heightCm, waist, neck, hip],
  );

  const estimation = estimateBodyFatFromMeasurements(measurementsInput);
  const weightKg = num(weight);
  const fatMassKg =
    estimation.bodyFatPercent != null ? computeFatMass(weightKg, estimation.bodyFatPercent) : null;
  const leanMassKg =
    estimation.bodyFatPercent != null ? computeLeanMass(weightKg, estimation.bodyFatPercent) : null;

  if (sex == null || heightCm == null) {
    return (
      <Sheet title="Estimer avec mes mensurations" onClose={onClose}>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Cette estimation a besoin de ton sexe biologique et de ta taille, déjà renseignés dans ton
          profil métabolique (section Santé nutritionnelle). Complète-les d'abord, puis reviens ici.
        </p>
      </Sheet>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (estimation.status !== "ok" || estimation.bodyFatPercent == null) return;
    await add.mutateAsync({
      date,
      weight: weightKg,
      waist: num(waist),
      neck: num(neck),
      hips: sex === "femme" ? num(hip) : null,
      body_fat: estimation.bodyFatPercent,
      body_fat_method: "measurements",
      body_fat_formula: estimation.formula,
      body_fat_height_cm: heightCm,
      body_fat_sex: sex,
    });
    onClose();
  };

  return (
    <Sheet title="Estimer avec mes mensurations" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Cette valeur est une estimation calculée à partir de tes mensurations (méthode U.S. Navy).
          Elle peut différer d'une DEXA ou d'une balance à impédancemétrie.
        </p>

        <div className="rounded-xl border border-border bg-card/50 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Taille</span>
            <span className="font-semibold">{heightCm} cm (déjà connue)</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Sexe biologique</span>
            <span className="font-semibold">
              {sex === "homme" ? "Homme" : "Femme"} (déjà connu)
            </span>
          </div>
        </div>

        <Field label="Date" type="date" value={date} onChange={setDate} required />

        <div>
          <Field
            label="Tour de taille (cm)"
            type="number"
            step="0.1"
            value={waist}
            onChange={setWaist}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Au niveau du nombril, debout, relâché — pas après une expiration forcée.
          </p>
        </div>

        <div>
          <Field
            label="Tour de cou (cm)"
            type="number"
            step="0.1"
            value={neck}
            onChange={setNeck}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Juste en dessous du larynx (pomme d'Adam), légèrement incliné vers le bas.
          </p>
        </div>

        {sex === "femme" && (
          <div>
            <Field
              label="Tour de hanches (cm)"
              type="number"
              step="0.1"
              value={hip}
              onChange={setHip}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Au niveau le plus large des hanches.
            </p>
          </div>
        )}

        <Field
          label="Poids au moment de la mesure (kg)"
          type="number"
          step="0.1"
          value={weight}
          onChange={setWeight}
        />
        {latestWeightKg != null && (
          <p className="-mt-2 text-[11px] text-muted-foreground">
            Prérempli avec ta dernière pesée ({latestWeightKg} kg) — modifiable.
          </p>
        )}

        {estimation.status === "ok" && estimation.bodyFatPercent != null ? (
          <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimation</p>
            <p className="mt-1 text-2xl font-bold text-primary">≈ {estimation.bodyFatPercent} %</p>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">
                {BODY_FAT_METHOD_LABELS[estimation.method]}
              </span>
              <span>·</span>
              <span>{CONFIDENCE_LABELS[estimation.confidence!]}</span>
            </div>
            {(fatMassKg != null || leanMassKg != null) && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
                {fatMassKg != null && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Masse grasse estimée
                    </p>
                    <p className="text-sm font-bold">{fatMassKg} kg</p>
                  </div>
                )}
                {leanMassKg != null && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Masse maigre estimée
                    </p>
                    <p className="text-sm font-bold">{leanMassKg} kg</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          estimation.warnings[0] && (
            <p className="text-[11px] text-muted-foreground">{estimation.warnings[0]}</p>
          )
        )}

        {estimation.status === "ok" ? (
          <SubmitButton pending={add.isPending}>Enregistrer</SubmitButton>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-muted text-sm font-semibold text-muted-foreground opacity-60"
          >
            Enregistrer
          </button>
        )}
      </form>
    </Sheet>
  );
}
