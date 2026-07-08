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

export const MUSCLE_META: Record<
  MuscleId,
  { label: string; recoveryHours: number; view: "front" | "back" | "both" }
> = {
  pectoraux: { label: "Pectoraux", recoveryHours: 72, view: "front" },
  dos: { label: "Dos", recoveryHours: 72, view: "back" },
  epaules: { label: "Épaules", recoveryHours: 72, view: "both" },
  biceps: { label: "Biceps", recoveryHours: 48, view: "front" },
  triceps: { label: "Triceps", recoveryHours: 48, view: "back" },
  abdos: { label: "Abdominaux", recoveryHours: 48, view: "front" },
  obliques: { label: "Obliques", recoveryHours: 48, view: "front" },
  quadriceps: { label: "Quadriceps", recoveryHours: 72, view: "front" },
  ischio: { label: "Ischio-jambiers", recoveryHours: 72, view: "back" },
  fessiers: { label: "Fessiers", recoveryHours: 72, view: "back" },
  mollets: { label: "Mollets", recoveryHours: 48, view: "both" },
  trapeze: { label: "Trapèzes", recoveryHours: 72, view: "back" },
  "avant-bras": { label: "Avant-bras", recoveryHours: 48, view: "both" },
  lombaires: { label: "Lombaires", recoveryHours: 72, view: "back" },
};

// Patterns écrits avec leurs accents pour rester lisibles (vocabulaire
// d'exercices en français) : ils sont compilés en regex désaccentuées par
// compileRules() ci-dessous, pour matcher exerciseToMuscles() qui compare
// toujours un nom d'exercice désaccentué. Ne JAMAIS construire ces patterns
// en `RegExp` directement (littéral `/développé/i`) — un accent littéral ne
// matchera plus jamais rien une fois comparé à une chaîne désaccentuée.
const EXERCISE_TO_MUSCLES: Array<{ pattern: string; muscles: MuscleId[] }> = [
  // Pectoraux
  {
    pattern: "bench press|développé.?couché|pompes?|push.?up|dips?.*pec|écarté|butterfly|chest",
    muscles: ["pectoraux", "triceps", "epaules"],
  },
  { pattern: "développé.?incliné|incline", muscles: ["pectoraux", "epaules", "triceps"] },
  { pattern: "développé.?décliné|decline", muscles: ["pectoraux", "triceps"] },

  // Dos
  {
    pattern: "tirage|rowing|row|pull.?down|lat.?pull|traction|chin.?up|pull.?up",
    muscles: ["dos", "biceps"],
  },
  { pattern: "deadlift|soulevé.?de.?terre", muscles: ["dos", "lombaires", "fessiers", "ischio"] },

  // Épaules
  {
    pattern: "développé.?militaire|overhead.?press|shoulder.?press|press.?épaule",
    muscles: ["epaules", "triceps"],
  },
  { pattern: "élévation.?latérale|lateral.?raise", muscles: ["epaules"] },
  { pattern: "élévation.?frontale|front.?raise", muscles: ["epaules"] },
  { pattern: "oiseau|face.?pull|rear.?delt|reverse.?fly", muscles: ["epaules", "trapeze"] },
  { pattern: "shrug|haussement", muscles: ["trapeze"] },

  // Bras
  { pattern: "curl|bicep|boucle", muscles: ["biceps", "avant-bras"] },
  { pattern: "extension.?triceps?|skull.?crush|kick.?back|dips?", muscles: ["triceps"] },
  { pattern: "wrist.?curl|avant.?bras|forearm", muscles: ["avant-bras"] },

  // Jambes
  {
    pattern: "squat|presse.?cuisse|leg.?press|fente|lunge|hack",
    muscles: ["quadriceps", "fessiers"],
  },
  { pattern: "leg.?extension|extension.?jambe", muscles: ["quadriceps"] },
  { pattern: "leg.?curl|ischio|hamstring", muscles: ["ischio"] },
  { pattern: "hip.?thrust|pont.?fessier|glute", muscles: ["fessiers"] },
  { pattern: "mollet|calf|raise.*mollet", muscles: ["mollets"] },

  // Abdos
  { pattern: "crunch|abdo|planche|plank|sit.?up|gainage|ab.?wheel", muscles: ["abdos"] },
  { pattern: "oblique|rotation|russian.?twist|wood.?chop", muscles: ["obliques", "abdos"] },

  // Lombaires
  {
    pattern: "extension.?lombaire|back.?extension|hyperextension|good.?morning",
    muscles: ["lombaires"],
  },

  // Cardio — on ne mappe pas, pas de muscle spécifique
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
