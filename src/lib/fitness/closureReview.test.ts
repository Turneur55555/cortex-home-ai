import { describe, expect, it } from "vitest";
import {
  applyClosureDecision,
  closureDecision,
  durationFieldText,
  formatPendingSet,
  looksLoggedAfterTheFact,
  parseDurationInput,
  reviewSessionBeforeClosure,
  type ReviewableExercise,
} from "./closureReview";

const set = (
  id: string,
  set_number: number,
  reps: number | null,
  weight: number | null,
  completed: boolean | null,
) => ({ id, set_number, reps, weight, completed });

// Calqué sur la séance du 30/10 : des séries cochées, une série prévue non faite en fin de
// séance, une série ajoutée et jamais remplie, un exercice au poids du corps.
const EXERCISES: ReviewableExercise[] = [
  {
    id: "e1",
    name: "Chest press",
    exercise_sets: [set("s2", 2, 10, 70, true), set("s1", 1, 10, 70, true)],
  },
  {
    id: "e2",
    name: "Pushdown corde",
    exercise_sets: [set("s3", 1, 10, 20, true), set("s4", 2, 10, 20, false)],
  },
  {
    id: "e3",
    name: "Dips",
    exercise_sets: [set("s5", 1, 12, null, null), set("s6", 2, null, null, false)],
  },
];

describe("reviewSessionBeforeClosure", () => {
  it("compte les séries cochées, isole celles en suspens et les séries vides", () => {
    const review = reviewSessionBeforeClosure(EXERCISES);
    expect(review.validatedSets).toBe(3);
    expect(review.pendingSets).toEqual([
      { setId: "s4", exerciseName: "Pushdown corde", position: 2, reps: 10, weight: 20 },
      { setId: "s5", exerciseName: "Dips", position: 1, reps: 12, weight: null },
    ]);
    expect(review.emptySetIds).toEqual(["s6"]);
  });

  it("la position suit l'ordre des numéros de série, pas l'ordre du tableau", () => {
    const review = reviewSessionBeforeClosure([
      {
        id: "e",
        name: "Tirage",
        exercise_sets: [set("b", 7, 8, 80, false), set("a", 3, 10, 80, true)],
      },
    ]);
    expect(review.pendingSets[0]?.position).toBe(2);
  });

  it("répétitions à zéro, négatives ou non finies = série vide, jamais « en suspens »", () => {
    const review = reviewSessionBeforeClosure([
      {
        id: "e",
        name: "X",
        exercise_sets: [
          set("z", 1, 0, 50, false),
          set("n", 2, -3, 50, false),
          set("nan", 3, Number.NaN, 50, false),
        ],
      },
    ]);
    expect(review.pendingSets).toEqual([]);
    expect(review.emptySetIds).toEqual(["z", "n", "nan"]);
  });

  it("séance vide ou absente : rien à trancher", () => {
    expect(reviewSessionBeforeClosure([])).toEqual({
      validatedSets: 0,
      pendingSets: [],
      emptySetIds: [],
    });
    expect(reviewSessionBeforeClosure(undefined).validatedSets).toBe(0);
  });
});

describe("closureDecision", () => {
  const review = reviewSessionBeforeClosure(EXERCISES);

  it("« les compter » : les séries en suspens sont validées, les vides retirées", () => {
    expect(closureDecision(review, "count")).toEqual({
      validateSetIds: ["s4", "s5"],
      removeSetIds: ["s6"],
    });
  });

  it("« terminer sans elles » : les séries en suspens ET les vides sont retirées", () => {
    expect(closureDecision(review, "drop")).toEqual({
      validateSetIds: [],
      removeSetIds: ["s4", "s5", "s6"],
    });
  });

  it("sans série en suspens, le choix est sans objet : seules les vides partent", () => {
    const clean = reviewSessionBeforeClosure([EXERCISES[0], EXERCISES[2]].slice(0, 1));
    expect(closureDecision(clean, "count")).toEqual({ validateSetIds: [], removeSetIds: [] });
    expect(closureDecision(review, null)).toEqual({ validateSetIds: [], removeSetIds: ["s6"] });
  });
});

describe("applyClosureDecision", () => {
  const workout = { id: "w", exercises: EXERCISES };

  it("l'instantané de fin reflète la décision (séries comptées cochées, retirées absentes)", () => {
    const next = applyClosureDecision(workout, { validateSetIds: ["s4"], removeSetIds: ["s6"] });
    const pushdown = next.exercises[1].exercise_sets;
    expect(pushdown.find((s) => s.id === "s4")?.completed).toBe(true);
    expect(next.exercises[2].exercise_sets.map((s) => s.id)).toEqual(["s5"]);
    // l'original n'est pas muté
    expect(EXERCISES[1].exercise_sets[1].completed).toBe(false);
  });

  it("décision vide : même objet, aucune copie inutile", () => {
    expect(applyClosureDecision(workout, { validateSetIds: [], removeSetIds: [] })).toBe(workout);
  });
});

describe("parseDurationInput", () => {
  it.each([
    ["45", 45],
    [" 45 min ", 45],
    ["45mn", 45],
    ["1h", 60],
    ["1h10", 70],
    ["1 h 05", 65],
    ["2h", 120],
    ["240", 240],
    ["1", 1],
  ])("« %s » → %i min", (raw, minutes) => {
    expect(parseDurationInput(raw)).toEqual({ kind: "value", minutes });
  });

  it("vide → la clôture calcule elle-même", () => {
    expect(parseDurationInput("")).toEqual({ kind: "empty" });
    expect(parseDurationInput("   ")).toEqual({ kind: "empty" });
  });

  it.each(["0", "241", "5h", "1h60", "abc", "-10", "4,5", "1e3", "45s"])(
    "« %s » → refusé, rien n'est écrit",
    (raw) => {
      expect(parseDurationInput(raw)).toEqual({ kind: "invalid" });
    },
  );
});

describe("formatPendingSet", () => {
  it("charge en virgule française, sans arrondi ; poids du corps en répétitions", () => {
    expect(formatPendingSet({ reps: 10, weight: 17.5 })).toBe("17,5 kg × 10");
    expect(formatPendingSet({ reps: 8, weight: 80 })).toBe("80 kg × 8");
    expect(formatPendingSet({ reps: 12, weight: null })).toBe("12 reps");
    expect(formatPendingSet({ reps: 12, weight: 0 })).toBe("12 reps");
  });
});

describe("durationFieldText / looksLoggedAfterTheFact", () => {
  it("préremplit une durée plausible, jamais une durée implausible", () => {
    expect(durationFieldText(39)).toBe("39");
    expect(durationFieldText(600)).toBe("");
    expect(durationFieldText(null)).toBe("");
    expect(durationFieldText(Number.NaN)).toBe("");
  });

  it("1-2 min pour une séance qui porte des séries = saisie après coup probable", () => {
    expect(looksLoggedAfterTheFact(1, 20)).toBe(true);
    expect(looksLoggedAfterTheFact(2, 3)).toBe(true);
    expect(looksLoggedAfterTheFact(3, 20)).toBe(false);
    expect(looksLoggedAfterTheFact(1, 2)).toBe(false);
    expect(looksLoggedAfterTheFact(null, 20)).toBe(false);
  });
});
