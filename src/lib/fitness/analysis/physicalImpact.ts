// ============================================================
// Impact physique d'un exercice (domaine pur).
// Produit un vecteur d'aspects développés (largeur, épaisseur, force,
// hypertrophie, explosivité, stabilité, posture, mobilité), pondéré par
// le mouvement, les plages de répétitions réellement utilisées et
// l'objectif du profil utilisateur.
// ============================================================

import { normalize } from "../exerciseCatalog";
import { exerciseDifficulty } from "../exerciseRanks";
import type { MuscleId } from "../muscleMapping";
import type { PhysicalTrait, TrainingObjective, TraitImpact } from "./types";
import { TRAIT_LABELS } from "./types";
import type { RoleMap } from "./muscleRoles";

type TraitVector = Record<PhysicalTrait, number>;

function zero(): TraitVector {
  return {
    largeur: 0,
    epaisseur: 0,
    force: 0,
    hypertrophie: 0,
    explosivite: 0,
    stabilite: 0,
    posture: 0,
    mobilite: 0,
  };
}

// Muscles dont le développement contribue visuellement à la LARGEUR (V-taper).
const WIDTH_MUSCLES = new Set<MuscleId>(["dos", "epaules"]);
// Muscles qui donnent de l'ÉPAISSEUR (densité vue de profil).
const THICKNESS_MUSCLES = new Set<MuscleId>([
  "dos",
  "trapeze",
  "pectoraux",
  "quadriceps",
  "ischio",
]);
// Muscles posturaux (chaîne postérieure + tronc).
const POSTURE_MUSCLES = new Set<MuscleId>([
  "dos",
  "trapeze",
  "lombaires",
  "abdos",
  "epaules",
]);

function has(set: Set<MuscleId>, muscles: MuscleId[]): boolean {
  return muscles.some((m) => set.has(m));
}

/**
 * Vecteur d'impact brut (0..1 par trait) déduit du mouvement et des muscles.
 */
function baseVector(exerciseName: string, roles: RoleMap): TraitVector {
  const n = normalize(exerciseName);
  const v = zero();
  const coef = exerciseDifficulty(exerciseName); // 1.0 (isolation) → 2.0 (deadlift)
  const isCompound = coef >= 1.4;
  const allMuscles = [...roles.primary, ...roles.secondary];

  // Force : proportionnelle au caractère polyarticulaire.
  v.force = Math.min(1, (coef - 0.8) / 1.2);
  // Hypertrophie : présente partout, un peu plus sur les mouvements ciblés.
  v.hypertrophie = isCompound ? 0.75 : 0.85;
  // Stabilité : charges libres composées + unilatéral.
  const isUnilateral = /fente|lunge|split|bulgare|unilat|one.?arm|un.?bras/.test(n);
  const isMachine = /machine|guid|smith|presse|poulie|cable|pec.?deck/.test(n);
  v.stabilite = (isCompound ? 0.55 : 0.25) + (isUnilateral ? 0.35 : 0) - (isMachine ? 0.2 : 0);

  // Explosivité : mouvements balistiques / haltéro.
  if (/clean|snatch|epaule.?jete|thruster|jump|saut|kettlebell|swing|power/.test(n)) {
    v.explosivite = 0.8;
    v.force = Math.max(v.force, 0.7);
  } else {
    v.explosivite = isCompound ? 0.2 : 0.1;
  }

  // Mobilité : amplitude importante (squat profond, overhead, fentes).
  if (/squat|fente|lunge|overhead|militaire|souleve|deadlift|snatch|clean|dips/.test(n)) {
    v.mobilite = 0.5;
  } else {
    v.mobilite = 0.15;
  }

  // Largeur / épaisseur / posture selon les muscles moteurs.
  if (has(WIDTH_MUSCLES, allMuscles)) {
    // Tirages verticaux et élévations latérales → largeur.
    v.largeur = /vertical|lat.?pull|traction|pull.?up|laterale|elevation.?laterale/.test(n)
      ? 0.85
      : 0.5;
  }
  if (has(THICKNESS_MUSCLES, allMuscles)) {
    v.epaisseur = /row|rowing|horizontal|shrug|presse|squat|hack/.test(n) ? 0.8 : 0.5;
  }
  if (has(POSTURE_MUSCLES, allMuscles)) {
    v.posture = /row|rowing|face.?pull|oiseau|rear|extension.?lombaire|good.?morning|gainage|planche|souleve|deadlift/.test(
      n,
    )
      ? 0.8
      : 0.4;
  }

  // Bornage [0,1].
  (Object.keys(v) as PhysicalTrait[]).forEach((k) => {
    v[k] = Math.max(0, Math.min(1, v[k]));
  });
  return v;
}

/** Décale le vecteur selon les répétitions réellement effectuées. */
function applyRepBias(v: TraitVector, avgReps: number | null): void {
  if (avgReps == null || avgReps <= 0) return;
  if (avgReps <= 5) {
    v.force += 0.25;
    v.hypertrophie -= 0.05;
    v.explosivite += 0.05;
  } else if (avgReps <= 12) {
    v.hypertrophie += 0.15;
  } else {
    v.hypertrophie -= 0.1;
    v.stabilite += 0.1;
    v.force -= 0.15;
  }
}

/** Pondère selon l'objectif du profil (les traits alignés ressortent). */
const OBJECTIVE_WEIGHTS: Record<TrainingObjective, Partial<Record<PhysicalTrait, number>>> = {
  force: { force: 1.35, explosivite: 1.15, hypertrophie: 0.9 },
  hypertrophie: { hypertrophie: 1.35, largeur: 1.15, epaisseur: 1.15, force: 0.9 },
  seche: { hypertrophie: 1.1, stabilite: 1.1, force: 1.0, mobilite: 1.05 },
  endurance: { stabilite: 1.3, mobilite: 1.2, hypertrophie: 0.85, force: 0.8 },
  posture: { posture: 1.5, stabilite: 1.25, mobilite: 1.2, hypertrophie: 0.9 },
  general: {},
};

function applyObjective(v: TraitVector, objective: TrainingObjective): void {
  const w = OBJECTIVE_WEIGHTS[objective];
  (Object.keys(v) as PhysicalTrait[]).forEach((k) => {
    v[k] = v[k] * (w[k] ?? 1);
  });
}

/**
 * Calcule les aspects physiques développés, triés du plus au moins marqué.
 * Ne retourne que les traits significatifs (score ≥ 20) pour éviter le bruit,
 * mais garantit au moins deux entrées (hypertrophie + stabilité par défaut).
 */
export function computePhysicalImpact(
  exerciseName: string,
  roles: RoleMap,
  avgReps: number | null,
  objective: TrainingObjective,
): TraitImpact[] {
  const v = baseVector(exerciseName, roles);
  applyRepBias(v, avgReps);
  applyObjective(v, objective);

  const impacts: TraitImpact[] = (Object.keys(v) as PhysicalTrait[])
    .map((trait) => ({
      trait,
      label: TRAIT_LABELS[trait],
      score: Math.round(Math.max(0, Math.min(1, v[trait])) * 100),
    }))
    .sort((a, b) => b.score - a.score);

  const significant = impacts.filter((i) => i.score >= 20);
  return significant.length >= 2 ? significant : impacts.slice(0, 3);
}
