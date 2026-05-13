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

const EXERCISE_TO_MUSCLES: Array<{ pattern: RegExp; muscles: MuscleId[] }> = [
  // Pectoraux
  { pattern: /bench press|développé.?couché|pompes?|push.?up|dips?.*pec|écarté|butterfly|chest/i, muscles: ["pectoraux", "triceps", "epaules"] },
  { pattern: /développé.?incliné|incline/i, muscles: ["pectoraux", "epaules", "triceps"] },
  { pattern: /développé.?décliné|decline/i, muscles: ["pectoraux", "triceps"] },

  // Dos
  { pattern: /tirage|rowing|row|pull.?down|lat.?pull|traction|chin.?up|pull.?up/i, muscles: ["dos", "biceps"] },
  { pattern: /deadlift|soulevé.?de.?terre/i, muscles: ["dos", "lombaires", "fessiers", "ischio"] },

  // Épaules
  { pattern: /développé.?militaire|overhead.?press|shoulder.?press|press.?épaule/i, muscles: ["epaules", "triceps"] },
  { pattern: /élévation.?latérale|lateral.?raise/i, muscles: ["epaules"] },
  { pattern: /élévation.?frontale|front.?raise/i, muscles: ["epaules"] },
  { pattern: /oiseau|face.?pull|rear.?delt|reverse.?fly/i, muscles: ["epaules", "trapeze"] },
  { pattern: /shrug|haussement/i, muscles: ["trapeze"] },

  // Bras
  { pattern: /curl|bicep|boucle/i, muscles: ["biceps", "avant-bras"] },
  { pattern: /extension.?triceps?|skull.?crush|kick.?back|dips?/i, muscles: ["triceps"] },
  { pattern: /wrist.?curl|avant.?bras|forearm/i, muscles: ["avant-bras"] },

  // Jambes
  { pattern: /squat|presse.?cuisse|leg.?press|fente|lunge|hack/i, muscles: ["quadriceps", "fessiers"] },
  { pattern: /leg.?extension|extension.?jambe/i, muscles: ["quadriceps"] },
  { pattern: /leg.?curl|ischio|hamstring/i, muscles: ["ischio"] },
  { pattern: /hip.?thrust|pont.?fessier|glute/i, muscles: ["fessiers"] },
  { pattern: /mollet|calf|raise.*mollet/i, muscles: ["mollets"] },

  // Abdos
  { pattern: /crunch|abdo|planche|plank|sit.?up|gainage|ab.?wheel/i, muscles: ["abdos"] },
  { pattern: /oblique|rotation|russian.?twist|wood.?chop/i, muscles: ["obliques", "abdos"] },

  // Lombaires
  { pattern: /extension.?lombaire|back.?extension|hyperextension|good.?morning/i, muscles: ["lombaires"] },

  // Cardio — on ne mappe pas, pas de muscle spécifique
];

export function exerciseToMuscles(exerciseName: string): MuscleId[] {
  const name = exerciseName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  for (const rule of EXERCISE_TO_MUSCLES) {
    if (rule.pattern.test(name)) return rule.muscles;
  }
  return [];
}
