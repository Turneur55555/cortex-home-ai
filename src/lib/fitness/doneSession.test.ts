import { describe, expect, it } from "vitest";
import {
  buildDoneSessionDraft,
  canPrefillDoneSession,
  defaultDoneSessionDuration,
  describeDoneExercise,
  describeDoneSessionError,
  lastSameNamedWorkout,
  parseDoneDuration,
  parseDoneSet,
  setsFromHistoryExercise,
  validateDoneSession,
  type DoneSessionDraft,
  type SourceTemplate,
  type SourceWorkout,
} from "./doneSession";

const TODAY = "2026-10-29";

let seq = 0;
function workout(
  date: string,
  name: string,
  exercises: SourceWorkout["exercises"],
  extra: Partial<SourceWorkout> = {},
): SourceWorkout {
  seq += 1;
  return {
    id: `w-${seq}`,
    date,
    name,
    status: "completed",
    discipline: "muscu",
    created_at: `${date}T16:00:00.000Z`,
    duration_minutes: null,
    exercises,
    ...extra,
  };
}

const sets = (...rows: Array<[number, number, boolean?]>) =>
  rows.map(([reps, weight, completed = true], index) => ({
    set_number: index + 1,
    reps,
    weight,
    completed,
  }));

const DOS_26 = workout("2026-10-26", "Dos", [
  {
    name: "Tirage poitrine",
    position: 0,
    exercise_reference_id: "ref-tirage",
    exercise_sets: sets([10, 60], [10, 60], [8, 65]),
  },
  { name: "Rowing barre", position: 1, exercise_sets: sets([10, 50], [10, 50]) },
]);

const TEMPLATE: SourceTemplate = {
  id: "tpl-dos",
  name: "Dos",
  exercises: [
    { name: "Rowing barre", position: 1, default_sets: 3, default_reps: 10, default_weight: 50 },
    {
      name: "Tirage poitrine",
      position: 0,
      default_sets: 4,
      default_reps: 12,
      default_weight: null,
    },
  ],
};

describe("setsFromHistoryExercise — les séries qu'on reprend d'une séance passée", () => {
  it("les séries COCHÉES seulement, dans l'ordre (une série non cochée n'a pas été faite)", () => {
    const rows = setsFromHistoryExercise({
      name: "X",
      exercise_sets: [
        { set_number: 2, reps: 8, weight: 65, completed: true },
        { set_number: 3, reps: 6, weight: 70, completed: false },
        { set_number: 1, reps: 10, weight: 60, completed: true },
      ],
    });
    expect(rows).toEqual([
      { reps: "10", weight: "60" },
      { reps: "8", weight: "65" },
    ]);
  });

  it("aucune série cochée : toutes les séries détaillées (séance ancienne)", () => {
    const rows = setsFromHistoryExercise({
      name: "X",
      exercise_sets: [{ set_number: 1, reps: 10, weight: 40, completed: false }],
    });
    expect(rows).toEqual([{ reps: "10", weight: "40" }]);
  });

  it("le poids du corps (0 kg) est une vraie série", () => {
    expect(setsFromHistoryExercise({ name: "Tractions", exercise_sets: sets([12, 0]) })).toEqual([
      { reps: "12", weight: "0" },
    ]);
  });

  it("sans séries détaillées : les colonnes résumé (« Enregistrer comme séance passée »)", () => {
    expect(setsFromHistoryExercise({ name: "X", sets: 3, reps: 10, weight: 50 })).toEqual([
      { reps: "10", weight: "50" },
      { reps: "10", weight: "50" },
      { reps: "10", weight: "50" },
    ]);
  });

  it("format historique sans charge : même convention que « Refaire en live »", () => {
    expect(setsFromHistoryExercise({ name: "X", sets: 12, reps: 20, weight: null })).toEqual([
      { reps: "12", weight: "20" },
    ]);
  });

  it("rien d'exploitable : aucune série (on n'invente rien)", () => {
    expect(setsFromHistoryExercise({ name: "X", exercise_sets: [] })).toEqual([]);
    expect(
      setsFromHistoryExercise({ name: "X", exercise_sets: [{ reps: 0, weight: 50 }] }),
    ).toEqual([]);
  });
});

describe("lastSameNamedWorkout", () => {
  it("la plus récente du même nom (casse, espaces), strictement AVANT la date visée", () => {
    const older = workout("2026-10-19", "dos ", DOS_26.exercises);
    const sameDay = workout(TODAY, "Dos", DOS_26.exercises);
    expect(lastSameNamedWorkout([older, DOS_26, sameDay], "Dos", TODAY)?.id).toBe(DOS_26.id);
  });

  it("ignore les séances actives, d'une autre discipline, ou sans aucune série", () => {
    const active = workout("2026-10-28", "Dos", DOS_26.exercises, { status: "active" });
    const run = workout("2026-10-28", "Dos", DOS_26.exercises, { discipline: "course" });
    const shell = workout("2026-10-28", "Dos", [{ name: "Vide", exercise_sets: [] }]);
    expect(lastSameNamedWorkout([active, run, shell, DOS_26], "Dos", TODAY)?.id).toBe(DOS_26.id);
    expect(lastSameNamedWorkout([active, run, shell], "Dos", TODAY)).toBeNull();
  });
});

describe("buildDoneSessionDraft — pré-remplir, jamais inventer", () => {
  const target = { date: TODAY, name: "Dos", templateId: "tpl-dos" };

  it("priorité à la dernière séance du même nom : ses vraies séries, dans l'ordre", () => {
    const draft = buildDoneSessionDraft({ target, workouts: [DOS_26], template: TEMPLATE });
    expect(draft?.source).toEqual({
      kind: "last-session",
      workoutId: DOS_26.id,
      date: "2026-10-26",
    });
    expect(draft?.exercises.map((e) => [e.name, e.sets.length, e.included])).toEqual([
      ["Tirage poitrine", 3, true],
      ["Rowing barre", 2, true],
    ]);
    expect(draft?.exercises[0].exerciseReferenceId).toBe("ref-tirage");
    expect(draft?.date).toBe(TODAY);
  });

  it("sans historique : les valeurs par défaut de la séance sauvegardée, dans SON ordre", () => {
    const draft = buildDoneSessionDraft({ target, workouts: [], template: TEMPLATE });
    expect(draft?.source).toEqual({ kind: "template", templateId: "tpl-dos" });
    expect(draft?.exercises.map((e) => e.name)).toEqual(["Tirage poitrine", "Rowing barre"]);
    // Charge inconnue dans le modèle : champ VIDE, jamais 0 inventé.
    expect(draft?.exercises[0].sets).toEqual(
      Array.from({ length: 4 }, () => ({ reps: "12", weight: "" })),
    );
  });

  it("un modèle d'une AUTRE séance n'est jamais utilisé", () => {
    expect(
      buildDoneSessionDraft({
        target: { ...target, templateId: "autre" },
        workouts: [],
        template: TEMPLATE,
      }),
    ).toBeNull();
  });

  it("ni historique ni modèle : `null` — pas de séance imaginaire", () => {
    expect(buildDoneSessionDraft({ target, workouts: [], template: null })).toBeNull();
    expect(
      buildDoneSessionDraft({
        target: { ...target, name: "  " },
        workouts: [DOS_26],
        template: null,
      }),
    ).toBeNull();
  });

  it("deux lignes du même exercice : regroupées (même identité)", () => {
    const twice = workout("2026-10-27", "Dos", [
      { name: "Rowing barre", position: 0, exercise_sets: sets([10, 50]) },
      { name: "rowing barre ", position: 1, exercise_sets: sets([8, 55]) },
    ]);
    const draft = buildDoneSessionDraft({ target, workouts: [twice], template: null });
    expect(draft?.exercises).toHaveLength(1);
    expect(draft?.exercises[0].sets).toHaveLength(2);
  });
});

describe("canPrefillDoneSession — la carte ne propose le bouton que si la feuille saura se remplir", () => {
  const target = { date: TODAY, name: "Dos", templateId: "tpl-dos" };
  it("modèle connu avec au moins un exercice, ou séance du même nom dans l'historique", () => {
    expect(canPrefillDoneSession({ target, workouts: [], templateExerciseCount: 2 })).toBe(true);
    expect(canPrefillDoneSession({ target, workouts: [DOS_26], templateExerciseCount: null })).toBe(
      true,
    );
  });
  it("modèle vide ou pas chargé, et aucun historique : non", () => {
    expect(canPrefillDoneSession({ target, workouts: [], templateExerciseCount: 0 })).toBe(false);
    expect(canPrefillDoneSession({ target, workouts: [], templateExerciseCount: null })).toBe(
      false,
    );
  });
});

describe("defaultDoneSessionDuration — une proposition tirée d'un fait", () => {
  it("la dernière durée RÉELLE de la séance du même nom, arrondie à 5 min", () => {
    const live = workout("2026-10-22", "Dos", [], { duration_minutes: 52 });
    const express = workout("2026-10-26", "Dos", [], { duration_minutes: 1 });
    expect(defaultDoneSessionDuration([express, live], "Dos", TODAY)).toEqual({
      minutes: 50,
      from: { kind: "same-name", date: "2026-10-22" },
    });
  });

  it("à défaut : la dernière séance tout court ; jamais une durée invraisemblable", () => {
    const pecs = workout("2026-10-28", "Pectoraux", [], { duration_minutes: 39 });
    const stuck = workout("2026-10-27", "Dos", [], { duration_minutes: 600 });
    expect(defaultDoneSessionDuration([pecs, stuck], "Dos", TODAY)).toEqual({
      minutes: 40,
      from: { kind: "last-session", date: "2026-10-28" },
    });
  });

  it("aucune durée réelle connue : `null` (le joueur la saisit)", () => {
    expect(defaultDoneSessionDuration([DOS_26], "Dos", TODAY)).toBeNull();
  });
});

describe("parseDoneSet / parseDoneDuration — rien d'inexploitable n'atteint la base", () => {
  it("ligne vide ignorée ; virgule française acceptée ; charge 0 = poids du corps", () => {
    expect(parseDoneSet({ reps: "", weight: "" })).toEqual({ kind: "empty" });
    expect(parseDoneSet({ reps: "10", weight: "62,5" })).toEqual({
      kind: "set",
      reps: 10,
      weight: 62.5,
    });
    expect(parseDoneSet({ reps: "12", weight: "0" })).toEqual({ kind: "set", reps: 12, weight: 0 });
  });

  it("répétitions sans charge : à compléter — la charge ne se devine jamais", () => {
    expect(parseDoneSet({ reps: "10", weight: "" })).toEqual({ kind: "missing-weight" });
  });

  it("charge sans répétitions, 0 répétition, texte, négatif : à corriger", () => {
    expect(parseDoneSet({ reps: "", weight: "60" }).kind).toBe("invalid");
    expect(parseDoneSet({ reps: "0", weight: "60" }).kind).toBe("invalid");
    expect(parseDoneSet({ reps: "dix", weight: "60" }).kind).toBe("invalid");
    expect(parseDoneSet({ reps: "10", weight: "-5" }).kind).toBe("invalid");
    expect(parseDoneSet({ reps: "1e3", weight: "60" }).kind).toBe("invalid");
  });

  it("durée : minutes entières entre 1 et 240", () => {
    expect(parseDoneDuration("45")).toBe(45);
    expect(parseDoneDuration(" 90 ")).toBe(90);
    for (const bad of ["", "0", "241", "4.5", "abc", "-10"])
      expect(parseDoneDuration(bad)).toBeNull();
  });
});

describe("validateDoneSession", () => {
  const draft = (): DoneSessionDraft =>
    buildDoneSessionDraft({
      target: { date: TODAY, name: "Dos", templateId: null },
      workouts: [DOS_26],
      template: null,
    })!;

  it("brouillon intact : prêt à écrire, avec les totaux de la carte récap", () => {
    const result = validateDoneSession(draft(), "50", TODAY);
    expect(result).toEqual({
      ok: true,
      totalSets: 5,
      volumeKg: 10 * 60 * 2 + 8 * 65 + 10 * 50 * 2,
      payload: {
        name: "Dos",
        date: TODAY,
        durationMinutes: 50,
        exercises: [
          {
            name: "Tirage poitrine",
            imagePath: null,
            exerciseReferenceId: "ref-tirage",
            sets: [
              { reps: 10, weight: 60 },
              { reps: 10, weight: 60 },
              { reps: 8, weight: 65 },
            ],
          },
          {
            name: "Rowing barre",
            imagePath: null,
            exerciseReferenceId: null,
            sets: [
              { reps: 10, weight: 50 },
              { reps: 10, weight: 50 },
            ],
          },
        ],
      },
    });
  });

  it("un exercice décoché n'est pas enregistré ; une ligne vidée non plus", () => {
    const d = draft();
    d.exercises[1].included = false;
    d.exercises[0].sets[2] = { reps: "", weight: "" };
    const result = validateDoneSession(d, "50", TODAY);
    expect(result.ok && result.payload.exercises.map((e) => [e.name, e.sets.length])).toEqual([
      ["Tirage poitrine", 2],
    ]);
  });

  it("refus explicites, chacun avec sa phrase", () => {
    const none = draft();
    none.exercises.forEach((e) => (e.included = false));
    const noSets = validateDoneSession(none, "50", TODAY);
    expect(noSets).toEqual({ ok: false, reason: "no-sets" });

    const bad = draft();
    bad.exercises[1].sets[0] = { reps: "abc", weight: "50" };
    const invalid = validateDoneSession(bad, "50", TODAY);
    expect(invalid).toEqual({ ok: false, reason: "invalid-set", exerciseName: "Rowing barre" });

    const noLoad = draft();
    noLoad.exercises[0].sets[0] = { reps: "10", weight: "" };
    expect(validateDoneSession(noLoad, "50", TODAY)).toMatchObject({ reason: "missing-weight" });

    expect(validateDoneSession(draft(), "", TODAY)).toEqual({ ok: false, reason: "duration" });
    expect(validateDoneSession({ ...draft(), date: "2026-10-30" }, "50", TODAY)).toEqual({
      ok: false,
      reason: "future-date",
    });

    for (const refusal of [noSets, invalid]) {
      if (!refusal.ok) expect(describeDoneSessionError(refusal)).toMatch(/\S/);
    }
    expect(
      describeDoneSessionError({ ok: false, reason: "invalid-set", exerciseName: "Rowing barre" }),
    ).toBe("Une série de « Rowing barre » est à corriger.");
  });
});

describe("describeDoneExercise", () => {
  it("séries identiques : « 3 × 10 · 60 kg » ; sinon « 3 séries · jusqu'à 65 kg »", () => {
    expect(
      describeDoneExercise(Array.from({ length: 3 }, () => ({ reps: "10", weight: "60" }))),
    ).toBe("3 × 10 · 60 kg");
    expect(
      describeDoneExercise([
        { reps: "10", weight: "60" },
        { reps: "8", weight: "65" },
        { reps: "", weight: "" },
      ]),
    ).toBe("2 séries · jusqu'à 65 kg");
  });

  it("format français et poids du corps", () => {
    expect(describeDoneExercise([{ reps: "8", weight: "62.5" }])).toBe("1 × 8 · 62,5 kg");
    expect(describeDoneExercise([{ reps: "12", weight: "0" }])).toBe("1 × 12 · poids du corps");
    expect(describeDoneExercise([{ reps: "", weight: "" }])).toBe("Aucune série");
  });
});
