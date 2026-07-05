// ============================================================
// Décomposition d'un exercice en muscles principaux / secondaires /
// stabilisateurs (domaine pur). S'appuie sur le mapping plat existant
// (exerciseToMuscles) comme repli, mais enrichit avec les rôles et une
// intensité de sollicitation par muscle. Modèle biomécanique générique
// lorsqu'aucune règle ne correspond → l'analyse n'est jamais vide.
// ============================================================

import { normalize } from "../exerciseCatalog";
import { exerciseToMuscles, MUSCLE_META, type MuscleId } from "../muscleMapping";
import type { MuscleRole } from "./types";

export interface RoleMap {
  primary: MuscleId[];
  secondary: MuscleId[];
  stabilizer: MuscleId[];
}

interface RoleRule {
  pattern: RegExp;
  primary: MuscleId[];
  secondary?: MuscleId[];
  stabilizer?: MuscleId[];
}

// Le noyau (abdos + lombaires) stabilise la quasi-totalité des mouvements
// composés debout / avec charge libre.
const CORE: MuscleId[] = ["abdos", "lombaires"];

const ROLE_RULES: RoleRule[] = [
  // ── Pectoraux ─────────────────────────────────────────────
  {
    pattern: /developpe.?incline|incline.?(bench|press|dumbbell)/,
    primary: ["pectoraux"],
    secondary: ["epaules", "triceps"],
    stabilizer: ["abdos"],
  },
  {
    pattern: /developpe.?decline|decline/,
    primary: ["pectoraux"],
    secondary: ["triceps"],
    stabilizer: ["abdos"],
  },
  {
    pattern: /ecarte|butterfly|pec.?deck|fly/,
    primary: ["pectoraux"],
    secondary: ["epaules"],
  },
  {
    pattern: /bench press|developpe.?couche|pompes?|push.?up|chest press/,
    primary: ["pectoraux"],
    secondary: ["triceps", "epaules"],
    stabilizer: ["abdos"],
  },
  // ── Dos ───────────────────────────────────────────────────
  {
    pattern: /souleve.?de.?terre|deadlift/,
    primary: ["dos", "fessiers", "ischio"],
    secondary: ["lombaires", "trapeze", "quadriceps"],
    stabilizer: ["abdos", "avant-bras"],
  },
  {
    pattern: /traction|pull.?up|chin.?up|lat.?pull|tirage.?vertical|pull.?down/,
    primary: ["dos"],
    secondary: ["biceps", "avant-bras"],
    stabilizer: ["abdos"],
  },
  {
    pattern: /rowing|row|tirage.?horizontal|tirage/,
    primary: ["dos"],
    secondary: ["biceps", "trapeze", "avant-bras"],
    stabilizer: ["lombaires", "abdos"],
  },
  // ── Épaules ───────────────────────────────────────────────
  {
    pattern: /developpe.?militaire|overhead.?press|shoulder.?press|developpe.?epaule|arnold/,
    primary: ["epaules"],
    secondary: ["triceps", "trapeze"],
    stabilizer: CORE,
  },
  {
    pattern: /elevation.?laterale|lateral.?raise/,
    primary: ["epaules"],
  },
  {
    pattern: /elevation.?frontale|front.?raise/,
    primary: ["epaules"],
    secondary: ["pectoraux"],
  },
  {
    pattern: /oiseau|face.?pull|rear.?delt|reverse.?fly/,
    primary: ["epaules"],
    secondary: ["trapeze", "dos"],
  },
  {
    pattern: /shrug|haussement/,
    primary: ["trapeze"],
    secondary: ["avant-bras"],
  },
  // ── Bras ──────────────────────────────────────────────────
  {
    pattern: /curl|bicep|boucle/,
    primary: ["biceps"],
    secondary: ["avant-bras"],
  },
  {
    pattern: /skull.?crush|extension.?triceps?|barre.?au.?front/,
    primary: ["triceps"],
  },
  {
    pattern: /kick.?back/,
    primary: ["triceps"],
  },
  {
    pattern: /\bdips?\b/,
    primary: ["triceps", "pectoraux"],
    secondary: ["epaules"],
    stabilizer: ["abdos"],
  },
  {
    pattern: /wrist.?curl|avant.?bras|forearm/,
    primary: ["avant-bras"],
  },
  // ── Jambes ────────────────────────────────────────────────
  {
    pattern: /back squat|front squat|hack.?squat|\bsquat\b|goblet/,
    primary: ["quadriceps", "fessiers"],
    secondary: ["ischio", "lombaires"],
    stabilizer: CORE,
  },
  {
    pattern: /presse|leg.?press/,
    primary: ["quadriceps", "fessiers"],
    secondary: ["ischio"],
  },
  {
    pattern: /fente|lunge|split.?squat|bulgare/,
    primary: ["quadriceps", "fessiers"],
    secondary: ["ischio"],
    stabilizer: CORE,
  },
  {
    pattern: /leg.?extension|extension.?jambe|leg.?ext/,
    primary: ["quadriceps"],
  },
  {
    pattern: /leg.?curl|ischio|hamstring/,
    primary: ["ischio"],
    secondary: ["mollets"],
  },
  {
    pattern: /hip.?thrust|pont.?fessier|glute|souleve.?de.?terre.?roumain|romanian|rdl/,
    primary: ["fessiers", "ischio"],
    secondary: ["lombaires"],
    stabilizer: ["abdos"],
  },
  {
    pattern: /mollet|calf/,
    primary: ["mollets"],
  },
  // ── Tronc ─────────────────────────────────────────────────
  {
    pattern: /oblique|russian.?twist|wood.?chop|rotation/,
    primary: ["obliques"],
    secondary: ["abdos"],
  },
  {
    pattern: /crunch|abdo|planche|plank|sit.?up|gainage|ab.?wheel|leg raise|relev.?de.?jambe/,
    primary: ["abdos"],
    secondary: ["obliques"],
  },
  {
    pattern: /extension.?lombaire|back.?extension|hyperextension|good.?morning/,
    primary: ["lombaires"],
    secondary: ["fessiers", "ischio"],
  },
];

function dedupe(list: MuscleId[]): MuscleId[] {
  return Array.from(new Set(list));
}

/** Retire des listes secondaires/stabilisatrices ce qui est déjà principal. */
function subtract(from: MuscleId[], remove: Set<MuscleId>): MuscleId[] {
  return from.filter((m) => !remove.has(m));
}

/**
 * Décompose un exercice en rôles musculaires. `isGeneric` indique qu'aucune
 * règle spécifique n'a été trouvée et qu'un modèle biomécanique générique est
 * appliqué (l'analyse reste donc toujours non vide).
 */
export function resolveMuscleRoles(
  exerciseName: string,
  aiMuscleGroups?: string[] | null,
): RoleMap & { isGeneric: boolean } {
  const n = normalize(exerciseName);

  for (const rule of ROLE_RULES) {
    if (rule.pattern.test(n)) {
      const primary = dedupe(rule.primary);
      const primarySet = new Set(primary);
      const secondary = subtract(dedupe(rule.secondary ?? []), primarySet);
      const secondarySet = new Set([...primarySet, ...secondary]);
      const stabilizer = subtract(dedupe(rule.stabilizer ?? []), secondarySet);
      return { primary, secondary, stabilizer, isGeneric: false };
    }
  }

  // Repli 1 : mapping plat existant (couvre certains alias non listés ici).
  const flat = exerciseToMuscles(exerciseName);
  if (flat.length > 0) {
    const [head, ...rest] = flat;
    const primary = [head];
    const secondary = subtract(dedupe(rest), new Set(primary));
    return { primary, secondary, stabilizer: [], isGeneric: false };
  }

  // Repli 2 : muscles résolus par l'IA (exercices personnalisés).
  const aiMuscles = (aiMuscleGroups ?? []).filter(
    (m): m is MuscleId => m in MUSCLE_META,
  );
  if (aiMuscles.length > 0) {
    const [head, ...rest] = dedupe(aiMuscles);
    return { primary: [head], secondary: rest, stabilizer: [], isGeneric: false };
  }

  // Repli 3 : modèle biomécanique générique — jamais vide.
  // Mouvement inconnu : on suppose une sollicitation globale du tronc en
  // stabilisation, sans muscle moteur identifiable.
  return { primary: [], secondary: [], stabilizer: [...CORE], isGeneric: true };
}

/** Sollicitation de base (0..100) selon le rôle. */
export function baseSolicitationForRole(role: MuscleRole): number {
  switch (role) {
    case "primary":
      return 90;
    case "secondary":
      return 55;
    case "stabilizer":
      return 30;
  }
}
