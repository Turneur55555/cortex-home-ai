import { useState } from "react";
import { useUpsertMetabolicProfile } from "@/hooks/useMetabolicProfile";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { isValidMetabolicAge, type BiologicalSex } from "@/lib/fitness/metabolism";
import {
  isNeatActivityLevel,
  NEAT_ACTIVITY_LEVELS,
  type NeatActivityLevelValue,
} from "@/lib/fitness/neat";

interface MetabolicProfileSheetProps {
  current: {
    sex: BiologicalSex | null;
    age: number | null;
    activityLevel: number | null;
  } | null;
  onClose: () => void;
}

/**
 * Édition du profil métabolique — âge, sexe biologique et niveau
 * d'activité quotidienne HORS SPORT — ouverte depuis la section
 * Métabolisme de Santé nutritionnelle quand le BMR et/ou le NEAT
 * Cortex-native ne peuvent pas encore être calculés. Poids et taille ne
 * sont jamais redemandés ici : réutilisés depuis body_tracking /
 * user_preferences. Le niveau d'activité ne doit JAMAIS être confondu avec
 * la fréquence d'entraînement (déjà comptabilisée séparément via l'EAT) —
 * voir NEAT_ACTIVITY_LEVELS.
 */
export function MetabolicProfileSheet({ current, onClose }: MetabolicProfileSheetProps) {
  const upsert = useUpsertMetabolicProfile();
  const [sex, setSex] = useState<BiologicalSex>(current?.sex ?? "homme");
  const [age, setAge] = useState(current?.age != null ? String(current.age) : "");
  const [activityLevel, setActivityLevel] = useState<NeatActivityLevelValue | null>(
    isNeatActivityLevel(current?.activityLevel) ? current!.activityLevel : null,
  );

  const ageNum = Number(age);
  const ageValid = age.trim() !== "" && isValidMetabolicAge(ageNum);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ageValid) return;
    await upsert.mutateAsync({ sex, age: ageNum, activityLevel });
    onClose();
  };

  return (
    <Sheet title="Profil métabolique" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Ces informations permettent d'estimer ton métabolisme de base (BMR) et ton activité
          quotidienne hors sport (NEAT). Ton poids et ta taille déjà enregistrés dans Cortex sont
          réutilisés automatiquement.
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

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Niveau d'activité quotidienne (hors sport)
          </label>
          <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
            Décris ton quotidien en dehors de tes séances d'entraînement — celles-ci sont déjà
            comptabilisées séparément.
          </p>
          <div className="space-y-2">
            {NEAT_ACTIVITY_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => setActivityLevel(level.value)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  activityLevel === level.value
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface"
                }`}
              >
                <p className="text-sm font-medium">{level.label}</p>
                <p className="text-[11px] text-muted-foreground">{level.description}</p>
              </button>
            ))}
          </div>
        </div>

        <SubmitButton pending={upsert.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}
