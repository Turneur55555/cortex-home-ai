// ============================================================
// Garde-fou anti-divergence Edge Function ↔ client, même esprit que
// `src/lib/fitness/rpg/characterLevel.sql-parity.test.ts`.
//
// `supabase/functions/_shared/rankEngine.ts` est une copie DÉLIBÉRÉE du
// moteur de Rang (les Edge Functions Deno ne peuvent pas importer `src/`).
// Ce test exécute RÉELLEMENT les deux implémentations sur un large
// échantillon synthétique d'historiques de séances et vérifie qu'elles
// produisent le même `confirmedTierIndex` — la seule valeur que
// `verify-exercise-rank` utilise pour décider d'un `exercise_rank_up`.
// ============================================================
import { describe, it, expect } from "vitest";
import { computeRankState } from "./engine";
import { DEFAULT_RANK_ENGINE_CONFIG } from "./config";
import type { SessionInput } from "./types";
import { computeConfirmedTier } from "../../../../supabase/functions/_shared/rankEngine";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXERCISE_NAMES = [
  "Squat",
  "Développé couché",
  "Soulevé de terre",
  "Tirage vertical prise serrée",
  "Développé militaire",
  "Traction",
  "Curl biceps",
  "Presse à cuisses",
];

function randomSessions(rand: () => number, exercise: string, now: Date): SessionInput[] {
  const count = Math.floor(rand() * 25); // 0..24 séances
  const sessions: SessionInput[] = [];
  let baseWeight = 20 + rand() * 80;
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(rand() * 400);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    baseWeight += (rand() - 0.4) * 5; // dérive légère dans le temps
    const weight = Math.max(0, Math.round(baseWeight * 10) / 10);
    const reps = 1 + Math.floor(rand() * 14);
    sessions.push({
      workoutId: `w${i}`,
      date: date.toISOString().slice(0, 10),
      sets: [
        { reps, weight },
        { reps: Math.max(1, reps - 1), weight },
      ],
    });
  }
  return sessions.sort((a, b) => (a.date < b.date ? -1 : 1));
}

describe("rankEngine (Edge Function) — parité avec le moteur client (anti-régression)", () => {
  it("confirmedTierIndex identique sur un large échantillon synthétique", () => {
    const rand = mulberry32(20260721);
    const now = new Date("2026-07-21");
    let compared = 0;

    for (let i = 0; i < 300; i++) {
      const exercise = EXERCISE_NAMES[i % EXERCISE_NAMES.length];
      const bodyweight = 50 + rand() * 60;
      const sessions = randomSessions(rand, exercise, now);

      const client = computeRankState(
        DEFAULT_RANK_ENGINE_CONFIG,
        exercise,
        sessions,
        bodyweight,
        now,
      );
      const server = computeConfirmedTier(exercise, sessions, bodyweight, now);

      expect(server.confirmedTierIndex, `mismatch for ${exercise} (case ${i})`).toBe(
        client.confirmedTierIndex,
      );
      compared++;
    }

    expect(compared).toBe(300);
  });

  it("cas limite : aucune séance → palier 0 des deux côtés", () => {
    const now = new Date("2026-07-21");
    const client = computeRankState(DEFAULT_RANK_ENGINE_CONFIG, "Squat", [], 70, now);
    const server = computeConfirmedTier("Squat", [], 70, now);
    expect(server.confirmedTierIndex).toBe(0);
    expect(client.confirmedTierIndex).toBe(0);
  });
});
