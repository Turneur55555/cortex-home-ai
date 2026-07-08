import { describe, expect, it } from "vitest";
import { inferSenseiAutoProfile, type AutoProfileWorkout } from "./senseiAutoProfile";

function set(reps: number, weight: number, completed = true, rest_seconds?: number) {
  return { reps, weight, completed, rest_seconds };
}

function workout(
  date: string,
  exercises: AutoProfileWorkout["exercises"],
  opts: { discipline?: string | null; duration_minutes?: number | null } = {},
) {
  return {
    date,
    discipline: opts.discipline ?? "muscu",
    duration_minutes: opts.duration_minutes ?? null,
    exercises,
  };
}

describe("inferSenseiAutoProfile — profil vide / cas limites", () => {
  it("retourne un profil vide sans aucune séance", () => {
    const result = inferSenseiAutoProfile([]);
    expect(result.sessionsConsidered).toBe(0);
    expect(result.level).toBe("intermédiaire");
    expect(result.goal).toBe("hypertrophie");
    expect(result.exerciseProgress).toEqual([]);
    expect(result.muscleVolume).toEqual([]);
    expect(result.mostTrainedMuscles).toEqual([]);
    expect(result.leastTrainedMuscles).toEqual([]);
    expect(result.avgSessionDurationMinutes).toBeNull();
    expect(result.avgRestSeconds).toBeNull();
  });

  it("ignore les disciplines non-musculation", () => {
    const workouts = [
      workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(8, 60)] }], {
        discipline: "hyrox",
      }),
      workout("2026-06-08", [{ name: "Squat", exercise_sets: [set(8, 60)] }], {
        discipline: "cardio",
      }),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.sessionsConsidered).toBe(0);
  });

  it("ignore les séries non validées (profil vide, pas de tentative de deviner)", () => {
    const workouts = [
      workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(4, 100, false)] }]),
      workout("2026-06-08", [{ name: "Squat", exercise_sets: [set(4, 100, false)] }]),
      workout("2026-06-15", [{ name: "Squat", exercise_sets: [set(4, 100, false)] }]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.sessionsConsidered).toBe(3);
    expect(result.level).toBe("intermédiaire");
    expect(result.goal).toBe("hypertrophie");
    expect(result.exerciseProgress).toEqual([]);
  });
});

describe("inferSenseiAutoProfile — objectif", () => {
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
});

describe("inferSenseiAutoProfile — progression par exercice", () => {
  it("marque un exercice avec une seule séance comme 'nouveau'", () => {
    const result = inferSenseiAutoProfile([
      workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(8, 60)] }]),
      workout("2026-06-08", [{ name: "Développé couché", exercise_sets: [set(8, 40)] }]),
      workout("2026-06-15", [{ name: "Tirage poitrine", exercise_sets: [set(8, 40)] }]),
    ]);
    const squat = result.exerciseProgress.find((e) => e.name === "Squat");
    expect(squat?.trend).toBe("nouveau");
    expect(squat?.sessionsTracked).toBe(1);
  });

  it("détecte une progression individuelle (charge en hausse)", () => {
    const result = inferSenseiAutoProfile([
      workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(8, 60)] }]),
      workout("2026-06-08", [{ name: "Squat", exercise_sets: [set(8, 65)] }]),
      workout("2026-06-15", [{ name: "Squat", exercise_sets: [set(8, 70)] }]),
    ]);
    const squat = result.exerciseProgress.find((e) => e.name === "Squat");
    expect(squat?.trend).toBe("progression");
    expect(squat?.lastWeight).toBe(70);
    expect(squat?.personalRecord).toBe(70);
    expect(squat?.muscles).toContain("quadriceps");
  });

  it("détecte une stagnation (charge identique)", () => {
    const result = inferSenseiAutoProfile([
      workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(8, 60)] }]),
      workout("2026-06-08", [{ name: "Squat", exercise_sets: [set(8, 60)] }]),
      workout("2026-06-15", [{ name: "Squat", exercise_sets: [set(8, 60)] }]),
    ]);
    const squat = result.exerciseProgress.find((e) => e.name === "Squat");
    expect(squat?.trend).toBe("stagnation");
  });

  it("détecte une régression (charge en baisse)", () => {
    const result = inferSenseiAutoProfile([
      workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(8, 80)] }]),
      workout("2026-06-08", [{ name: "Squat", exercise_sets: [set(8, 70)] }]),
      workout("2026-06-15", [{ name: "Squat", exercise_sets: [set(8, 60)] }]),
    ]);
    const squat = result.exerciseProgress.find((e) => e.name === "Squat");
    expect(squat?.trend).toBe("regression");
    expect(squat?.personalRecord).toBe(80);
    expect(squat?.lastWeight).toBe(60);
  });

  it("borne à 8 exercices suivis, triés par nombre de séances décroissant", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let i = 0; i < 10; i += 1) {
      workouts.push(
        workout(`2026-01-${String(i + 1).padStart(2, "0")}`, [
          { name: `Exercice ${i}`, exercise_sets: [set(8, 40)] },
        ]),
      );
    }
    // "Exercice 0" est suivi sur 3 séances de plus, doit dominer le tri.
    workouts.push(workout("2026-02-01", [{ name: "Exercice 0", exercise_sets: [set(8, 42)] }]));
    workouts.push(workout("2026-02-08", [{ name: "Exercice 0", exercise_sets: [set(8, 44)] }]));
    workouts.push(workout("2026-02-15", [{ name: "Exercice 0", exercise_sets: [set(8, 46)] }]));

    const result = inferSenseiAutoProfile(workouts);
    expect(result.exerciseProgress.length).toBe(8);
    expect(result.exerciseProgress[0].name).toBe("Exercice 0");
    expect(result.exerciseProgress[0].sessionsTracked).toBe(4);
  });
});

describe("inferSenseiAutoProfile — volume par groupe musculaire", () => {
  it("identifie les muscles les plus et les moins sollicités", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let i = 0; i < 6; i += 1) {
      const date = new Date(2026, 0, 1 + i * 7).toISOString().slice(0, 10);
      workouts.push(
        workout(date, [
          { name: "Développé couché", exercise_sets: [set(10, 80), set(10, 80)] },
          { name: "Curl", exercise_sets: [set(10, 10)] },
        ]),
      );
    }
    const result = inferSenseiAutoProfile(workouts);
    expect(result.mostTrainedMuscles[0]).toBe("pectoraux");
    // Aucun de ces 2 exercices ne sollicite le bas du corps : les 3 muscles
    // négligés retournés ne doivent jamais recouper les muscles entraînés.
    const trained = new Set(["pectoraux", "triceps", "epaules", "biceps", "avant-bras"]);
    expect(result.leastTrainedMuscles.length).toBe(3);
    for (const muscle of result.leastTrainedMuscles) {
      expect(trained.has(muscle)).toBe(false);
    }
  });

  it("calcule un volume hebdomadaire moyen positif pour un muscle entraîné chaque semaine", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let i = 0; i < 4; i += 1) {
      const date = new Date(2026, 0, 1 + i * 7).toISOString().slice(0, 10);
      workouts.push(workout(date, [{ name: "Squat", exercise_sets: [set(8, 100), set(8, 100)] }]));
    }
    const result = inferSenseiAutoProfile(workouts);
    const quadriceps = result.muscleVolume.find((m) => m.muscle === "quadriceps");
    // 2 séries x 8 reps x 100kg = 1600 par séance, 1 séance/semaine.
    expect(quadriceps?.weeklyVolume).toBe(1600);
  });
});

describe("inferSenseiAutoProfile — durée de séance et repos", () => {
  it("calcule la durée moyenne de séance quand elle est renseignée", () => {
    const workouts = [
      workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(8, 60)] }], {
        duration_minutes: 40,
      }),
      workout("2026-06-08", [{ name: "Squat", exercise_sets: [set(8, 60)] }], {
        duration_minutes: 50,
      }),
      workout("2026-06-15", [{ name: "Squat", exercise_sets: [set(8, 60)] }], {
        duration_minutes: 60,
      }),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.avgSessionDurationMinutes).toBe(50);
  });

  it("retourne null pour la durée moyenne si jamais renseignée", () => {
    const workouts = [workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(8, 60)] }])];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.avgSessionDurationMinutes).toBeNull();
  });

  it("calcule le repos moyen entre séries quand il est renseigné", () => {
    const workouts = [
      workout("2026-06-01", [
        { name: "Squat", exercise_sets: [set(8, 60, true, 90), set(8, 60, true, 120)] },
      ]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.avgRestSeconds).toBe(105);
  });

  it("retourne null pour le repos moyen si jamais renseigné", () => {
    const workouts = [workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(8, 60)] }])];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.avgRestSeconds).toBeNull();
  });
});

describe("inferSenseiAutoProfile — niveau", () => {
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

  it("reste 'débutant' avec très peu de séances", () => {
    const result = inferSenseiAutoProfile([
      workout("2026-06-01", [{ name: "Squat", exercise_sets: [set(8, 60)] }]),
    ]);
    expect(result.level).toBe("débutant");
  });
});
