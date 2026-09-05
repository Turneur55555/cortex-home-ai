import { describe, expect, it } from "vitest";
import {
  SET_FIELD_LIMITS,
  bestEstimated1RM,
  isValidSet,
  parseSetFieldInput,
  setsTonnage,
  summarizeExerciseSetsForHistory,
  summarizeSets,
  topSet,
  totalReps,
} from "./sets";

/**
 * CHANTIER 9 — `lib/fitness/sets.ts` n'avait AUCUN test alors que tout ce que
 * la séance affiche de chiffré en dépend : tonnage, 1RM estimé, série la plus
 * lourde, résumé d'exercice. S'y ajoutent les deux ajouts du chantier :
 * la lecture d'un champ de saisie (C1) et le résumé de clôture (A2).
 */

describe("isValidSet — ce qui compte comme une série réalisée", () => {
  it("exige reps ET charge strictement positives", () => {
    expect(isValidSet({ reps: 10, weight: 60 })).toBe(true);
    expect(isValidSet({ reps: 0, weight: 60 })).toBe(false);
    expect(isValidSet({ reps: 10, weight: 0 })).toBe(false);
  });

  it("rejette null / undefined / absence de série", () => {
    expect(isValidSet(null)).toBe(false);
    expect(isValidSet(undefined)).toBe(false);
    expect(isValidSet({ reps: null, weight: 60 })).toBe(false);
    expect(isValidSet({ reps: 10, weight: undefined })).toBe(false);
  });

  it("rejette NaN et Infinity — aucun calcul ne doit partir d'une valeur non finie", () => {
    expect(isValidSet({ reps: Number.NaN, weight: 60 })).toBe(false);
    expect(isValidSet({ reps: 10, weight: Number.NaN })).toBe(false);
    expect(isValidSet({ reps: 10, weight: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe("agrégats d'un exercice", () => {
  const sets = [
    { reps: 10, weight: 60 },
    { reps: 8, weight: 80 },
    { reps: 8, weight: null }, // incomplète : ignorée partout
  ];

  it("setsTonnage n'additionne que les séries exploitables", () => {
    expect(setsTonnage(sets)).toBe(10 * 60 + 8 * 80);
    expect(setsTonnage([])).toBe(0);
    expect(setsTonnage(null)).toBe(0);
  });

  it("totalReps ignore les séries incomplètes", () => {
    expect(totalReps(sets)).toBe(18);
  });

  it("topSet retient la plus lourde, départagée par le nombre de répétitions", () => {
    expect(topSet(sets)).toEqual({ reps: 8, weight: 80 });
    expect(
      topSet([
        { reps: 5, weight: 80 },
        { reps: 9, weight: 80 },
      ]),
    ).toEqual({ reps: 9, weight: 80 });
    expect(topSet([{ reps: null, weight: null }])).toBeNull();
  });

  it("bestEstimated1RM retient la meilleure estimation, jamais NaN", () => {
    const best = bestEstimated1RM(sets);
    expect(best).not.toBeNull();
    expect(Number.isFinite(best as number)).toBe(true);
    expect(bestEstimated1RM([{ reps: Number.NaN, weight: 80 }])).toBeNull();
  });

  it("summarizeSets agrège les quatre mesures d'un coup", () => {
    expect(summarizeSets(sets)).toEqual({
      setCount: 2,
      tonnage: 10 * 60 + 8 * 80,
      best1RM: bestEstimated1RM(sets),
      totalReps: 18,
    });
  });
});

// ─── C1 — lecture d'un champ de saisie ────────────────────────────────────

describe("parseSetFieldInput — C1 : la saisie ne produit JAMAIS de NaN", () => {
  it("champ vide → null explicite (l'utilisateur efface sa valeur)", () => {
    expect(parseSetFieldInput("reps", "")).toEqual({ kind: "cleared" });
    expect(parseSetFieldInput("weight", "   ")).toEqual({ kind: "cleared" });
  });

  it("valeur simple → valeur exploitable", () => {
    expect(parseSetFieldInput("reps", "12")).toEqual({ kind: "value", value: 12 });
    expect(parseSetFieldInput("weight", "62.5")).toEqual({ kind: "value", value: 62.5 });
  });

  it("accepte la virgule décimale française et les espaces de frappe", () => {
    expect(parseSetFieldInput("weight", "62,5")).toEqual({ kind: "value", value: 62.5 });
    expect(parseSetFieldInput("weight", " 100 ")).toEqual({ kind: "value", value: 100 });
  });

  it("RÉGRESSION : ce qui valait NaN avant le chantier est refusé, pas écrit", () => {
    // `Number("abc")`, `Number("62,5")` et `Number("-")` valent tous NaN :
    // l'ancien `parse` les transmettait tels quels à la mutation.
    for (const raw of ["abc", "-", ".", "12kg", "12.5.3", "+-3"]) {
      const parsed = parseSetFieldInput("weight", raw);
      expect(parsed.kind, `saisie « ${raw} »`).toBe("invalid");
    }
  });

  it("les espaces internes sont retirés, comme dans le journal alimentaire", () => {
    // Même convention que `lib/nutrition/weight.ts::parseDecimal` : un espace
    // au milieu d'un nombre est une frappe parasite ou un séparateur de
    // milliers, jamais une saisie à rejeter.
    expect(parseSetFieldInput("weight", "1 00")).toEqual({ kind: "value", value: 100 });
  });

  it("refuse le négatif — une charge ou des répétitions négatives n'existent pas", () => {
    expect(parseSetFieldInput("weight", "-5")).toEqual({ kind: "invalid", reason: "negative" });
    expect(parseSetFieldInput("reps", "-1")).toEqual({ kind: "invalid", reason: "negative" });
  });

  it("0 reste accepté : c'est ainsi que se note le poids de corps", () => {
    expect(parseSetFieldInput("weight", "0")).toEqual({ kind: "value", value: 0 });
  });

  it("normalise comme la colonne le ferait — entier pour reps, 2 décimales pour weight", () => {
    // `exercise_sets.reps` est un `smallint`, `weight` un `numeric(6,2)` : sans
    // cette normalisation, le local et le serveur divergeraient en silence.
    expect(parseSetFieldInput("reps", "12.4")).toEqual({ kind: "value", value: 12 });
    expect(parseSetFieldInput("reps", "12.6")).toEqual({ kind: "value", value: 13 });
    expect(parseSetFieldInput("weight", "62.345")).toEqual({ kind: "value", value: 62.35 });
  });

  it("refuse le hors-bornes de la colonne plutôt que de le laisser bloquer la séance", () => {
    // Au-delà, PostgREST renvoie 22003 : l'opération épuiserait ses tentatives
    // puis passerait `blocked`, statut qui RETIENT la clôture de la séance.
    expect(parseSetFieldInput("weight", "10000")).toEqual({
      kind: "invalid",
      reason: "out-of-range",
    });
    expect(parseSetFieldInput("weight", String(SET_FIELD_LIMITS.weight.max))).toEqual({
      kind: "value",
      value: SET_FIELD_LIMITS.weight.max,
    });
    expect(parseSetFieldInput("reps", "40000")).toEqual({
      kind: "invalid",
      reason: "out-of-range",
    });
  });

  it("refuse les notations que `<input type=number>` laisse passer mais qui ne sont pas des saisies", () => {
    for (const raw of ["1e3", "0x10", "Infinity", "NaN"]) {
      expect(parseSetFieldInput("weight", raw).kind, `saisie « ${raw} »`).toBe("invalid");
    }
  });

  it("aucune sortie exploitable n'est NaN, quelle que soit l'entrée", () => {
    const inputs = ["", "0", "12", "12,5", "abc", "-3", "1e9", ".5", "9999.99", "999999"];
    for (const raw of inputs) {
      for (const field of ["reps", "weight"] as const) {
        const parsed = parseSetFieldInput(field, raw);
        if (parsed.kind === "value") {
          expect(Number.isFinite(parsed.value), `${field} « ${raw} »`).toBe(true);
          expect(parsed.value >= 0, `${field} « ${raw} »`).toBe(true);
        }
      }
    }
  });
});

// ─── A2 — résumé d'exercice à la clôture ──────────────────────────────────

describe("summarizeExerciseSetsForHistory — A2", () => {
  it("privilégie les séries VALIDÉES quand il y en a", () => {
    const summary = summarizeExerciseSetsForHistory([
      { reps: 10, weight: 60, completed: true },
      { reps: 8, weight: 80, completed: true },
      { reps: 12, weight: 100, completed: false },
    ]);
    expect(summary).toEqual({ sets: 2, reps: 8, weight: 80 });
  });

  it("retombe sur les séries renseignées quand aucune n'est validée", () => {
    const summary = summarizeExerciseSetsForHistory([
      { reps: 10, weight: 60, completed: false },
      { reps: 8, weight: 80, completed: false },
    ]);
    expect(summary).toEqual({ sets: 2, reps: 8, weight: 80 });
  });

  it("ignore les séries incomplètes dans le compte", () => {
    const summary = summarizeExerciseSetsForHistory([
      { reps: 10, weight: 60, completed: true },
      { reps: null, weight: null, completed: true },
    ]);
    expect(summary).toEqual({ sets: 1, reps: 10, weight: 60 });
  });

  it("aucune série exploitable → résumé VIDE, jamais une valeur qui ne correspond à rien", () => {
    expect(summarizeExerciseSetsForHistory([])).toEqual({
      sets: null,
      reps: null,
      weight: null,
    });
    expect(
      summarizeExerciseSetsForHistory([{ reps: null, weight: null, completed: false }]),
    ).toEqual({ sets: null, reps: null, weight: null });
  });

  it("ne produit jamais NaN, même si une série corrompue a survécu en local", () => {
    const summary = summarizeExerciseSetsForHistory([
      { reps: Number.NaN, weight: Number.NaN, completed: true },
      { reps: 10, weight: 60, completed: true },
    ]);
    expect(summary).toEqual({ sets: 1, reps: 10, weight: 60 });
  });
});
