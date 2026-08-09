// ============================================================
// Garde-fou anti-divergence Edge Function ↔ client, même esprit que
// `src/lib/fitness/rank/rankEngine.sql-parity.test.ts`.
//
// `supabase/functions/_shared/cortexEngine.ts` est une copie DÉLIBÉRÉE de
// quatre modules client (les Edge Functions Deno ne peuvent pas importer
// `src/`) : `muscleMapping.ts` (exerciseToMuscles), `muscleRank.ts`
// (computeMuscleRank, Méthode C), `muscleAggregation.ts`
// (aggregateMuscleRanks), `cortexPower.ts` (computeCortexPower, Option 1).
// Ce test exécute RÉELLEMENT les deux implémentations sur un large
// échantillon et vérifie qu'elles produisent le même résultat — la
// condition nécessaire pour que l'Edge Function `sync-cortex-ascension`
// (qui recalcule tout côté serveur avant d'enregistrer une Ascension)
// n'utilise jamais une logique différente de celle affichée au joueur.
// ============================================================
import { describe, it, expect } from "vitest";
import { exerciseToMuscles as clientExerciseToMuscles } from "../muscleMapping";
import { aggregateMuscleRanks as clientAggregate } from "./muscleAggregation";
import { computeCortexPower as clientComputePower } from "./cortexPower";
import {
  exerciseToMuscles as serverExerciseToMuscles,
  aggregateMuscleRanks as serverAggregate,
  computeCortexPower as serverComputePower,
  identityKey as serverIdentityKey,
  type BusteMuscleGroup,
} from "../../../../supabase/functions/_shared/cortexEngine";
import { identityKey as clientIdentityKey } from "../recentExercises";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REAL_EXERCISE_NAMES = [
  "Traction prise neutre",
  "Ecarté poulie haute",
  "Tirage horizontal assis poitrine",
  "Dips",
  "Face pull câble",
  "Développé militaire haltères",
  "Curl marteau haltères",
  "Élévations latérales câble",
  "Rotation externe de l’épaule à la poulie",
  "Rotation interne de l’épaule",
  "Développé couché haltères",
  "Shoulder press",
  "Dumbbell Push Press",
  "Pushdown corde",
  "Extension     des triceps à la poulie haute, dos à la poulie",
  "thruster haltère",
  "Y-Raise poulie",
  "Farmer’s Carry",
  "Extension dos",
  "Relevé de jambes suspendu",
  "Wheel rollout",
  "Squat",
  "Romanian deadlift",
  "Curl barre EZ",
  "Shrug altère",
  "Woodchop poulie",
  "Développé convergent à la poulie",
  "Exercice totalement inconnu xyz",
];

describe("cortexEngine (Edge Function) — parité exerciseToMuscles avec le client", () => {
  it("mêmes muscles pour tout le catalogue réel connu", () => {
    for (const name of REAL_EXERCISE_NAMES) {
      expect(serverExerciseToMuscles(name), name).toEqual(clientExerciseToMuscles(name));
    }
  });

  it("mêmes clés d'identité (identityKey) pour un large échantillon synthétique", () => {
    const rand = mulberry32(20260830);
    for (let i = 0; i < 100; i++) {
      const name = REAL_EXERCISE_NAMES[Math.floor(rand() * REAL_EXERCISE_NAMES.length)];
      const hasRef = rand() < 0.5;
      const ex = { name, exercise_reference_id: hasRef ? `ref-${Math.floor(rand() * 5)}` : null };
      expect(serverIdentityKey(ex)).toBe(clientIdentityKey(ex));
    }
  });
});

describe("cortexEngine (Edge Function) — parité aggregateMuscleRanks + computeCortexPower", () => {
  it("même Puissance Cortex sur un large échantillon synthétique de profils", () => {
    const rand = mulberry32(20260830);
    let compared = 0;

    for (let i = 0; i < 300; i++) {
      const exerciseCount = 1 + Math.floor(rand() * 20);
      const exercises = Array.from({ length: exerciseCount }, (_, idx) => {
        const name = REAL_EXERCISE_NAMES[Math.floor(rand() * (REAL_EXERCISE_NAMES.length - 1))];
        return {
          key: `ex-${idx}`,
          name,
          tierIndex: Math.floor(rand() * 30),
        };
      });

      const clientMuscles = clientAggregate(exercises);
      const serverMuscles = serverAggregate(exercises);

      const clientPowerInputs = Object.entries(clientMuscles).map(([muscle, result]) => ({
        muscle: muscle as BusteMuscleGroup,
        tierIndex: result.status === "evaluated" ? result.tierIndex : null,
      }));
      const serverPowerInputs = Object.entries(serverMuscles).map(([muscle, result]) => ({
        muscle: muscle as BusteMuscleGroup,
        tierIndex: result.status === "evaluated" ? result.tierIndex : null,
      }));

      const clientPower = clientComputePower(clientPowerInputs);
      const serverPower = serverComputePower(serverPowerInputs);

      expect(serverMuscles, `muscles mismatch case ${i}`).toEqual(clientMuscles);
      expect(serverPower, `power mismatch case ${i}`).toEqual(clientPower);
      compared++;
    }

    expect(compared).toBe(300);
  });

  it("cas limite : aucun exercice → tous les muscles non évalués, Puissance partielle des deux côtés", () => {
    const client = clientAggregate([]);
    const server = serverAggregate([]);
    expect(server).toEqual(client);
  });
});
