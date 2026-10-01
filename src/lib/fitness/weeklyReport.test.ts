import { describe, expect, it } from "vitest";
import { addDaysYMD } from "@/lib/dates";
import {
  buildWeeklyReport,
  describeMinutes,
  isoWeekNumber,
  listWeeklyReports,
  planWasInForce,
  weekEndOf,
  weekLabel,
  weekRangeLabel,
  weekReportTeaser,
  weekStartOf,
  type ReportPlanRow,
  type ReportWorkout,
} from "./weeklyReport";

// Aujourd'hui : jeudi 01/10/2026. Semaine en cours : lundi 28/09. Précédente : lundi 21/09.
const TODAY = "2026-10-01";
const CURRENT = "2026-09-28";
/** Lundi de la semaine située `weeksBefore` semaines avant la semaine en cours. */
const monday = (weeksBefore: number) => addDaysYMD(CURRENT, -7 * weeksBefore);
/** Un jour de cette semaine-là (0 = lundi … 6 = dimanche). */
const day = (weeksBefore: number, offset: number) => addDaysYMD(monday(weeksBefore), offset);

type SetLike = { reps: number | null; weight: number | null };

let seq = 0;
function session(
  date: string,
  sets: SetLike[],
  extra: Partial<ReportWorkout> = {},
  exerciseName = `Exo ${(seq += 1)}`,
): ReportWorkout {
  seq += 1;
  return {
    id: `w-${seq}`,
    date,
    name: "Séance",
    status: "completed",
    discipline: "muscu",
    created_at: `${date}T18:00:00.000Z`,
    duration_minutes: null,
    exercises: [
      {
        id: `e-${seq}`,
        name: exerciseName,
        weight: null,
        sets: null,
        reps: null,
        exercise_sets: sets.map((s, i) => ({
          id: `s-${seq}-${i}`,
          set_number: i + 1,
          reps: s.reps,
          weight: s.weight,
          completed: true,
        })),
      },
    ],
    ...extra,
  };
}

/** Une séance de `volumeKg` kg exactement (une série de 1 répétition). */
const withVolume = (date: string, volumeKg: number, extra: Partial<ReportWorkout> = {}) =>
  session(date, [{ reps: 1, weight: volumeKg }], extra);

const iso = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

function planRow(dayOfWeek: number, updatedAt: string, kind = "muscles"): ReportPlanRow {
  return {
    id: `p-${dayOfWeek}-${(seq += 1)}`,
    day_of_week: dayOfWeek,
    kind,
    muscle_groups: kind === "muscles" ? ["dos"] : [],
    template_id: null,
    updated_at: updatedAt,
  };
}

const report = (weekStart: string, workouts: ReportWorkout[], planRows: ReportPlanRow[] = []) =>
  buildWeeklyReport({ weekStart, workouts, planRows });

describe("dates de la semaine", () => {
  it("weekStartOf : toujours le lundi, dimanche inclus", () => {
    expect(weekStartOf("2026-10-01")).toBe("2026-09-28");
    expect(weekStartOf("2026-09-28")).toBe("2026-09-28");
    expect(weekStartOf("2026-09-27")).toBe("2026-09-21"); // dimanche → lundi d'avant
  });

  it("weekEndOf : le dimanche", () => {
    expect(weekEndOf("2026-09-21")).toBe("2026-09-27");
  });

  it("isoWeekNumber : semaines ISO, y compris autour du nouvel an", () => {
    expect(isoWeekNumber("2026-01-05")).toBe(2);
    expect(isoWeekNumber("2026-09-21")).toBe(39);
    expect(isoWeekNumber("2026-09-28")).toBe(40);
    expect(isoWeekNumber("2025-12-29")).toBe(1); // le jeudi 1er janvier 2026 décide
    expect(isoWeekNumber("2020-12-28")).toBe(53); // 2020 a 53 semaines
    expect(isoWeekNumber("2027-01-04")).toBe(1);
  });

  it("libellés : une semaine dans un mois, puis à cheval sur deux", () => {
    expect(weekRangeLabel("2026-09-21")).toBe("21 → 27 septembre");
    expect(weekRangeLabel("2026-09-28")).toBe("28 septembre → 4 octobre");
    expect(weekLabel("2026-09-21")).toBe("Semaine 39 · 21 → 27 septembre");
  });

  it("describeMinutes : « 45 min », « 4 h 10 », « 2 h », « 2 h 05 »", () => {
    expect(describeMinutes(45)).toBe("45 min");
    expect(describeMinutes(250)).toBe("4 h 10");
    expect(describeMinutes(120)).toBe("2 h");
    expect(describeMinutes(125)).toBe("2 h 05");
  });
});

describe("planWasInForce — le plan actuel est-il celui de cette semaine ?", () => {
  const WEEK = "2026-09-21";

  it("sans plan : non", () => {
    expect(planWasInForce([], WEEK)).toBe(false);
  });

  it("toutes les lignes modifiées AVANT le lundi : oui", () => {
    const rows = [planRow(1, iso(2026, 9, 10)), planRow(3, iso(2026, 9, 20, 23))];
    expect(planWasInForce(rows, WEEK)).toBe(true);
  });

  it("une ligne modifiée le lundi même, pendant la semaine ou après : non", () => {
    expect(planWasInForce([planRow(1, iso(2026, 9, 21, 8))], WEEK)).toBe(false);
    expect(planWasInForce([planRow(1, iso(2026, 9, 24))], WEEK)).toBe(false);
    expect(planWasInForce([planRow(1, iso(2026, 9, 10)), planRow(2, iso(2026, 9, 30))], WEEK)).toBe(
      false,
    );
  });

  it("un horodatage illisible n'est jamais « avant »", () => {
    expect(planWasInForce([planRow(1, "pas une date")], WEEK)).toBe(false);
  });
});

describe("buildWeeklyReport — une semaine sans séance n'a pas de rapport", () => {
  it("aucune séance : null", () => {
    expect(report(monday(1), [])).toBeNull();
    expect(report(monday(1), [withVolume(day(2, 1), 1000)])).toBeNull(); // une autre semaine
  });

  it("séance active, annulée ou d'une autre discipline : ne compte pas", () => {
    const workouts = [
      withVolume(day(1, 0), 1000, { status: "active" }),
      withVolume(day(1, 1), 1000, { status: "cancelled" }),
      withVolume(day(1, 2), 1000, { discipline: "course" }),
    ];
    expect(report(monday(1), workouts)).toBeNull();
  });
});

describe("buildWeeklyReport — les chiffres", () => {
  const workouts = [
    session(
      day(1, 0),
      [
        { reps: 10, weight: 100 },
        { reps: 10, weight: 100 },
      ],
      { duration_minutes: 60 },
    ),
    session(day(1, 2), [{ reps: 5, weight: 200 }], { duration_minutes: 70 }),
    session(day(1, 6), [{ reps: 8, weight: 50 }]),
  ];

  it("séances, séries, volume et temps de la semaine, au même compte que le récap de fin de séance", () => {
    const r = report(monday(1), workouts)!;
    expect(r).toMatchObject({
      weekStart: "2026-09-21",
      weekEnd: "2026-09-27",
      weekNumber: 39,
      label: "Semaine 39 · 21 → 27 septembre",
      sessions: 3,
      sets: 4,
      volumeKg: 2000 + 1000 + 400,
      minutes: 130, // la séance sans durée connue n'ajoute rien, et ne fait pas « 0 »
    });
  });

  it("aucune durée renseignée : le temps est inconnu (null), jamais « 0 min »", () => {
    expect(report(monday(1), [withVolume(day(1, 1), 500)])!.minutes).toBeNull();
    expect(
      report(monday(1), [withVolume(day(1, 1), 500, { duration_minutes: 0 })])!.minutes,
    ).toBeNull();
  });

  it("une séance en dehors de la semaine (la veille, le lendemain) n'est pas comptée", () => {
    const r = report(monday(1), [
      withVolume(day(2, 6), 9999), // dimanche d'avant
      withVolume(day(1, 3), 100),
      withVolume(day(0, 0), 9999), // lundi suivant
    ])!;
    expect(r.sessions).toBe(1);
    expect(r.volumeKg).toBe(100);
  });
});

describe("buildWeeklyReport — la comparaison à la semaine précédente", () => {
  it("+35 % : le volume est comparé, en pourcentage entier arrondi", () => {
    const r = report(monday(1), [withVolume(day(2, 1), 10000), withVolume(day(1, 1), 13500)])!;
    expect(r).toMatchObject({ previousVolumeKg: 10000, volumeDeltaPercent: 35 });
  });

  it("le pourcentage est ARRONDI, pas tronqué (+49,5 % → +50 %)", () => {
    const r = report(monday(1), [withVolume(day(2, 1), 2000), withVolume(day(1, 1), 2990)])!;
    expect(r.volumeDeltaPercent).toBe(50);
  });

  it("une baisse est un fait aussi (négative) — la phrase, elle, n'en parle pas", () => {
    const r = report(monday(1), [withVolume(day(2, 1), 10000), withVolume(day(1, 1), 8000)])!;
    expect(r.volumeDeltaPercent).toBe(-20);
    expect(r.sentence).toBeNull();
  });

  it("semaine précédente sans séance : pas de comparaison inventée", () => {
    const r = report(monday(1), [withVolume(day(3, 1), 10000), withVolume(day(1, 1), 8000)])!;
    expect(r).toMatchObject({ previousVolumeKg: null, volumeDeltaPercent: null });
  });

  it("semaine précédente sans aucune charge : division impossible, donc rien", () => {
    const bodyweight = session(day(2, 1), [{ reps: 20, weight: null }]);
    const r = report(monday(1), [bodyweight, withVolume(day(1, 1), 8000)])!;
    expect(r).toMatchObject({ previousVolumeKg: null, volumeDeltaPercent: null });
  });

  it("cette semaine sans charge : pas de variation", () => {
    const bodyweight = session(day(1, 1), [{ reps: 20, weight: null }]);
    const r = report(monday(1), [withVolume(day(2, 1), 10000), bodyweight])!;
    expect(r.volumeDeltaPercent).toBeNull();
  });
});

describe("buildWeeklyReport — les records battus", () => {
  const SQUAT = "Squat";

  it("un record = une charge max strictement supérieure au meilleur passé, comme dans la Chronique", () => {
    const r = report(monday(1), [
      session(day(3, 1), [{ reps: 5, weight: 100 }], {}, SQUAT),
      session(day(1, 2), [{ reps: 5, weight: 110 }], {}, SQUAT),
    ])!;
    expect(r.records).toEqual([
      { key: expect.any(String), name: SQUAT, weight: 110, previousWeight: 100 },
    ]);
  });

  it("un tout premier exercice n'est PAS un record", () => {
    const r = report(monday(1), [session(day(1, 2), [{ reps: 5, weight: 110 }], {}, SQUAT)])!;
    expect(r.records).toEqual([]);
  });

  it("égaler le meilleur passé n'est pas le battre", () => {
    const r = report(monday(1), [
      session(day(3, 1), [{ reps: 5, weight: 100 }], {}, SQUAT),
      session(day(1, 2), [{ reps: 5, weight: 100 }], {}, SQUAT),
    ])!;
    expect(r.records).toEqual([]);
  });

  it("le même exercice amélioré deux fois dans la semaine : UN record, le plus lourd", () => {
    const r = report(monday(1), [
      session(day(3, 1), [{ reps: 5, weight: 100 }], {}, SQUAT),
      session(day(1, 0), [{ reps: 5, weight: 105 }], {}, SQUAT),
      session(day(1, 4), [{ reps: 5, weight: 110 }], {}, SQUAT),
    ])!;
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({ weight: 110, previousWeight: 105 });
  });

  it("un record d'une autre semaine n'est pas compté dans celle-ci", () => {
    const workouts = [
      session(day(3, 1), [{ reps: 5, weight: 100 }], {}, SQUAT),
      session(day(2, 2), [{ reps: 5, weight: 110 }], {}, SQUAT), // record, semaine d'avant
      session(day(1, 1), [{ reps: 5, weight: 60 }], {}, "Rowing"),
    ];
    expect(report(monday(1), workouts)!.records).toEqual([]);
    expect(report(monday(2), workouts)!.records).toHaveLength(1);
  });
});

describe("buildWeeklyReport — le titre", () => {
  it("première semaine de l'historique", () => {
    expect(report(monday(1), [withVolume(day(1, 1), 5000)])!.headline).toBe("Ta première semaine");
  });

  it("meilleure semaine de toute l'histoire", () => {
    const r = report(monday(1), [withVolume(day(3, 1), 5000), withVolume(day(1, 1), 7000)])!;
    expect(r.headline).toBe("Ta meilleure semaine");
  });

  it("« depuis juin » : la dernière semaine aussi forte date d'au moins 4 semaines", () => {
    // Semaine du 22/06/2026 (lundi), puis des semaines plus faibles.
    const june = "2026-06-22";
    const r = report(monday(1), [
      withVolume(june, 9000),
      withVolume(day(3, 1), 3000),
      withVolume(day(2, 1), 4000),
      withVolume(day(1, 1), 6000),
    ])!;
    expect(r.headline).toBe("Ta meilleure semaine depuis juin");
  });

  it("une semaine plus forte il y a moins de 4 semaines : titre neutre, on ne compare pas à la dernière", () => {
    const r = report(monday(1), [withVolume(day(3, 1), 9000), withVolume(day(1, 1), 6000)])!;
    expect(r.headline).toBe("Ta semaine");
  });

  it("l'année est précisée quand la semaine de référence est d'une autre année", () => {
    const r = report(monday(1), [withVolume("2025-09-22", 9000), withVolume(day(1, 1), 6000)])!;
    expect(r.headline).toBe("Ta meilleure semaine depuis septembre 2025");
  });

  it("une semaine sans charge (poids de corps) : titre neutre, jamais « meilleure »", () => {
    const bodyweight = session(day(1, 1), [{ reps: 20, weight: null }]);
    expect(report(monday(1), [withVolume(day(3, 1), 5000), bodyweight])!.headline).toBe(
      "Ta semaine",
    );
  });
});

describe("buildWeeklyReport — la comparaison au plan, seulement quand elle est vérifiable", () => {
  const before = iso(2026, 9, 1); // plan posé bien avant la semaine du 21/09
  const FIVE_DAYS = [1, 2, 3, 4, 5].map((d) => planRow(d, before));

  const fiveSessions = [0, 1, 2, 3, 4].map((offset) => withVolume(day(1, offset), 1000));

  it("5 séances sur 5 prévues", () => {
    const r = report(monday(1), fiveSessions, FIVE_DAYS)!;
    expect(r).toMatchObject({ sessions: 5, plannedSessions: 5, plannedDone: 5 });
  });

  it("un jour prévu non tenu : 4 sur 5", () => {
    const r = report(monday(1), fiveSessions.slice(0, 4), FIVE_DAYS)!;
    expect(r).toMatchObject({ plannedSessions: 5, plannedDone: 4 });
  });

  it("dimanche prévu et non tenu : bien compté comme non tenu (la semaine est finie)", () => {
    const plan = [...[1, 2, 3, 4, 5].map((d) => planRow(d, before)), planRow(7, before)];
    const r = report(monday(1), fiveSessions, plan)!;
    expect(r).toMatchObject({ plannedSessions: 6, plannedDone: 5 });
  });

  it("une séance sur un jour NON prévu est un bonus : elle compte dans les séances, pas dans le rythme", () => {
    const plan = [1, 3].map((d) => planRow(d, before));
    const workouts = [withVolume(day(1, 0), 1000), withVolume(day(1, 1), 1000)]; // lundi (prévu), mardi (libre)
    const r = report(monday(1), workouts, plan)!;
    expect(r).toMatchObject({ sessions: 2, plannedSessions: 2, plannedDone: 1 });
  });

  it("plan modifié pendant ou après la semaine : aucune comparaison", () => {
    const edited = [...FIVE_DAYS.slice(0, 4), planRow(5, iso(2026, 9, 24))];
    const r = report(monday(1), fiveSessions, edited)!;
    expect(r).toMatchObject({ plannedSessions: null, plannedDone: null });
  });

  it("sans plan, ou plan de jours de repos seuls : aucune comparaison", () => {
    expect(report(monday(1), fiveSessions, [])!.plannedSessions).toBeNull();
    const rest = [planRow(1, before, "rest"), planRow(2, before, "rest")];
    expect(report(monday(1), fiveSessions, rest)!.plannedSessions).toBeNull();
  });
});

describe("buildWeeklyReport — la phrase : des faits, jamais une félicitation générique", () => {
  const before = iso(2026, 9, 1);
  const plan = [1, 2].map((d) => planRow(d, before));
  const twoSessions = (extra: ReportWorkout[] = []) => [
    withVolume(day(1, 0), 1000),
    withVolume(day(1, 1), 1000),
    ...extra,
  ];
  const squat = (date: string, kg: number) => session(date, [{ reps: 5, weight: kg }], {}, "Squat");

  it("rythme tenu ET records", () => {
    const r = report(
      monday(1),
      [squat(day(3, 1), 100), squat(day(1, 0), 110), withVolume(day(1, 1), 1000)],
      plan,
    )!;
    expect(r.sentence).toBe("Rythme tenu : 2 séances sur 2, et 1 record battu.");
  });

  it("rythme tenu seul", () => {
    expect(report(monday(1), twoSessions(), plan)!.sentence).toBe("Rythme tenu : 2 séances sur 2.");
  });

  it("records seuls : au pluriel, première lettre en capitale", () => {
    const workouts = [
      squat(day(3, 1), 100),
      session(day(3, 2), [{ reps: 5, weight: 50 }], {}, "Rowing"),
      squat(day(1, 0), 110),
      session(day(1, 1), [{ reps: 5, weight: 60 }], {}, "Rowing"),
    ];
    expect(report(monday(1), workouts)!.sentence).toBe("2 records battus cette semaine.");
  });

  it("un seul record : singulier", () => {
    expect(report(monday(1), [squat(day(3, 1), 100), squat(day(1, 0), 110)])!.sentence).toBe(
      "1 record battu cette semaine.",
    );
  });

  it("volume en nette hausse seul", () => {
    const r = report(monday(1), [withVolume(day(2, 1), 10000), withVolume(day(1, 1), 13500)])!;
    expect(r.sentence).toBe("Ton volume progresse de 35 % sur la semaine précédente.");
  });

  it("hausse trop faible (4 %) : rien à dire", () => {
    const r = report(monday(1), [withVolume(day(2, 1), 10000), withVolume(day(1, 1), 10400)])!;
    expect(r.volumeDeltaPercent).toBe(4);
    expect(r.sentence).toBeNull();
  });

  it("rythme non tenu et aucun autre fait : pas de phrase — on ne culpabilise pas", () => {
    const r = report(monday(1), [withVolume(day(1, 0), 1000)], plan)!;
    expect(r).toMatchObject({ plannedSessions: 2, plannedDone: 1, sentence: null });
  });

  it("jamais de félicitation sans fait : une semaine ordinaire n'a pas de phrase", () => {
    expect(report(monday(1), [withVolume(day(1, 2), 1000)])!.sentence).toBeNull();
  });
});

describe("listWeeklyReports — les semaines passées", () => {
  it("de la plus récente à la plus ancienne, sans la semaine en cours ni les semaines vides", () => {
    const workouts = [
      withVolume(day(3, 1), 3000),
      withVolume(day(1, 1), 5000),
      withVolume(day(0, 0), 7000), // semaine en cours : pas encore un bilan
    ];
    const list = listWeeklyReports({ workouts, planRows: [], todayDate: TODAY });
    expect(list.map((w) => w.weekStart)).toEqual([monday(1), monday(3)]);
  });

  it("chaque ligne porte ses chiffres", () => {
    const list = listWeeklyReports({
      workouts: [
        session(day(2, 1), [{ reps: 5, weight: 100 }], {}, "Squat"),
        session(day(1, 1), [{ reps: 5, weight: 110 }], {}, "Squat"),
        withVolume(day(1, 3), 1000),
      ],
      planRows: [],
      todayDate: TODAY,
    });
    expect(list[0]).toEqual({
      weekStart: monday(1),
      label: "Semaine 39 · 21 → 27 septembre",
      sessions: 2,
      volumeKg: 550 + 1000,
      recordCount: 1,
    });
    expect(list[1]).toMatchObject({ weekStart: monday(2), sessions: 1, recordCount: 0 });
  });

  it("aucune séance : liste vide", () => {
    expect(listWeeklyReports({ workouts: [], planRows: [], todayDate: TODAY })).toEqual([]);
  });

  it("des séances non comptées (active, course) ne créent pas de semaine", () => {
    const workouts = [
      withVolume(day(1, 1), 1000, { status: "active" }),
      withVolume(day(2, 1), 1000, { discipline: "course" }),
    ];
    expect(listWeeklyReports({ workouts, planRows: [], todayDate: TODAY })).toEqual([]);
  });
});

describe("weekReportTeaser — « Ta semaine est prête » : lundi et mardi seulement", () => {
  // Lundi 05/10/2026 : la semaine qui vient de finir est celle du lundi 28/09 (`day(0, …)`).
  const MONDAY = "2026-10-05";
  const finishedWeek = [
    withVolume(day(0, 0), 1000),
    withVolume(day(0, 2), 1000),
    withVolume(day(0, 4), 1000),
  ];
  const at = (todayDate: string, workouts: ReportWorkout[] = finishedWeek) =>
    weekReportTeaser({ workouts, planRows: [], todayDate });

  it("lundi et mardi : le bandeau de la semaine qui vient de finir", () => {
    expect(at(MONDAY)).toEqual({
      weekStart: "2026-09-28",
      title: "Ta semaine est prête",
      subtitle: "Semaine 40 · 3 séances",
    });
    expect(at("2026-10-06")?.weekStart).toBe("2026-09-28");
  });

  it("le reste de la semaine : rien (le bandeau dure 48 h)", () => {
    for (const date of ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]) {
      expect(at(date)).toBeNull();
    }
  });

  it("une seule séance : singulier", () => {
    expect(at(MONDAY, [withVolume(day(0, 1), 1000)])?.subtitle).toBe("Semaine 40 · 1 séance");
  });

  it("semaine finie sans séance : ni célébration ni reproche (même avec des séances plus anciennes)", () => {
    expect(at(MONDAY, [withVolume(day(2, 1), 1000)])).toBeNull();
    expect(at(MONDAY, [])).toBeNull();
  });

  it("une séance de la semaine EN COURS ne fait pas apparaître un bandeau pour la précédente vide", () => {
    expect(at(MONDAY, [withVolume(MONDAY, 1000)])).toBeNull();
  });

  it("les records sont annoncés, au singulier comme au pluriel", () => {
    const squat = (date: string, kg: number) =>
      session(date, [{ reps: 5, weight: kg }], {}, "Squat");
    const rowing = (date: string, kg: number) =>
      session(date, [{ reps: 5, weight: kg }], {}, "Rowing");
    const one = [squat(day(1, 1), 100), squat(day(0, 1), 110)];
    expect(at(MONDAY, one)?.subtitle).toBe("Semaine 40 · 1 séance, 1 record");
    const two = [...one, rowing(day(1, 2), 50), rowing(day(0, 3), 60)];
    expect(at(MONDAY, two)?.subtitle).toBe("Semaine 40 · 2 séances, 2 records");
  });
});
