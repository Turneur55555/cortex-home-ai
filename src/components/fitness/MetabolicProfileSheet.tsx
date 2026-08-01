import { useState } from "react";
import { useUpsertMetabolicProfile } from "@/hooks/useMetabolicProfile";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { isValidMetabolicAge, type BiologicalSex } from "@/lib/fitness/metabolism";

interface MetabolicProfileSheetProps {
  current: { sex: BiologicalSex | null; age: number | null } | null;
  onClose: () => void;
}

/**
 * Édition du profil métabolique (âge + sexe biologique uniquement) —
 * ouverte depuis la section Métabolisme de Santé nutritionnelle quand le
 * BMR ne peut pas encore être calculé. Poids et taille ne sont jamais
 * redemandés ici : réutilisés depuis body_tracking / user_preferences.
 */
export function MetabolicProfileSheet({ current, onClose }: MetabolicProfileSheetProps) {
  const upsert = useUpsertMetabolicProfile();
  const [sex, setSex] = useState<BiologicalSex>(current?.sex ?? "homme");
  const [age, setAge] = useState(current?.age != null ? String(current.age) : "");

  const ageNum = Number(age);
  const ageValid = age.trim() !== "" && isValidMetabolicAge(ageNum);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ageValid) return;
    await upsert.mutateAsync({ sex, age: ageNum });
    onClose();
  };

  return (
    <Sheet title="Profil métabolique" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Ces informations permettent de calculer ton métabolisme de base (BMR). Ton poids et ta
          taille déjà enregistrés dans Cortex sont réutilisés automatiquement.
        </p>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sexe biologique
          </label>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as BiologicalSex)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-primary"
          >
            <option value="homme">Homme</option>
            <option value="femme">Femme</option>
          </select>
        </div>

        <div>
          <Field label="Âge" type="number" value={age} onChange={setAge} placeholder="ans" />
          {age.trim() !== "" && !ageValid && (
            <p className="mt-1.5 text-[11px] text-destructive">
              Âge invalide (entre 1 et 129 ans).
            </p>
          )}
        </div>

        <SubmitButton pending={upsert.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}
