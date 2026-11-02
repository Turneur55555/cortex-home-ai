import { describe, expect, it } from "vitest";
import {
  MIN_SESSIONS,
  buildStrengthCard,
  describeSince,
  formatKgFr,
  groupForCategory,
  groupFromName,
  sessionTopLoad,
  strengthWindowStart,
  type StrengthExercise,
  type StrengthSet,
  type StrengthWorkout,
} from "./strengthCard";

const TODAY = "2026-11-02";

let seq = 0;
interface Fixture {
  workouts: StrengthWorkout[];
  exercises: StrengthExercise[];
  sets: StrengthSet[];
}
const empty = (): Fixture => ({ workouts: [], exercises: [], sets: [] });

/** Une séance d'un exercice, avec ses séries (charge, répétitions, cochée). */
function session(
  f: Fixture,
  date: string,
  name: string,
  rows: Array<[number | null, number, boolean?]>,
  extra: Partial<StrengthExercise> = {},
  workoutExtra: Partial<StrengthWorkout> = {},
) {
  seq += 1;
  const workoutId = `w-${seq}`;
  const exerciseId = `e-${seq}`;
  f.workouts.push({
    id: workoutId,
    date,
    status: "completed",
    discipline: "muscu",
    ...workoutExtra,
  });
  f.exercises.push({ id: exerciseId, workout_id: workoutId, name, ...extra });
  for (const [weight, reps, completed = true] of rows) {
    f.sets.push({ exercise_id: exerciseId, weight, reps, completed });
  }
}

const card = (f: Fixture, categories: Record<string, string | null> = {}) =>
  buildStrengthCard({
    ...f,
    categoryByReferenceId: new Map(Object.entries(categories)),
    todayDate: TODAY,
  });

describe("groupes musculaires", () => {
  it("la catégorie du référentiel décide (accents et casse ignorés)", () => {
    expect(groupForCategory("Pectoraux")).toBe("pec");
    expect(groupForCategory("Épaules")).toBe("epaules");
    expect(groupForCategory("Avant-bras")).toBe("bras");
    expect(groupForCategory("Fessiers")).toBe("jambes");
    expect(groupForCategory("Abdominaux")).toBeNull();
    expect(groupForCategory(null)).toBeNull();
  });

  it("repli par le nom pour une référence sans catégorie (cas réels de novembre 2026)", () => {
    expect(groupFromName("Curl inversé circle")).toBe("bras");
    expect(groupFromName("Extension triceps au-dessus de la tête")).toBe("bras");
    expect(groupFromName("Pushdown corde")).toBe("bras");
    expect(groupFromName("Wrist curl à la poulie basse")).toBe("bras");
    expect(groupFromName("Leg extension")).toBe("jambes");
    expect(groupFromName("Chest press")).toBe("pec");
    expect(groupFromName("Shoulder press")).toBe("epaules");
    expect(groupFromName("Tirage horizontal assis poitrine")).toBe("dos");
    expect(groupFromName("Gainage")).toBeNull();
  });
});

describe("sessionTopLoad — le record se lit dans les séries comptées", () => {
  const ex: StrengthExercise = { id: "e", workout_id: "w", name: "X" };
  it("la plus lourde des séries cochées avec des répétitions", () => {
    expect(
      sessionTopLoad(ex, [
        { exercise_id: "e", weight: 60, reps: 10, completed: true },
        { exercise_id: "e", weight: 65, reps: 8, completed: true },
        { exercise_id: "e", weight: 90, reps: 5, completed: false },
        { exercise_id: "e", weight: 100, reps: 0, completed: true },
      ]),
    ).toBe(65);
  });
  it("poids du corps (charge vide) : pas de record en kg", () => {
    expect(
      sessionTopLoad(ex, [{ exercise_id: "e", weight: null, reps: 12, completed: true }]),
    ).toBe(null);
  });
  it("saisie sans séries détaillées : les colonnes résumé", () => {
    expect(sessionTopLoad({ ...ex, sets: 3, reps: 10, weight: 55 }, [])).toBe(55);
    expect(sessionTopLoad({ ...ex, sets: 3, reps: 10, weight: null }, [])).toBe(null);
  });
});

describe("buildStrengthCard — la carte de Nathan au 02/11/2026", () => {
  const nathan = () => {
    const f = empty();
    // DOS : tirage horizontal 70 → 80 kg ; tractions au poids du corps (sans record en kg).
    session(f, "2026-06-20", "Tirage horizontal assis poitrine", [[70, 10]], {
      exercise_reference_id: "r-tir",
    });
    session(f, "2026-08-10", "Tirage horizontal assis poitrine", [[75, 10]], {
      exercise_reference_id: "r-tir",
    });
    session(f, "2026-11-02", "Tirage horizontal assis poitrine", [[80, 10]], {
      exercise_reference_id: "r-tir",
    });
    for (const d of ["2026-06-20", "2026-08-10", "2026-11-02"]) {
      session(f, d, "Traction prise neutre", [[null, 10]], { exercise_reference_id: "r-tra" });
    }
    // PEC : chest press 55 → 70 ; chest press debout 75 stable (plus lourd → phare).
    session(f, "2026-06-16", "Chest press", [[55, 10]], { exercise_reference_id: "r-cp" });
    session(f, "2026-08-04", "Chest press", [[65, 10]], { exercise_reference_id: "r-cp" });
    session(f, "2026-10-30", "Chest press", [[70, 10]], { exercise_reference_id: "r-cp" });
    for (const d of ["2026-06-18", "2026-09-01", "2026-10-30"]) {
      session(f, d, "Chest press - debout", [[75, 8]], { exercise_reference_id: "r-cpd" });
    }
    // ÉPAULES : shoulder press 50 → 60, une saisie « séance passée » (résumé) à 55.
    session(f, "2026-06-19", "Shoulder press", [[50, 10]], { exercise_reference_id: "r-sp" });
    session(f, "2026-10-20", "Shoulder press", [[60, 10]], { exercise_reference_id: "r-sp" });
    session(f, "2026-10-27", "Shoulder press", [], {
      exercise_reference_id: "r-sp",
      sets: 3,
      reps: 10,
      weight: 55,
    });
    // BRAS : curl marteau corde 20 → 25 (Avant-bras), pushdown sans catégorie (repli par nom).
    for (const [d, w] of [
      ["2026-08-03", 20],
      ["2026-09-15", 22.5],
      ["2026-11-02", 25],
    ] as const) {
      session(f, d, "Câble curl marteau with rope", [[w, 12]], { exercise_reference_id: "r-cm" });
    }
    for (const d of ["2026-08-04", "2026-09-16", "2026-10-30"]) {
      session(f, d, "Pushdown corde", [[20, 12]], { exercise_reference_id: "r-pd" });
    }
    return f;
  };
  const categories = {
    "r-tir": "Dos",
    "r-tra": "Dos",
    "r-cp": "Pectoraux",
    "r-cpd": "Pectoraux",
    "r-sp": "Épaules",
    "r-cm": "Avant-bras",
    "r-pd": null,
  };

  it("une ligne par groupe, dans l'ordre PEC · DOS · ÉPAULES · BRAS, le record le plus lourd", () => {
    const result = card(nathan(), categories);
    expect(result.rows.map((r) => [r.label, r.exerciseName, r.recordKg, r.progressionKg])).toEqual([
      ["PEC", "Chest press - debout", 75, 0],
      ["DOS", "Tirage horizontal assis poitrine", 80, 10],
      ["ÉPAULES", "Shoulder press", 60, 10],
      ["BRAS", "Câble curl marteau with rope", 25, 5],
    ]);
    expect(result.rows.map((r) => r.barRatio)).toEqual([75 / 80, 1, 60 / 80, 25 / 80]);
    expect(result.since).toBe("2026-06-18");
    expect(describeSince(result.since)).toBe("progression depuis juin");
  });

  it("hors ligne sans cache de catégories : le classement par nom suffit", () => {
    const result = card(nathan(), {});
    expect(result.rows.map((r) => r.label)).toEqual(["PEC", "DOS", "ÉPAULES", "BRAS"]);
  });

  it(`moins de ${MIN_SESSIONS} séances : pas un phare, même plus lourd (une faute de frappe n'est pas un record)`, () => {
    const f = nathan();
    session(f, "2026-10-01", "Élévations latérales câble", [[250, 10]], {
      exercise_reference_id: "r-el",
    });
    session(f, "2026-10-08", "Élévations latérales câble", [[5, 10]], {
      exercise_reference_id: "r-el",
    });
    const result = card(f, { ...categories, "r-el": "Épaules" });
    expect(result.rows.find((r) => r.group === "epaules")?.exerciseName).toBe("Shoulder press");
  });

  it("rien d'antérieur au 1er février 2026, et une fenêtre glissante de 6 mois", () => {
    expect(strengthWindowStart("2026-03-01")).toBe("2026-02-01");
    expect(strengthWindowStart(TODAY)).toBe("2026-05-03");
    const f = empty();
    for (const d of ["2025-12-01", "2026-01-10", "2026-04-01"]) {
      session(f, d, "Chest press", [[200, 1]], { exercise_reference_id: "r-cp" });
    }
    expect(card(f, { "r-cp": "Pectoraux" }).rows).toEqual([]);
  });

  it("ni séance active, ni autre discipline, ni séance future", () => {
    const f = empty();
    session(f, "2026-10-01", "Chest press", [[60, 10]], {}, { status: "active" });
    session(f, "2026-10-02", "Chest press", [[60, 10]], {}, { discipline: "course" });
    session(f, "2026-12-01", "Chest press", [[60, 10]]);
    session(f, "2026-10-03", "Chest press", [[60, 10]]);
    expect(card(f).rows).toEqual([]);
  });

  it("aucune donnée : carte vide, `since` nul", () => {
    expect(card(empty())).toEqual({ rows: [], since: null });
  });
});

describe("format", () => {
  it("français, une décimale au plus", () => {
    expect(formatKgFr(62.5)).toBe("62,5");
    expect(formatKgFr(80)).toBe("80");
  });
});
