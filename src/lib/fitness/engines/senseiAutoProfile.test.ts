import { describe, expect, it } from "vitest";
import { inferSenseiAutoProfile, type AutoProfileWorkout } from "./senseiAutoProfile";

function set(reps: number, weight: number, completed = true) {
  return { reps, weight, completed };
}

function workout(
  date: string,
  exercises: AutoProfileWorkout["exercises"],
  discipline: string | null = "muscu",
) {
  return { date, discipline, exercises };
}

describe("inferSenseiAutoProfile", () => {
  it("retombe sur les valeurs par défaut sous le seuil minimal de séances", () => {
    const result = inferSenseiAutoProfile([
      workout("2026-07-01", [{ name: "Développé couché", exercise_sets: [set(8, 60)] }]),
    ]);
    expect(result).toEqual({ level: "intermédiaire", goal: "hypertrophie", sessionsConsidered: 1 });
  });

  it("ignore les disciplines non-musculation", () => {
    const workouts = [
      workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(8, 60)] }], "hyrox"),
      workout("2026-06-08", [{ name: "Squat", exercise_sets: [set(8, 60)] }], "cardio"),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.sessionsConsidered).toBe(0);
  });

  it("ignore les séries non validées", () => {
    const workouts = [
      workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(4, 100, false)] }]),
      workout("2026-06-08", [{ name: "Squat", exercise_sets: [set(4, 100, false)] }]),
      workout("2026-06-15", [{ name: "Squat", exercise_sets: [set(4, 100, false)] }]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result).toEqual({ level: "intermédiaire", goal: "hypertrophie", sessionsConsidered: 3 });
  });

  it("détecte un profil 'force' sur des séries lourdes à faibles répétitions", () => {
    const workouts = [
      workout("2026-05-01", [{ name: "Squat", exercise_sets: [set(4, 100), set(4, 100)] }]),
      workout("2026-05-08", [{ name: "Squat", exercise_sets: [set(4, 102), set(4, 102)] }]),
      workout("2026-05-15", [{ name: "Squat", exercise_sets: [set(4, 105), set(4, 105)] }]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.goal).toBe("force");
    expect(result.sessionsConsidered).toBe(3);
  });

  it("détecte un profil 'hypertrophie' sur des répétitions moyennes (8-12)", () => {
    const workouts = [
      workout("2026-05-01", [
        { name: "Développé couché", exercise_sets: [set(10, 50), set(10, 50)] },
      ]),
      workout("2026-05-08", [
        { name: "Développé couché", exercise_sets: [set(10, 52), set(10, 52)] },
      ]),
      workout("2026-05-15", [
        { name: "Développé couché", exercise_sets: [set(10, 54), set(10, 54)] },
      ]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.goal).toBe("hypertrophie");
  });

  it("détecte 'perte de poids' pour un rythme fréquent à hautes répétitions sans surcharge de volume", () => {
    const workouts: AutoProfileWorkout[] = [];
    // 8 séances réparties sur ~2 semaines (fréquence élevée), tonnage stable.
    const dates = [
      "2026-06-01",
      "2026-06-03",
      "2026-06-05",
      "2026-06-07",
      "2026-06-08",
      "2026-06-10",
      "2026-06-12",
      "2026-06-14",
    ];
    for (const date of dates) {
      workouts.push(workout(date, [{ name: "Fentes", exercise_sets: [set(15, 20), set(15, 20)] }]));
    }
    const result = inferSenseiAutoProfile(workouts);
    expect(result.goal).toBe("perte de poids");
  });

  it("détecte 'endurance' pour des hautes répétitions avec une fréquence modérée et une surcharge continue", () => {
    const workouts = [
      workout("2026-01-01", [{ name: "Presse à cuisses", exercise_sets: [set(15, 80)] }]),
      workout("2026-01-15", [{ name: "Presse à cuisses", exercise_sets: [set(15, 90)] }]),
      workout("2026-02-01", [{ name: "Presse à cuisses", exercise_sets: [set(15, 100)] }]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.goal).toBe("endurance");
  });

  it("monte le niveau vers 'avancé' avec un historique long, fréquent et une surcharge continue", () => {
    const workouts: AutoProfileWorkout[] = [];
    const exercisesStart = [
      { name: "Développé couché", start: 60 },
      { name: "Squat", start: 80 },
      { name: "Tirage poitrine", start: 50 },
    ];
    let sessionIndex = 0;
    for (let week = 0; week < 12; week += 1) {
      for (const dayOffset of [1, 3, 5]) {
        const date = new Date(2026, 0, dayOffset + week * 7).toISOString().slice(0, 10);
        // Poids strictement croissant séance après séance (pas seulement
        // semaine après semaine) : chaque dernière séance bat la précédente,
        // ce qui matérialise un vrai record récent sur chaque exercice suivi.
        const exercises = exercisesStart.map((e) => ({
          name: e.name,
          exercise_sets: [set(9, e.start + sessionIndex), set(9, e.start + sessionIndex)],
        }));
        workouts.push(workout(date, exercises));
        sessionIndex += 1;
      }
    }
    const result = inferSenseiAutoProfile(workouts);
    expect(result.sessionsConsidered).toBe(36);
    expect(result.level).toBe("avancé");
  });
});
