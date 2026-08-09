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
  // "dips" (sans qualificatif) est désormais routé ici plutôt que vers les
  // triceps seuls — audit RPG V2 Phase H (30/08/2026) : les dips sont un
  // mouvement de poussée composé (pectoraux + triceps + épaules antérieures
  // en synergie), pas une isolation triceps ; consensus anatomique établi,
  // pas une invention (16 séries réelles concernées). "développé convergent"
  // (presse convergente, ex. Hammer Strength) rejoint le même groupe : c'est
  // une variante de développé couché/machine, pas un mouvement ambigu.
  {
    pattern:
      "bench press|développé.?couché|développé.?convergent|pompes?|push.?up|dips?|écarté|butterfly|chest",
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
  // "rotation ... épaule" AVANT la règle obliques/rotation ci-dessous : sans
  // cette priorité, "Rotation externe/interne de l'épaule" (11 séries
  // réelles) tombait dans le mot-clé générique "rotation" de la règle
  // obliques — audit RPG V2 Phase H (30/08/2026), voir aussi la restriction
  // du mot-clé "rotation" plus bas. Cortex n'a pas de groupe "coiffe des
  // rotateurs" dédié : épaules est le seul groupe existant anatomiquement
  // pertinent.
  { pattern: "rotation.{0,4}(externe|interne).{0,15}épaule|rotation.{0,15}épaule", muscles: ["epaules"] },
  // "push press" (développé propulsé, léger appui jambes) rejoint la
  // famille développé militaire/overhead press — audit Phase H, corrige un
  // trou de mapping réel ("Dumbbell Push Press").
  {
    pattern: "développé.?militaire|overhead.?press|shoulder.?press|press.?épaule|push.?press",
    muscles: ["epaules", "triceps"],
  },
  // "élévations" (pluriel) / "latéral" sans accord féminin ("latéral poulie")
  // sont des variantes réelles rencontrées dans le catalogue Cortex — audit
  // RPG V2 (29/08/2026), corrige un vrai trou de mapping (72 séries logguées
  // sur "Élévations latérales câble/haltères" restaient jusqu'ici sans
  // muscle associé).
  { pattern: "élévations?.?latéral(e|es)?|lateral.?raise", muscles: ["epaules"] },
  { pattern: "élévations?.?frontale?s?|front.?raise", muscles: ["epaules"] },
  // "y-raise" rejoint la même famille (deltoïde postérieur/trapèzes
  // inférieurs) que l'oiseau/face pull — audit Phase H.
  { pattern: "oiseau|face.?pull|rear.?delt|reverse.?fly|y.?raise", muscles: ["epaules", "trapeze"] },
  { pattern: "shrug|haussement", muscles: ["trapeze"] },
  // "Farmer's carry/walk" — port de charge, sollicitation dominante
  // trapèzes + avant-bras (grip), classification classique — audit Phase H.
  { pattern: "farmer.?s?.?(carry|walk)", muscles: ["trapeze", "avant-bras"] },

  // Bras
  { pattern: "curl|bicep|boucle", muscles: ["biceps", "avant-bras"] },
  // Fenêtre élargie entre "extension" et "triceps" (`.{0,20}` au lieu de
  // `.?`) : "Extension     des triceps à la poulie..." (espaces multiples +
  // mot "des") ne matchait plus — audit RPG V2 Phase H (30/08/2026), 3
  // séries réelles concernées. "pushdown" (cable pushdown) ajouté : pure
  // isolation triceps, absente du mapping malgré 2 séries réelles.
  { pattern: "extension.{0,20}triceps?|skull.?crush|kick.?back|push.?down", muscles: ["triceps"] },
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
  // Thruster : mouvement hybride squat-avant + développé propulsé, mappage
  // explicite (pas une isolation) — audit Phase H, corrige un trou réel.
  { pattern: "thruster", muscles: ["quadriceps", "fessiers", "epaules", "triceps"] },

  // Abdos
  // "relevé de jambes" (suspendu ou non) et "wheel rollout" rejoignent
  // le groupe abdos — variantes réelles absentes du mapping, non ambiguës
  // (mouvements abdominaux classiques) — audit Phase H.
  {
    pattern:
      "crunch|abdo|planche|plank|sit.?up|gainage|ab.?wheel|wheel.?rollout|relev[ée].{0,4}jambes?|leg.?raise",
    muscles: ["abdos"],
  },
  // Le mot-clé "rotation" seul a été retiré ici (30/08/2026) : trop générique,
  // il capturait à tort "Rotation externe/interne de l'épaule" (coiffe des
  // rotateurs, épaules — voir règle dédiée plus haut). Seule une rotation du
  // TRONC (torse/taille) reste routée vers obliques.
  {
    pattern: "oblique|rotation.{0,4}(du.?)?(tronc|torse|taille)|russian.?twist|wood.?chop",
    muscles: ["obliques", "abdos"],
  },

  // Lombaires
  // "extension dos" est une variante réelle (traduction directe de "back
  // extension") qui ne matchait pas faute du mot "lombaire" — audit Phase H.
  {
    pattern: "extension.?lombaire|extension.?dos|back.?extension|hyperextension|good.?morning",
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
