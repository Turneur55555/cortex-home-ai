// Couche de traduction/alias EN<->FR pour le dataset externe
// hasaneyldrm/exercises-dataset (voir docs/architecture/exercises-dataset-integration.md).
// Zéro I/O, zéro dépendance Deno/React — source unique, réexportée côté
// frontend dans `src/lib/fitness/exerciseTranslations.ts` (même convention que
// `exerciseDatasetMatching.ts` / `_shared/meals.ts`).
//
// Rôle : le dataset externe n'expose le nom de l'exercice qu'en anglais (voir
// analyse §1 de la doc) — sans cette couche, `bestNameSimilarity` ne peut
// jamais rapprocher un nom anglais d'un nom français existant, même pour des
// exercices strictement identiques (ex. "Bench Press" vs "Développé couché
// barre"). Cette couche fournit :
//   1. un dictionnaire d'exact-match nom-à-nom pour les exercices les plus
//      courants (haute précision, alimente `bestNameSimilarity` en score 1) ;
//   2. une traduction best-effort mot-à-mot/phrase du nom anglais (alimente le
//      recouvrement de tokens quand l'exact-match échoue, ET sert à générer
//      l'alias français persisté sur `exercise_reference.aliases`) ;
//   3. des dictionnaires muscle/équipement EN->FR pour le scoring d'appoint.
//
// Ce module ne décide jamais rien seul : il ne fait que produire des
// candidats de traduction/alias, exploités par `exerciseDatasetMatching.ts`
// et par l'edge function `import-exercises-dataset` au moment de l'écriture.

import { normalizeForMatch } from "./textNormalize.ts";

/**
 * Traductions exactes nom-à-nom, haute précision, pour les exercices les plus
 * courants d'un dataset musculation anglophone. Clé = nom anglais normalisé
 * (`normalizeForMatch`). Volontairement une liste explicite plutôt qu'une
 * génération automatique : ce sont les seules entrées qui peuvent produire un
 * score de correspondance de 1 (fusion automatique) sur la seule base du nom
 * traduit — la précision prime sur l'exhaustivité ici.
 *
 * Exemples fournis par Nathan inclus tels quels (Bench Press, Lat Pulldown,
 * Seated Cable Row, Face Pull, Romanian Deadlift).
 */
export const EXACT_NAME_TRANSLATIONS_EN_TO_FR: Record<string, string> = {
  "bench press": "Développé couché",
  "barbell bench press": "Développé couché barre",
  "dumbbell bench press": "Développé couché haltères",
  "incline bench press": "Développé incliné barre",
  "incline dumbbell bench press": "Développé incliné haltères",
  "decline bench press": "Développé décliné barre",
  "decline dumbbell bench press": "Développé décliné haltères",
  "dumbbell fly": "Écarté couché haltères",
  "cable fly": "Écarté câble croisé",
  "cable crossover": "Écarté câble croisé",
  "pec deck": "Pec deck machine",
  "push up": "Pompes",
  "push-up": "Pompes",
  dips: "Dips",
  "chest dip": "Dips",
  "lat pulldown": "Tirage vertical",
  "wide grip lat pulldown": "Tirage vertical poignée large",
  "close grip lat pulldown": "Tirage vertical poignée serrée",
  "seated cable row": "Tirage horizontal assis",
  "seated row": "Tirage horizontal assis",
  "barbell row": "Rowing barre",
  "bent over row": "Rowing barre",
  "dumbbell row": "Rowing haltère unilatéral",
  "one arm dumbbell row": "Rowing haltère unilatéral",
  "t bar row": "Rowing machine poignée V",
  "pull up": "Traction prise large",
  "pull-up": "Traction prise large",
  "chin up": "Traction prise neutre",
  "chin-up": "Traction prise neutre",
  "dumbbell pullover": "Pull-over haltère",
  "overhead press": "Développé militaire barre",
  "military press": "Développé militaire barre",
  "shoulder press": "Développé militaire haltères",
  "dumbbell shoulder press": "Développé militaire haltères",
  "seated dumbbell shoulder press": "Développé militaire haltères assis",
  "lateral raise": "Élévations latérales haltères",
  "dumbbell lateral raise": "Élévations latérales haltères",
  "cable lateral raise": "Élévations latérales câble",
  "front raise": "Élévations frontales haltères",
  "dumbbell front raise": "Élévations frontales haltères",
  "reverse fly": "Oiseau haltères",
  "rear delt fly": "Oiseau haltères",
  "face pull": "Face Pull",
  "arnold press": "Arnold press",
  "barbell curl": "Curl barre droite",
  "ez bar curl": "Curl barre EZ",
  "ez barbell curl": "Curl barre EZ",
  "dumbbell curl": "Curl haltères alternés",
  "alternating dumbbell curl": "Curl haltères alternés",
  "hammer curl": "Curl marteau haltères",
  "incline dumbbell curl": "Curl incliné haltères",
  "cable curl": "Curl câble basse poulie",
  "concentration curl": "Curl concentré haltère",
  "preacher curl": "Curl pupitre barre EZ",
  "rope pushdown": "Extension triceps câble corde",
  "triceps pushdown": "Extension triceps câble barre droite",
  "cable pushdown": "Extension triceps câble barre droite",
  "skull crusher": "Barre au front",
  "lying triceps extension": "Barre au front",
  "overhead triceps extension": "Extension triceps haltère nuque",
  "triceps kickback": "Kickback triceps haltère",
  "dumbbell kickback": "Kickback triceps haltère",
  "bench dip": "Dips triceps banc",
  "parallel bar dip": "Dips barres parallèles",
  squat: "Squat barre",
  "barbell squat": "Squat barre",
  "back squat": "Squat barre",
  "goblet squat": "Squat gobelet",
  "hack squat": "Squat hack machine",
  "front squat": "Squat avant barre",
  "leg press": "Leg press",
  "incline leg press": "Leg press incliné",
  lunge: "Fente avant barre",
  "barbell lunge": "Fente avant barre",
  "dumbbell lunge": "Fente avant haltères",
  "bulgarian split squat": "Fente bulgare haltères",
  "leg extension": "Leg extension machine",
  "lying leg curl": "Leg curl allongé machine",
  "seated leg curl": "Leg curl assis machine",
  "romanian deadlift": "Soulevé de terre roumain",
  "barbell romanian deadlift": "Soulevé de terre roumain barre",
  "dumbbell romanian deadlift": "Soulevé de terre roumain haltères",
  deadlift: "Soulevé de terre",
  "sumo deadlift": "Soulevé de terre sumo",
  "stiff leg deadlift": "Soulevé de terre jambes tendues",
  "hip thrust": "Hip thrust barre",
  "barbell hip thrust": "Hip thrust barre",
  "machine hip thrust": "Hip thrust machine",
  "hip abduction": "Abducteur machine",
  "hip adduction": "Adducteur machine",
  "cable kickback": "Kickback câble fessier",
  crunch: "Crunch",
  "cable crunch": "Crunch câble",
  plank: "Planche",
  "side plank": "Planche latérale",
  "hanging leg raise": "Relevé de jambes suspendu",
  "decline sit up": "Relevé de buste banc incliné",
  "russian twist": "Russian twist",
  "mountain climber": "Mountain climbers",
  "ab wheel rollout": "Wheel rollout",
  hyperextension: "Hyperextension banc",
  "back extension": "Hyperextension banc",
  "standing calf raise": "Extension mollets debout",
  "seated calf raise": "Extension mollets assis machine",
  shrug: "Shrug barre",
  "barbell shrug": "Shrug barre",
  "upright row": "Rowing debout barre",
  treadmill: "Tapis de course",
  "elliptical trainer": "Vélo elliptique",
  rowing: "Rameur",
  "jump rope": "Corde à sauter",
  burpee: "Burpees",
  // Ajouts 2026-07-30 (analyse des correspondances ambiguës à score élevé,
  // voir docs/architecture/exercises-dataset-integration.md §13) : clés
  // exactes vérifiées contre les enregistrements réels du dataset — corrige
  // notamment un cas de mauvaise cible ("barbell sumo deadlift" partait vers
  // "Soulevé de terre roumain barre" au lieu de "Soulevé de terre sumo",
  // faute de correspondance de nom exacte pour départager les deux).
  "barbell sumo deadlift": "Soulevé de terre sumo",
  "barbell full squat": "Squat barre",
  "cable kneeling crunch": "Crunch câble",
};

/**
 * Dictionnaire phrase/mot EN->FR, appliqué en substitution ordonnée (phrases
 * les plus longues d'abord) quand l'exact-match ci-dessus ne trouve rien.
 * Best-effort : ne vise pas une traduction grammaticalement parfaite, mais un
 * résultat qui maximise le recouvrement de tokens avec le nom français
 * existant, et qui sert d'alias de recherche exploitable.
 */
const PHRASE_TRANSLATIONS_EN_TO_FR: Array<[string, string]> = [
  ["barbell bench press", "développé couché barre"],
  ["dumbbell bench press", "développé couché haltères"],
  ["incline bench press", "développé incliné barre"],
  ["decline bench press", "développé décliné barre"],
  ["bench press", "développé couché"],
  ["shoulder press", "développé militaire"],
  ["overhead press", "développé militaire"],
  ["military press", "développé militaire"],
  ["lat pulldown", "tirage vertical"],
  ["pulldown", "tirage vertical"],
  ["seated cable row", "tirage horizontal assis"],
  ["cable row", "tirage horizontal"],
  ["seated row", "tirage horizontal assis"],
  ["bent over row", "rowing barre"],
  ["barbell row", "rowing barre"],
  ["dumbbell row", "rowing haltère"],
  ["t bar row", "rowing machine"],
  ["upright row", "rowing debout"],
  ["pull up", "traction"],
  ["pull-up", "traction"],
  ["chin up", "traction prise neutre"],
  ["chin-up", "traction prise neutre"],
  ["pullover", "pull-over"],
  ["lateral raise", "élévation latérale"],
  ["front raise", "élévation frontale"],
  ["rear delt fly", "oiseau"],
  ["reverse fly", "oiseau"],
  ["face pull", "face pull"],
  ["arnold press", "arnold press"],
  ["ez bar curl", "curl barre ez"],
  ["ez barbell curl", "curl barre ez"],
  ["barbell curl", "curl barre"],
  ["dumbbell curl", "curl haltères"],
  ["hammer curl", "curl marteau"],
  ["preacher curl", "curl pupitre"],
  ["concentration curl", "curl concentré"],
  ["cable curl", "curl câble"],
  ["triceps pushdown", "extension triceps câble"],
  ["cable pushdown", "extension triceps câble"],
  ["rope pushdown", "extension triceps corde"],
  ["skull crusher", "barre au front"],
  ["lying triceps extension", "barre au front"],
  ["overhead triceps extension", "extension triceps nuque"],
  ["triceps kickback", "kickback triceps"],
  ["bench dip", "dips banc"],
  ["parallel bar dip", "dips barres parallèles"],
  ["chest dip", "dips"],
  ["dip", "dips"],
  ["goblet squat", "squat gobelet"],
  ["hack squat", "squat hack"],
  ["front squat", "squat avant"],
  ["back squat", "squat barre"],
  ["barbell squat", "squat barre"],
  ["squat", "squat"],
  ["leg press", "leg press"],
  ["bulgarian split squat", "fente bulgare"],
  ["dumbbell lunge", "fente avant haltères"],
  ["barbell lunge", "fente avant barre"],
  ["lunge", "fente"],
  ["leg extension", "leg extension"],
  ["lying leg curl", "leg curl allongé"],
  ["seated leg curl", "leg curl assis"],
  ["romanian deadlift", "soulevé de terre roumain"],
  ["sumo deadlift", "soulevé de terre sumo"],
  ["stiff leg deadlift", "soulevé de terre jambes tendues"],
  ["deadlift", "soulevé de terre"],
  ["hip thrust", "hip thrust"],
  ["hip abduction", "abducteur"],
  ["hip adduction", "adducteur"],
  ["cable kickback", "kickback câble fessier"],
  ["cable crunch", "crunch câble"],
  ["crunch", "crunch"],
  ["side plank", "planche latérale"],
  ["plank", "planche"],
  ["hanging leg raise", "relevé de jambes suspendu"],
  ["decline sit up", "relevé de buste banc incliné"],
  ["sit up", "relevé de buste"],
  ["russian twist", "russian twist"],
  ["mountain climber", "mountain climbers"],
  ["ab wheel rollout", "wheel rollout"],
  ["back extension", "hyperextension"],
  ["hyperextension", "hyperextension"],
  ["standing calf raise", "extension mollets debout"],
  ["seated calf raise", "extension mollets assis"],
  ["calf raise", "extension mollets"],
  ["shrug", "shrug"],
  ["cable fly", "écarté câble"],
  ["cable crossover", "écarté câble croisé"],
  ["dumbbell fly", "écarté couché haltères"],
  ["fly", "écarté"],
  ["pec deck", "pec deck"],
  ["push up", "pompes"],
  ["push-up", "pompes"],
  ["good morning", "good morning"],
  ["treadmill", "tapis de course"],
  ["elliptical trainer", "vélo elliptique"],
  ["rowing", "rameur"],
  ["jump rope", "corde à sauter"],
  ["burpee", "burpees"],
  ["barbell", "barre"],
  ["dumbbell", "haltère"],
  ["dumbbells", "haltères"],
  ["cable", "câble"],
  ["machine", "machine"],
  ["seated", "assis"],
  ["standing", "debout"],
  ["incline", "incliné"],
  ["decline", "décliné"],
  ["reverse", "inversé"],
  ["wide", "large"],
  ["close", "serré"],
  ["narrow", "serré"],
  ["grip", "poignée"],
  ["assisted", "assisté"],
  ["weighted", "lesté"],
  ["smith", "guidé"],
  ["kettlebell", "kettlebell"],
  ["band", "élastique"],
  ["resistance", "résistance"],
  // Ajouts 2026-07-30 (analyse des 750 correspondances ambiguës du dry-run,
  // voir docs/architecture/exercises-dataset-integration.md §13) : "lever"
  // et "sled" sont des préfixes d'équipement génériques utilisés par ce
  // dataset (convention ExerciseDB) pour désigner une machine — présents
  // dans 72 et 13 noms d'exercice respectivement. "rear"/"kneeling"/"twist"
  // comblent des lacunes de vocabulaire fréquentes identifiées dans les
  // correspondances à score élevé mais non exact (ex. "cable seated twist",
  // "barbell rear lunge", "cable kneeling crunch").
  //
  // Note : "front" -> "avant" a été essayé puis retiré (regression détectée
  // par re-run empirique du dry-run local) — "front" est aussi un mot
  // FRANÇAIS déjà présent dans une sortie existante ("Barre au front" =
  // skull crusher). La substitution étant appliquée en cascade sur le texte
  // déjà partiellement traduit, la règle "front" repassait sur le "front"
  // français fraîchement inséré et le corrompait en "barre au avant". Toute
  // future entrée EN->FR doit être vérifiée contre les sorties FR déjà
  // produites par ce dictionnaire pour éviter ce type de collision.
  ["lever", "machine"],
  ["sled", "machine"],
  ["rear", "arrière"],
  ["kneeling", "à genoux"],
  ["twist", "rotation"],
];

/** Muscle principal/secondaire (`target`, `muscle_group`, `body_part`) EN->FR. */
export const MUSCLE_TRANSLATIONS_EN_TO_FR: Record<string, string> = {
  chest: "pectoraux",
  pectorals: "pectoraux",
  pecs: "pectoraux",
  back: "dos",
  lats: "dos",
  "latissimus dorsi": "dos",
  "upper back": "dos",
  "lower back": "dos",
  traps: "dos",
  trapezius: "dos",
  shoulders: "épaules",
  delts: "épaules",
  deltoids: "épaules",
  biceps: "biceps",
  "biceps brachii": "biceps",
  triceps: "triceps",
  "triceps brachii": "triceps",
  "upper arms": "bras",
  "lower arms": "avant-bras",
  forearms: "avant-bras",
  legs: "jambes",
  "upper legs": "jambes",
  "lower legs": "mollets",
  quads: "jambes",
  quadriceps: "jambes",
  hamstrings: "jambes",
  glutes: "fessiers",
  gluteus: "fessiers",
  "gluteus maximus": "fessiers",
  abs: "abdominaux",
  abdominals: "abdominaux",
  waist: "abdominaux",
  core: "abdominaux",
  obliques: "abdominaux",
  calves: "mollets",
  calf: "mollets",
  cardio: "cardio",
  neck: "cou",
  "hip flexors": "fessiers",
  adductors: "fessiers",
  abductors: "fessiers",
  // Ajouts 2026-07-30 (analyse de la distribution réelle des valeurs
  // `target`/`category` du dataset — voir doc §13) : "spine" (19 occurrences)
  // et "cardiovascular system" (29 occurrences) n'avaient aucune entrée,
  // ramenant leur signal muscle à 0 pour tous les exercices concernés.
  // "cardiovascular system" -> "cardio" est particulièrement utile : Cortex
  // a une catégorie "Cardio" dédiée (Tapis de course, Rameur, Vélo
  // elliptique, Corde à sauter, Burpees), auparavant jamais reliée par le
  // signal muscle faute de traduction.
  spine: "dos",
  "cardiovascular system": "cardio",
  "serratus anterior": "épaules",
  "levator scapulae": "épaules",
  // Ajouts 2026-08 (résidu observé après l'import réel — `target`/
  // `muscle_group` du dataset couvre des groupes plus fins que la liste
  // ci-dessus pour une minorité d'exercices, ex. "ankles", "rotator cuff").
  ankles: "chevilles",
  ankle: "chevilles",
  "rotator cuff": "épaules",
  wrist: "avant-bras",
  wrists: "avant-bras",
  rhomboids: "dos",
  hands: "avant-bras",
  soleus: "mollets",
};

/** Équipement (`equipment`) EN->FR. */
export const EQUIPMENT_TRANSLATIONS_EN_TO_FR: Record<string, string> = {
  barbell: "barre",
  "ez barbell": "barre EZ",
  dumbbell: "haltère",
  dumbbells: "haltères",
  cable: "câble",
  machine: "machine",
  "leverage machine": "machine",
  "smith machine": "machine guidée",
  "body weight": "poids du corps",
  bodyweight: "poids du corps",
  kettlebell: "kettlebell",
  "resistance band": "élastique",
  band: "élastique",
  "medicine ball": "medicine ball",
  "stability ball": "swiss ball",
  "assisted machine": "machine assistée",
  "olympic barbell": "barre olympique",
  "trap bar": "barre hexagonale",
  rope: "corde",
  weighted: "lesté",
  none: "poids du corps",
  // Ajouts 2026-07-30 (valeurs réelles du champ `equipment` du dataset non
  // couvertes — voir doc §13) : "sled machine" (15 occurrences) et
  // "assisted" (15 occurrences) étaient absents, forçant le signal
  // équipement à 0 pour tous les exercices correspondants.
  "sled machine": "machine",
  assisted: "machine assistée",
  roller: "roue abdominale",
  "bosu ball": "bosu",
  "wheel roller": "roue abdominale",
};

/**
 * Traduit best-effort un nom d'exercice anglais vers un candidat français,
 * par substitution de phrases ordonnée (les plus longues d'abord) sur le
 * texte normalisé. Ne renvoie jamais une chaîne vide : si aucune phrase ne
 * matche, renvoie le nom normalisé tel quel (au moins comparable token à
 * token). Toujours utilisé en complément de `EXACT_NAME_TRANSLATIONS_EN_TO_FR`
 * (vérifié en priorité par l'appelant), jamais à sa place pour les cas à haute
 * précision.
 */
export function translateExerciseNameToFrench(nameEn: string): string {
  let working = ` ${normalizeForMatch(nameEn)} `;
  const sortedPhrases = [...PHRASE_TRANSLATIONS_EN_TO_FR].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [en, fr] of sortedPhrases) {
    const pattern = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    working = working.replace(pattern, ` ${fr} `);
  }
  return working.trim().replace(/\s+/g, " ") || normalizeForMatch(nameEn);
}

/** Recherche exacte (haute précision) — retourne `null` si aucune entrée connue. */
export function exactTranslateExerciseName(nameEn: string): string | null {
  return EXACT_NAME_TRANSLATIONS_EN_TO_FR[normalizeForMatch(nameEn)] ?? null;
}

function translateWithDictionary(term: string | null, dictionary: Record<string, string>): string | null {
  if (!term) return null;
  const key = normalizeForMatch(term);
  if (dictionary[key]) return dictionary[key];
  // Repli : recherche par recouvrement de tokens contre les clés du
  // dictionnaire (ex. "upper legs" -> clé exacte ; "quadriceps femoris" ->
  // aucune clé exacte mais partage le token "quadriceps").
  const tokens = key.split(" ").filter(Boolean);
  for (const token of tokens) {
    if (dictionary[token]) return dictionary[token];
  }
  return null;
}

export function translateMuscleToFrench(term: string | null): string | null {
  return translateWithDictionary(term, MUSCLE_TRANSLATIONS_EN_TO_FR);
}

export function translateEquipmentToFrench(term: string | null): string | null {
  return translateWithDictionary(term, EQUIPMENT_TRANSLATIONS_EN_TO_FR);
}

/**
 * Heuristique inverse : déduit un équipement probable à partir des tokens
 * français d'un nom d'exercice EXISTANT (les exercices Cortex n'ont pas de
 * colonne équipement dédiée — l'équipement est implicite dans le libellé, ex.
 * "Développé couché barre", "Curl haltères"). Utilisée uniquement comme
 * signal d'appoint pour le scoring, jamais pour réécrire le nom existant.
 */
const EQUIPMENT_KEYWORDS_FR = [
  "barre ez",
  "barre",
  "haltères",
  "haltère",
  "câble",
  "machine guidée",
  "machine",
  "poids du corps",
  "élastique",
  "kettlebell",
  "poulie",
];

export function extractEquipmentFromFrenchLabel(label: string): string | null {
  const normalized = normalizeForMatch(label);
  for (const keyword of EQUIPMENT_KEYWORDS_FR) {
    if (normalized.includes(normalizeForMatch(keyword))) return keyword;
  }
  return null;
}
