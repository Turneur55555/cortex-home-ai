export type CatalogExercise = {
  name: string;
  group: string;
};

export const EXERCISE_CATALOG: CatalogExercise[] = [
  // Pectoraux
  { name: "Développé couché barre", group: "Pectoraux" },
  { name: "Développé couché haltères", group: "Pectoraux" },
  { name: "Développé incliné barre", group: "Pectoraux" },
  { name: "Développé incliné haltères", group: "Pectoraux" },
  { name: "Développé décliné haltères", group: "Pectoraux" },
  { name: "Écarté couché haltères", group: "Pectoraux" },
  { name: "Écarté câble croisé", group: "Pectoraux" },
  { name: "Pec deck machine", group: "Pectoraux" },
  { name: "Pompes", group: "Pectoraux" },
  { name: "Dips", group: "Pectoraux" },

  // Dos
  { name: "Tirage vertical poignée large", group: "Dos" },
  { name: "Tirage vertical poignée serrée", group: "Dos" },
  { name: "Tirage vertical poignée neutre", group: "Dos" },
  { name: "Rowing barre", group: "Dos" },
  { name: "Rowing haltère unilatéral", group: "Dos" },
  { name: "Rowing machine poignée V", group: "Dos" },
  { name: "Tirage horizontal câble", group: "Dos" },
  { name: "Traction prise large", group: "Dos" },
  { name: "Traction prise neutre", group: "Dos" },
  { name: "Pull-over haltère", group: "Dos" },

  // Épaules
  { name: "Développé militaire barre", group: "Épaules" },
  { name: "Développé militaire haltères", group: "Épaules" },
  { name: "Élévations latérales haltères", group: "Épaules" },
  { name: "Élévations latérales câble", group: "Épaules" },
  { name: "Élévations frontales haltères", group: "Épaules" },
  { name: "Oiseau haltères", group: "Épaules" },
  { name: "Face pull câble", group: "Épaules" },
  { name: "Arnold press", group: "Épaules" },

  // Biceps
  { name: "Curl barre droite", group: "Biceps" },
  { name: "Curl barre EZ", group: "Biceps" },
  { name: "Curl haltères alternés", group: "Biceps" },
  { name: "Curl marteau haltères", group: "Biceps" },
  { name: "Curl incliné haltères", group: "Biceps" },
  { name: "Curl câble basse poulie", group: "Biceps" },
  { name: "Curl concentré haltère", group: "Biceps" },

  // Triceps
  { name: "Extension triceps câble corde", group: "Triceps" },
  { name: "Extension triceps câble barre droite", group: "Triceps" },
  { name: "Barre au front", group: "Triceps" },
  { name: "Extension triceps haltère unilatéral", group: "Triceps" },
  { name: "Kickback triceps haltère", group: "Triceps" },
  { name: "Dips triceps banc", group: "Triceps" },

  // Jambes
  { name: "Squat barre", group: "Jambes" },
  { name: "Squat gobelet", group: "Jambes" },
  { name: "Squat hack machine", group: "Jambes" },
  { name: "Leg press", group: "Jambes" },
  { name: "Fente avant barre", group: "Jambes" },
  { name: "Fente avant haltères", group: "Jambes" },
  { name: "Fente bulgare haltères", group: "Jambes" },
  { name: "Leg extension machine", group: "Jambes" },
  { name: "Leg curl allongé machine", group: "Jambes" },
  { name: "Leg curl assis machine", group: "Jambes" },
  { name: "Romanian deadlift", group: "Jambes" },

  // Fessiers
  { name: "Hip thrust barre", group: "Fessiers" },
  { name: "Hip thrust machine", group: "Fessiers" },
  { name: "Abducteur machine", group: "Fessiers" },
  { name: "Kickback câble fessier", group: "Fessiers" },
  { name: "Soulevé de terre jambes tendues", group: "Fessiers" },

  // Abdominaux
  { name: "Crunch", group: "Abdominaux" },
  { name: "Crunch câble", group: "Abdominaux" },
  { name: "Planche", group: "Abdominaux" },
  { name: "Relevé de jambes suspendu", group: "Abdominaux" },
  { name: "Relevé de buste banc incliné", group: "Abdominaux" },
  { name: "Russian twist", group: "Abdominaux" },
  { name: "Mountain climbers", group: "Abdominaux" },
  { name: "Wheel rollout", group: "Abdominaux" },

  // Mollets
  { name: "Extension mollets debout", group: "Mollets" },
  { name: "Extension mollets assis machine", group: "Mollets" },
  { name: "Extension mollets leg press", group: "Mollets" },

  // Polyarticulaire
  { name: "Soulevé de terre", group: "Polyarticulaire" },
  { name: "Soulevé de terre sumo", group: "Polyarticulaire" },
  { name: "Shrug barre", group: "Polyarticulaire" },
  { name: "Rowing debout barre", group: "Polyarticulaire" },

  // Cardio
  { name: "Tapis de course", group: "Cardio" },
  { name: "Vélo elliptique", group: "Cardio" },
  { name: "Rameur", group: "Cardio" },
  { name: "Corde à sauter", group: "Cardio" },
  { name: "Burpees", group: "Cardio" },
];

export const CATALOG_GROUPS = Array.from(
  new Set(EXERCISE_CATALOG.map((e) => e.group)),
);

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function searchExercises(
  query: string,
  exercises: CatalogExercise[],
): CatalogExercise[] {
  const nq = normalize(query);
  if (!nq) return exercises;
  return exercises.filter((e) => normalize(e.name).includes(nq));
}
