// ============================================================
// Copie fidèle du moteur RPG "Rang musculaire → Puissance Cortex", pour
// l'Edge Function `sync-cortex-ascension` — même esprit que
// `_shared/rankEngine.ts` (copie DÉLIBÉRÉE, pas un import : les Edge
// Functions Deno ne peuvent pas résoudre les alias `@/` ni sortir de
// `supabase/functions/`).
//
// ⚠️ SOURCE DE VÉRITÉ VISUELLE/CLIENTE :
//   - `src/lib/fitness/muscleMapping.ts` (exerciseToMuscles)
//   - `src/lib/fitness/rpg/muscleRank.ts` (computeMuscleRank, Méthode C)
//   - `src/lib/fitness/rpg/muscleAggregation.ts` (aggregateMuscleRanks,
//     pondération primaire/secondaire)
//   - `src/lib/fitness/rpg/cortexPower.ts` (computeCortexPower, Option 1)
//
// Toute modification de cette logique côté client DOIT être répercutée
// ici. Un test de parité existe côté client
// (`src/lib/fitness/rpg/cortexEngine.sql-parity.test.ts`) qui compare ce
// fichier aux quatre modules ci-dessus sur un large échantillon — il
// échoue si les deux divergent. Ce fichier ne recalcule PAS le Rang par
// exercice (déjà couvert par `_shared/rankEngine.ts`,
// `computeConfirmedTier`) : il part de rangs d'exercice déjà calculés.
// ============================================================

// ── Rang musculaire (muscleMapping.ts) ──────────────────────────────
export type MuscleId =
  | "pectoraux"
  | "dos"
  | "epaules"
  | "biceps"
  | "triceps"
  | "abdos"
  | "obliques"
  | "quadriceps"
  | "ischio"
  | "fessiers"
  | "mollets"
  | "trapeze"
  | "avant-bras"
  | "lombaires";

const EXERCISE_TO_MUSCLES: Array<{ pattern: string; muscles: MuscleId[] }> = [
  {
    pattern:
      "bench press|développé.?couché|développé.?convergent|pompes?|push.?up|dips?|écarté|butterfly|chest",
    muscles: ["pectoraux", "triceps", "epaules"],
  },
  { pattern: "développé.?incliné|incline", muscles: ["pectoraux", "epaules", "triceps"] },
  { pattern: "développé.?décliné|decline", muscles: ["pectoraux", "triceps"] },

  {
    pattern: "tirage|rowing|row|pull.?down|lat.?pull|traction|chin.?up|pull.?up",
    muscles: ["dos", "biceps"],
  },
  { pattern: "deadlift|soulevé.?de.?terre", muscles: ["dos", "lombaires", "fessiers", "ischio"] },

  { pattern: "rotation.{0,4}(externe|interne).{0,15}épaule|rotation.{0,15}épaule", muscles: ["epaules"] },
  {
    pattern: "développé.?militaire|overhead.?press|shoulder.?press|press.?épaule|push.?press",
    muscles: ["epaules", "triceps"],
  },
  { pattern: "élévations?.?latéral(e|es)?|lateral.?raise", muscles: ["epaules"] },
  { pattern: "élévations?.?frontale?s?|front.?raise", muscles: ["epaules"] },
  { pattern: "oiseau|face.?pull|rear.?delt|reverse.?fly|y.?raise", muscles: ["epaules", "trapeze"] },
  { pattern: "shrug|haussement", muscles: ["trapeze"] },
  { pattern: "farmer.?s?.?(carry|walk)", muscles: ["trapeze", "avant-bras"] },

  { pattern: "curl|bicep|boucle", muscles: ["biceps", "avant-bras"] },
  { pattern: "extension.{0,20}triceps?|skull.?crush|kick.?back|push.?down", muscles: ["triceps"] },
  { pattern: "wrist.?curl|avant.?bras|forearm", muscles: ["avant-bras"] },

  {
    pattern: "squat|presse.?cuisse|leg.?press|fente|lunge|hack",
    muscles: ["quadriceps", "fessiers"],
  },
  { pattern: "leg.?extension|extension.?jambe", muscles: ["quadriceps"] },
  { pattern: "leg.?curl|ischio|hamstring", muscles: ["ischio"] },
  { pattern: "hip.?thrust|pont.?fessier|glute", muscles: ["fessiers"] },
  { pattern: "mollet|calf|raise.*mollet", muscles: ["mollets"] },
  { pattern: "thruster", muscles: ["quadriceps", "fessiers", "epaules", "triceps"] },

  {
    pattern:
      "crunch|abdo|planche|plank|sit.?up|gainage|ab.?wheel|wheel.?rollout|relev[ée].{0,4}jambes?|leg.?raise",
    muscles: ["abdos"],
  },
  {
    pattern: "oblique|rotation.{0,4}(du.?)?(tronc|torse|taille)|russian.?twist|wood.?chop",
    muscles: ["obliques", "abdos"],
  },

  {
    pattern: "extension.?lombaire|extension.?dos|back.?extension|hyperextension|good.?morning",
    muscles: ["lombaires"],
  },
];

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

const COMPILED_RULES: Array<{ regex: RegExp; muscles: MuscleId[] }> = EXERCISE_TO_MUSCLES.map(
  (rule) => ({ regex: new RegExp(stripDiacritics(rule.pattern), "i"), muscles: rule.muscles }),
);

export function exerciseToMuscles(exerciseName: string): MuscleId[] {
  const name = stripDiacritics(exerciseName.toLowerCase());
  for (const rule of COMPILED_RULES) {
    if (rule.regex.test(name)) return rule.muscles;
  }
  return [];
}

// ── Puissance Cortex (cortexPower.ts) — Option 1, verrouillée ───────
export type BusteMuscleGroup =
  | "dos"
  | "pectoraux"
  | "epaules"
  | "abdos"
  | "biceps"
  | "triceps"
  | "trapeze"
  | "avant-bras";

export const BUSTE_MUSCLE_WEIGHTS: Record<BusteMuscleGroup, number> = {
  dos: 0.2,
  pectoraux: 0.15,
  epaules: 0.15,
  abdos: 0.15,
  biceps: 0.1,
  triceps: 0.1,
  trapeze: 0.1,
  "avant-bras": 0.05,
};

export const BUSTE_MUSCLES = Object.keys(BUSTE_MUSCLE_WEIGHTS) as BusteMuscleGroup[];
const BUSTE_MUSCLE_SET = new Set<string>(BUSTE_MUSCLES);

export const CORTEX_POWER_COMPLETENESS_MIN = 5;

export interface CortexPowerMuscleInput {
  muscle: BusteMuscleGroup;
  tierIndex: number | null;
}

export type CortexPowerResult =
  | { status: "partial"; evaluatedCount: number }
  | { status: "complete"; tierIndex: number; evaluatedCount: number };

export function computeCortexPower(inputs: CortexPowerMuscleInput[]): CortexPowerResult {
  const evaluated = inputs.filter(
    (i): i is { muscle: BusteMuscleGroup; tierIndex: number } => i.tierIndex != null,
  );

  if (evaluated.length < CORTEX_POWER_COMPLETENESS_MIN) {
    return { status: "partial", evaluatedCount: evaluated.length };
  }

  const weights = evaluated.map((e) => BUSTE_MUSCLE_WEIGHTS[e.muscle]);
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  const A = evaluated.reduce((sum, e, i) => sum + e.tierIndex * (weights[i] / totalWeight), 0);
  const logSum = evaluated.reduce(
    (sum, e, i) => sum + (weights[i] / totalWeight) * Math.log(e.tierIndex + 1),
    0,
  );
  const G = Math.exp(logSum) - 1;
  const F3 = 2 * G - A;

  const minTier = Math.min(...evaluated.map((e) => e.tierIndex));
  const power = Math.max(Math.round(F3), minTier);
  const tierIndex = Math.max(0, Math.min(29, power));

  return { status: "complete", tierIndex, evaluatedCount: evaluated.length };
}

// ── Rang musculaire (muscleRank.ts) — Méthode C ──────────────────────
export interface MuscleRankExerciseInput {
  key: string;
  tierIndex: number;
  weight?: number;
}

export type MuscleRankResult =
  | { status: "not_evaluated"; tierIndex: null; contributingCount: number }
  | { status: "evaluated"; tierIndex: number; contributingCount: number };

export const MUSCLE_RANK_MIN_CONTRIBUTING_EXERCISES = 2;
export const MUSCLE_RANK_MAX_SINGLE_WEIGHT_SHARE = 0.5;
export const MUSCLE_RANK_RELATIVE_CAP_DELTA = 8;

export function computeMuscleRank(exercises: MuscleRankExerciseInput[]): MuscleRankResult {
  const valid = exercises.filter(
    (e) => Number.isFinite(e.tierIndex) && e.tierIndex >= 0 && e.tierIndex <= 29,
  );

  if (valid.length < MUSCLE_RANK_MIN_CONTRIBUTING_EXERCISES) {
    return { status: "not_evaluated", tierIndex: null, contributingCount: valid.length };
  }

  const nominalWeights = valid.map((e) => Math.max(0, e.weight ?? 1));
  const totalNominal = nominalWeights.reduce((s, w) => s + w, 0);
  const cap = MUSCLE_RANK_MAX_SINGLE_WEIGHT_SHARE * totalNominal;
  const cappedWeights = nominalWeights.map((w) => Math.min(w, cap));
  const totalCapped = cappedWeights.reduce((s, w) => s + w, 0);

  const logSum = valid.reduce(
    (sum, e, i) => sum + (cappedWeights[i] / totalCapped) * Math.log(e.tierIndex + 1),
    0,
  );
  const geometric = Math.exp(logSum) - 1;

  const sortedTiers = valid.map((e) => e.tierIndex).sort((a, b) => b - a);
  const secondBestTier = sortedTiers[1];
  const relativeCap = secondBestTier + MUSCLE_RANK_RELATIVE_CAP_DELTA;

  const clamped = Math.min(geometric, relativeCap);
  const tierIndex = Math.max(0, Math.min(29, Math.round(clamped)));

  return { status: "evaluated", tierIndex, contributingCount: valid.length };
}

// ── Agrégation exercices → muscles (muscleAggregation.ts) ────────────
export const EXERCISE_ROLE_WEIGHT = {
  primary: 1,
  secondary: 0.4,
} as const;

export interface RankedExercise {
  key: string;
  name: string;
  tierIndex: number;
}

function roleFor(muscle: BusteMuscleGroup, allMuscles: MuscleId[]): "primary" | "secondary" {
  return allMuscles[0] === muscle ? "primary" : "secondary";
}

export function aggregateMuscleRanks(
  exercises: RankedExercise[],
): Record<BusteMuscleGroup, MuscleRankResult> {
  const byMuscle = new Map<
    BusteMuscleGroup,
    Array<{ key: string; tierIndex: number; weight: number }>
  >();
  for (const muscle of BUSTE_MUSCLES) byMuscle.set(muscle, []);

  for (const ex of exercises) {
    const allMuscles = exerciseToMuscles(ex.name);
    const busteMuscles = allMuscles.filter((m) => BUSTE_MUSCLE_SET.has(m));
    for (const muscle of busteMuscles as BusteMuscleGroup[]) {
      const role = roleFor(muscle, allMuscles);
      byMuscle.get(muscle)!.push({
        key: ex.key,
        tierIndex: ex.tierIndex,
        weight: EXERCISE_ROLE_WEIGHT[role],
      });
    }
  }

  const result = {} as Record<BusteMuscleGroup, MuscleRankResult>;
  for (const muscle of BUSTE_MUSCLES) {
    result[muscle] = computeMuscleRank(byMuscle.get(muscle)!);
  }
  return result;
}

// ── Identité d'exercice (recentExercises.ts / exerciseCatalog.ts) ────
function normalizeName(s: string): string {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function identityKey(ex: { name: string; exercise_reference_id?: string | null }): string {
  if (ex.exercise_reference_id) return `id:${ex.exercise_reference_id}`;
  return `name:${normalizeName(ex.name)}`;
}
