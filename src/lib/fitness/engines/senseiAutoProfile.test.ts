import { describe, expect, it } from "vitest";
import {
  inferSenseiAutoProfile,
  buildSenseiExplanation,
  type AutoProfileWorkout,
} from "./senseiAutoProfile";

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

describe("inferSenseiAutoProfile — compatibilité anciennes données (pré set-by-set)", () => {
  it("reprend les colonnes résumé (reps/weight/sets) quand exercise_sets est absent", () => {
    const workouts = [
      {
        date: "2026-05-01",
        discipline: "muscu",
        exercises: [{ name: "Squat", weight: 80, reps: 8, sets: 3 }],
      },
      {
        date: "2026-05-08",
        discipline: "muscu",
        exercises: [{ name: "Squat", weight: 85, reps: 8, sets: 3 }],
      },
      {
        date: "2026-05-15",
        discipline: "muscu",
        exercises: [{ name: "Squat", weight: 90, reps: 8, sets: 3 }],
      },
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.sessionsConsidered).toBe(3);
    const squat = result.exerciseProgress.find((e) => e.name === "Squat");
    expect(squat?.trend).toBe("progression");
    expect(squat?.lastWeight).toBe(90);
    expect(squat?.sessionsTracked).toBe(3);
    expect(
      result.muscleVolume.find((m) => m.muscle === "quadriceps")?.weeklyVolume,
    ).toBeGreaterThan(0);
  });

  it("mélange sans erreur des séances anciennes (résumé) et récentes (set-by-set)", () => {
    const workouts = [
      {
        date: "2026-05-01",
        discipline: "muscu",
        exercises: [{ name: "Squat", weight: 80, reps: 8, sets: 3 }],
      },
      workout("2026-06-01", [
        { name: "Squat", exercise_sets: [set(8, 90), set(8, 90), set(8, 90)] },
      ]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    const squat = result.exerciseProgress.find((e) => e.name === "Squat");
    expect(squat?.sessionsTracked).toBe(2);
    expect(squat?.lastWeight).toBe(90);
  });

  it("ne plante pas sur une séance sans exercises ni colonnes résumé exploitables", () => {
    const workouts = [
      { date: "2026-05-01", discipline: "muscu", exercises: [{ name: "Squat" }] },
      { date: "2026-05-08", discipline: "muscu", exercises: undefined },
    ];
    expect(() => inferSenseiAutoProfile(workouts)).not.toThrow();
    const result = inferSenseiAutoProfile(workouts);
    expect(result.sessionsConsidered).toBe(2);
    expect(result.exerciseProgress).toEqual([]);
  });
});

describe("inferSenseiAutoProfile — charge et séries suggérées", () => {
  it("suggère une charge en légère hausse pour un exercice en progression normale", () => {
    const result = inferSenseiAutoProfile([
      workout("2026-01-01", [
        { name: "Squat", exercise_sets: [set(8, 100), set(8, 100), set(8, 100)] },
      ]),
      workout("2026-03-01", [
        { name: "Squat", exercise_sets: [set(8, 103), set(8, 103), set(8, 103)] },
      ]),
    ]);
    const squat = result.exerciseProgress.find((e) => e.name === "Squat");
    expect(squat?.trend).toBe("progression");
    expect(squat?.pace).toBe("normale");
    expect(squat?.suggestedWeight).toBeGreaterThan(103);
    expect(squat?.suggestedSets).toBe(3);
  });

  it("détecte un rythme de progression 'rapide' et suggère une hausse plus marquée", () => {
    const result = inferSenseiAutoProfile([
      workout("2026-01-01", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
      workout("2026-01-08", [{ name: "Squat", exercise_sets: [set(8, 115)] }]),
    ]);
    const squat = result.exerciseProgress.find((e) => e.name === "Squat");
    expect(squat?.trend).toBe("progression");
    expect(squat?.pace).toBe("rapide");
    expect(squat!.suggestedWeight).toBeGreaterThan(squat!.lastWeight * 1.03);
  });

  it("compte les semaines de stagnation et suggère un léger deload après 3+ semaines", () => {
    const result = inferSenseiAutoProfile([
      workout("2026-01-01", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
      workout("2026-01-15", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
      workout("2026-02-01", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
      workout("2026-02-15", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
    ]);
    const squat = result.exerciseProgress.find((e) => e.name === "Squat");
    expect(squat?.trend).toBe("stagnation");
    expect(squat?.stagnantWeeks).toBeGreaterThanOrEqual(3);
    expect(squat?.suggestedWeight).toBeLessThan(100);
  });

  it("garde la charge stable pour une régression (ne pousse pas plus bas automatiquement)", () => {
    const result = inferSenseiAutoProfile([
      workout("2026-01-01", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
      workout("2026-01-08", [{ name: "Squat", exercise_sets: [set(8, 80)] }]),
    ]);
    const squat = result.exerciseProgress.find((e) => e.name === "Squat");
    expect(squat?.trend).toBe("regression");
    expect(squat?.suggestedWeight).toBe(80);
  });
});

describe("inferSenseiAutoProfile — statut relatif des groupes musculaires", () => {
  it("marque surentraîné un muscle avec un volume nettement supérieur aux autres", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let i = 0; i < 6; i += 1) {
      const date = new Date(2026, 0, 1 + i * 7).toISOString().slice(0, 10);
      workouts.push(
        workout(date, [
          // Pectoraux : très haut volume chaque semaine.
          { name: "Développé couché", exercise_sets: [set(10, 100), set(10, 100), set(10, 100)] },
          // Dos, épaules, jambes : volume modéré et comparable entre eux.
          { name: "Tirage poitrine", exercise_sets: [set(10, 30)] },
          { name: "Développé militaire", exercise_sets: [set(10, 25)] },
          { name: "Squat", exercise_sets: [set(10, 28)] },
        ]),
      );
    }
    const result = inferSenseiAutoProfile(workouts);
    const pecs = result.muscleVolume.find((m) => m.muscle === "pectoraux");
    expect(pecs?.status).toBe("surentraine");
    expect(result.overTrainedMuscles).toContain("pectoraux");
  });

  it("marque 'neglige' un muscle jamais travaillé", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let i = 0; i < 4; i += 1) {
      const date = new Date(2026, 0, 1 + i * 7).toISOString().slice(0, 10);
      workouts.push(workout(date, [{ name: "Squat", exercise_sets: [set(8, 80)] }]));
    }
    const result = inferSenseiAutoProfile(workouts);
    const pecs = result.muscleVolume.find((m) => m.muscle === "pectoraux");
    expect(pecs?.status).toBe("neglige");
    expect(pecs?.weeklyVolume).toBe(0);
  });

  it("n'affirme pas de sur/sous-entraînement avec trop peu de muscles distincts pour comparer", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let i = 0; i < 4; i += 1) {
      const date = new Date(2026, 0, 1 + i * 7).toISOString().slice(0, 10);
      workouts.push(workout(date, [{ name: "Squat", exercise_sets: [set(8, 80)] }]));
    }
    const result = inferSenseiAutoProfile(workouts);
    const quadriceps = result.muscleVolume.find((m) => m.muscle === "quadriceps");
    expect(quadriceps?.status).toBe("equilibre");
  });
});

describe("inferSenseiAutoProfile — exercices jamais pratiqués mais pertinents", () => {
  it("propose des candidats du catalogue jamais réalisés par l'utilisateur", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let i = 0; i < 3; i += 1) {
      const date = new Date(2026, 0, 1 + i * 7).toISOString().slice(0, 10);
      workouts.push(workout(date, [{ name: "Squat", exercise_sets: [set(8, 80)] }]));
    }
    const result = inferSenseiAutoProfile(workouts);
    expect(result.neverDoneExercises.length).toBeGreaterThan(0);
    expect(result.neverDoneExercises.every((e) => e.name !== "Squat")).toBe(true);
    expect(result.neverDoneExercises.length).toBeLessThanOrEqual(12);
  });
});

describe("inferSenseiAutoProfile — anti-répétition (séances récentes)", () => {
  it("retourne les dernières séances (la plus récente en premier), bornées à 3", () => {
    const workouts = [
      workout("2026-01-01", [{ name: "Squat", exercise_sets: [set(8, 80)] }]),
      workout("2026-01-08", [{ name: "Développé couché", exercise_sets: [set(8, 60)] }]),
      workout("2026-01-15", [{ name: "Tirage poitrine", exercise_sets: [set(8, 50)] }]),
      workout("2026-01-22", [{ name: "Curl", exercise_sets: [set(10, 15)] }]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.recentSessions.length).toBe(3);
    expect(result.recentSessions[0].date).toBe("2026-01-22");
    expect(result.recentSessions[0].exerciseNames).toEqual(["Curl"]);
  });
});

describe("inferSenseiAutoProfile — volume optimal et cycles de progression", () => {
  it("calcule un volume hebdomadaire optimal à partir des semaines de records", () => {
    const workouts = [
      workout("2026-01-01", [{ name: "Squat", exercise_sets: [set(8, 80), set(8, 80)] }]),
      workout("2026-01-08", [{ name: "Squat", exercise_sets: [set(8, 85), set(8, 85)] }]), // record
      workout("2026-01-15", [{ name: "Squat", exercise_sets: [set(8, 80), set(8, 80)] }]),
      workout("2026-01-22", [{ name: "Squat", exercise_sets: [set(8, 90), set(8, 90)] }]), // record
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.optimalWeeklyVolume).not.toBeNull();
    expect(result.optimalWeeklyVolume).toBeGreaterThan(0);
  });

  it("retourne null pour le volume optimal sans au moins 2 semaines de record", () => {
    const workouts = [
      workout("2026-01-01", [{ name: "Squat", exercise_sets: [set(8, 80)] }]),
      workout("2026-01-08", [{ name: "Squat", exercise_sets: [set(8, 70)] }]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.optimalWeeklyVolume).toBeNull();
  });

  it("compte les blocs de progression d'au moins 3 semaines consécutives de hausse", () => {
    const workouts: AutoProfileWorkout[] = [];
    const weeklyWeights = [80, 85, 90, 90, 88, 95, 100, 105]; // 3 hausses (bloc 1), plateau, 3 hausses (bloc 2)
    weeklyWeights.forEach((weight, i) => {
      const date = new Date(2026, 0, 1 + i * 7).toISOString().slice(0, 10);
      workouts.push(
        workout(date, [{ name: "Squat", exercise_sets: [set(8, weight), set(8, weight)] }]),
      );
    });
    const result = inferSenseiAutoProfile(workouts);
    expect(result.progressionCyclesCompleted).toBeGreaterThanOrEqual(1);
  });

  it("garde l'ordre chronologique des semaines au-delà de la semaine 9 (pas de tri lexical)", () => {
    // Régression : un weekKey non zero-paddé ("2026-W10") trie AVANT
    // "2026-W9" en tri lexical (comparaison caractère par caractère : '1' <
    // '8'/'9'), cassant l'ordre chronologique dont dépend
    // progressionCyclesCompleted — inévitable sur un historique complet, qui
    // dépasse forcément 9 semaines. Cette suite de poids n'a AUCUN bloc de
    // 3 hausses consécutives en ordre chronologique correct (100→105→100→
    // 105→100→95), mais un tri lexical qui regroupe W10-W13 avant W8-W9 en
    // fabrique un artificiellement (vérifié à la main).
    const workouts: AutoProfileWorkout[] = [];
    const weights = [100, 105, 100, 105, 100, 95];
    for (let i = 0; i < weights.length; i += 1) {
      const week = 8 + i;
      const date = new Date(2026, 0, 1 + week * 7).toISOString().slice(0, 10);
      workouts.push(
        workout(date, [{ name: "Squat", exercise_sets: [set(8, weights[i]), set(8, weights[i])] }]),
      );
    }
    const result = inferSenseiAutoProfile(workouts);
    expect(result.progressionCyclesCompleted).toBe(0);
  });
});

describe("inferSenseiAutoProfile — mémoire à long terme", () => {
  it("classe les exercices en progression la plus rapide en premier", () => {
    const workouts = [
      // Squat : hausse rapide (+15% en 1 semaine).
      workout("2026-01-01", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
      workout("2026-01-08", [{ name: "Squat", exercise_sets: [set(8, 115)] }]),
      // Développé couché : hausse normale (+3% sur 2 mois).
      workout("2026-01-01", [{ name: "Développé couché", exercise_sets: [set(8, 100)] }]),
      workout("2026-03-01", [{ name: "Développé couché", exercise_sets: [set(8, 103)] }]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.bestProgressingExercises[0]).toBe("Squat");
    expect(result.bestProgressingExercises).toContain("Développé couché");
  });

  it("identifie une stagnation chronique (≥4 semaines) mais pas une stagnation récente", () => {
    const workouts = [
      // Squat : stagnation depuis longtemps.
      workout("2026-01-01", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
      workout("2026-01-15", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
      workout("2026-02-01", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
      workout("2026-02-15", [{ name: "Squat", exercise_sets: [set(8, 100)] }]),
      // Curl : stagnation très récente (1 semaine), ne doit pas être "chronique".
      workout("2026-02-08", [{ name: "Curl", exercise_sets: [set(10, 15)] }]),
      workout("2026-02-15", [{ name: "Curl", exercise_sets: [set(10, 15)] }]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.chronicStagnationExercises).toContain("Squat");
    expect(result.chronicStagnationExercises).not.toContain("Curl");
  });

  it("détecte un exercice abandonné (pratiqué régulièrement puis plus revu depuis longtemps)", () => {
    const workouts = [
      workout("2026-01-01", [{ name: "Tirage poitrine", exercise_sets: [set(8, 50)] }]),
      workout("2026-01-08", [{ name: "Tirage poitrine", exercise_sets: [set(8, 52)] }]),
      workout("2026-01-15", [{ name: "Tirage poitrine", exercise_sets: [set(8, 54)] }]),
      // L'utilisateur continue à s'entraîner (Squat) longtemps après avoir arrêté le tirage.
      workout("2026-02-01", [{ name: "Squat", exercise_sets: [set(8, 80)] }]),
      workout("2026-04-01", [{ name: "Squat", exercise_sets: [set(8, 85)] }]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    expect(result.abandonedExercises).toContain("Tirage poitrine");
    expect(result.abandonedExercises).not.toContain("Squat");
  });

  it("identifie les exercices les plus fréquents", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let i = 0; i < 5; i += 1) {
      workouts.push(
        workout(`2026-01-${String(i * 7 + 1).padStart(2, "0")}`, [
          { name: "Squat", exercise_sets: [set(8, 80 + i)] },
        ]),
      );
    }
    workouts.push(workout("2026-04-01", [{ name: "Curl", exercise_sets: [set(10, 15)] }]));
    const result = inferSenseiAutoProfile(workouts);
    expect(result.mostFrequentExercises[0]).toBe("Squat");
  });

  it("identifie la meilleure variante parmi des exercices ciblant les mêmes muscles", () => {
    const workouts = [
      // Développé couché barre et haltères ciblent EXACTEMENT les mêmes
      // muscles (pectoraux/triceps/epaules) — une vraie "famille" détectable.
      workout("2026-01-01", [{ name: "Développé couché barre", exercise_sets: [set(8, 100)] }]),
      workout("2026-01-15", [{ name: "Développé couché barre", exercise_sets: [set(8, 100)] }]),
      workout("2026-02-01", [{ name: "Développé couché barre", exercise_sets: [set(8, 100)] }]),
      workout("2026-01-08", [{ name: "Développé couché haltères", exercise_sets: [set(8, 40)] }]),
      workout("2026-01-22", [{ name: "Développé couché haltères", exercise_sets: [set(8, 45)] }]),
    ];
    const result = inferSenseiAutoProfile(workouts);
    const group = result.bestVariants.find((g) => g.bestExercise === "Développé couché haltères");
    expect(group).toBeDefined();
    expect(group?.alternatives).toContain("Développé couché barre");
  });
});

describe("inferSenseiAutoProfile — fatigue systémique", () => {
  it("reste 'faible' pour un rythme d'entraînement stable et régulier", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let week = 0; week < 10; week += 1) {
      const date = new Date(2026, 0, 1 + week * 7).toISOString().slice(0, 10);
      workouts.push(workout(date, [{ name: "Squat", exercise_sets: [set(8, 80 + week)] }]));
    }
    const result = inferSenseiAutoProfile(workouts);
    expect(result.fatigue.level).toBe("faible");
    expect(result.fatigue.reasons).toEqual([]);
  });

  it("détecte une fatigue élevée sur un pic soudain de fréquence et de volume", () => {
    const workouts: AutoProfileWorkout[] = [];
    // Rythme habituel : 1 séance légère toutes les 2 semaines pendant ~4 mois.
    for (let i = 0; i < 8; i += 1) {
      const date = new Date(2026, 0, 1 + i * 14).toISOString().slice(0, 10);
      workouts.push(workout(date, [{ name: "Squat", exercise_sets: [set(8, 80)] }]));
    }
    // Pic soudain : 4 séances à haut volume dans les 6 derniers jours.
    const lastBaseDate = new Date(2026, 0, 1 + 7 * 14);
    for (let d = 0; d < 4; d += 1) {
      const date = new Date(lastBaseDate.getTime() + d * 2 * 86_400_000).toISOString().slice(0, 10);
      workouts.push(
        workout(date, [
          { name: "Squat", exercise_sets: [set(8, 80), set(8, 80), set(8, 80), set(8, 80)] },
        ]),
      );
    }
    const result = inferSenseiAutoProfile(workouts);
    expect(result.fatigue.level).toBe("élevée");
    expect(result.fatigue.reasons.length).toBeGreaterThan(0);
  });
});

describe("inferSenseiAutoProfile — points faibles", () => {
  it("priorise un muscle négligé ET un muscle qui progresse lentement", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let i = 0; i < 6; i += 1) {
      const date = new Date(2026, 0, 1 + i * 7).toISOString().slice(0, 10);
      workouts.push(
        workout(date, [
          // Pectoraux : bien entraînés et en progression.
          { name: "Développé couché", exercise_sets: [set(8, 80 + i * 2)] },
          // Dos : entraîné mais qui stagne (progression lente).
          { name: "Tirage poitrine", exercise_sets: [set(8, 50)] },
        ]),
      );
    }
    const result = inferSenseiAutoProfile(workouts);
    // Jambes jamais entraînées : forcément un point faible (volume nul).
    expect(result.weakPoints).toContain("quadriceps");
  });
});

describe("buildSenseiExplanation", () => {
  it("explique la hausse de charge pour un exercice en progression repris dans la séance", () => {
    const workouts = [
      workout("2026-01-01", [{ name: "Squat", exercise_sets: [set(8, 80)] }]),
      workout("2026-01-08", [{ name: "Squat", exercise_sets: [set(8, 85)] }]),
      workout("2026-01-15", [{ name: "Squat", exercise_sets: [set(8, 90)] }]),
    ];
    const profile = inferSenseiAutoProfile(workouts);
    const explanation = buildSenseiExplanation(profile, ["Squat"]);
    expect(explanation.some((r) => r.includes("Squat") && r.includes("progression"))).toBe(true);
  });

  it("mentionne la fatigue élevée quand elle est détectée", () => {
    const workouts: AutoProfileWorkout[] = [];
    for (let i = 0; i < 8; i += 1) {
      const date = new Date(2026, 0, 1 + i * 14).toISOString().slice(0, 10);
      workouts.push(workout(date, [{ name: "Squat", exercise_sets: [set(8, 80)] }]));
    }
    const lastBaseDate = new Date(2026, 0, 1 + 7 * 14);
    for (let d = 0; d < 4; d += 1) {
      const date = new Date(lastBaseDate.getTime() + d * 2 * 86_400_000).toISOString().slice(0, 10);
      workouts.push(
        workout(date, [
          { name: "Squat", exercise_sets: [set(8, 80), set(8, 80), set(8, 80), set(8, 80)] },
        ]),
      );
    }
    const profile = inferSenseiAutoProfile(workouts);
    const explanation = buildSenseiExplanation(profile, ["Squat"]);
    expect(explanation.some((r) => r.toLowerCase().includes("fatigue"))).toBe(true);
  });

  it("reste vide (pas de raison inventée) quand aucun signal ne s'applique", () => {
    const explanation = buildSenseiExplanation(
      {
        level: "intermédiaire",
        goal: "hypertrophie",
        sessionsConsidered: 0,
        weeklyFrequency: 0,
        avgSessionDurationMinutes: null,
        avgRestSeconds: null,
        optimalWeeklyVolume: null,
        progressionCyclesCompleted: 0,
        muscleVolume: [],
        mostTrainedMuscles: [],
        leastTrainedMuscles: [],
        overTrainedMuscles: [],
        exerciseProgress: [],
        neverDoneExercises: [],
        recentSessions: [],
        bestProgressingExercises: [],
        chronicStagnationExercises: [],
        abandonedExercises: [],
        mostFrequentExercises: [],
        bestVariants: [],
        fatigue: { level: "faible", reasons: [] },
        weakPoints: [],
      },
      ["Squat"],
    );
    expect(explanation).toEqual([]);
  });
});
