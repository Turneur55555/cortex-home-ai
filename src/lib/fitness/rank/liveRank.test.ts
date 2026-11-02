import { describe, expect, it } from "vitest";
import { DEFAULT_RANK_ENGINE_CONFIG } from "./config";
import {
  NEXT_RANK_WEIGHT_STEP_KG,
  describeNextRank,
  detectSessionHighlight,
  evaluateLiveRank,
  formatNextRankTarget,
  rankHistoryByExercise,
  tierLabel,
  type LiveRankInput,
} from "./liveRank";
import type { SessionInput } from "./types";

const NOW = new Date("2026-10-30T09:00:00");
const TODAY = "2026-10-30";
const BW = 80;

/** Chest press à 40 kg × 10 (2 séries), une séance par semaine : grade ~11, sans confirmation. */
const weekly = (dates: string[], sets: SessionInput["sets"]): SessionInput[] =>
  dates.map((date, i) => ({ workoutId: `w${i}`, date, sets }));
const CHEST_HISTORY = weekly(
  ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"],
  [
    { reps: 10, weight: 40 },
    { reps: 10, weight: 40 },
  ],
);

function input(overrides: Partial<LiveRankInput> = {}): LiveRankInput {
  return {
    config: DEFAULT_RANK_ENGINE_CONFIG,
    exerciseName: "Chest press",
    history: CHEST_HISTORY,
    currentSets: [],
    bodyweightKg: BW,
    today: TODAY,
    now: NOW,
    ...overrides,
  };
}

describe("evaluateLiveRank — le rang avec les séries validées du jour", () => {
  it("aucune série validée aujourd'hui : rang du jour = rang d'avant, pas de promotion", () => {
    const r = evaluateLiveRank(input());
    expect(r.beforeTierIndex).not.toBeNull();
    expect(r.tierIndex).toBe(r.beforeTierIndex);
    expect(r.promoted).toBe(false);
  });

  it("la cible du grade suivant le fait VRAIMENT franchir, et c'est la plus petite", () => {
    const current = [{ reps: 10, weight: 40 }];
    const r = evaluateLiveRank(input({ currentSets: current }));
    expect(r.next?.kind).toBe("set");
    if (r.next?.kind !== "set") return;
    const next = r.next;
    expect(next.tierIndex).toBe(r.tierIndex + 1);
    expect(next.reps).toBe(10);
    expect(next.weight).toBeGreaterThan(40);

    // Faire la série cible aujourd'hui → grade suivant atteint (simulation = moteur réel).
    const reached = evaluateLiveRank(
      input({ currentSets: [...current, { reps: 10, weight: next.weight }] }),
    );
    expect(reached.tierIndex).toBeGreaterThanOrEqual(next.tierIndex);
    expect(reached.promoted).toBe(true);

    // Un cran en dessous ne suffit pas : c'est bien la plus petite.
    const below = evaluateLiveRank(
      input({
        currentSets: [
          ...current,
          { reps: 10, weight: (next.weight ?? 0) - NEXT_RANK_WEIGHT_STEP_KG },
        ],
      }),
    );
    expect(below.tierIndex).toBeLessThan(next.tierIndex);
  });

  it("une grosse série validée aujourd'hui fait monter le grade : promotion détectée", () => {
    const r = evaluateLiveRank(input({ currentSets: [{ reps: 10, weight: 50 }] }));
    expect(r.tierIndex).toBeGreaterThan(r.beforeTierIndex ?? 99);
    expect(r.promoted).toBe(true);
  });

  it("première fois sur l'exercice : pas de « rang d'avant », jamais de promotion", () => {
    const r = evaluateLiveRank(input({ history: [], currentSets: [{ reps: 10, weight: 40 }] }));
    expect(r.beforeTierIndex).toBeNull();
    expect(r.promoted).toBe(false);
    expect(r.next?.kind).toBe("set");
  });

  it("aucune référence (ni historique ni série du jour) : aucune cible inventée", () => {
    expect(evaluateLiveRank(input({ history: [] })).next).toBeNull();
  });

  it("séries non exploitables (0 répétition) ignorées : rien ne change", () => {
    const r = evaluateLiveRank(input({ currentSets: [{ reps: 0, weight: 200 }] }));
    expect(r.tierIndex).toBe(r.beforeTierIndex);
  });

  it("poids du corps (tractions) : la cible est un nombre de répétitions, sans charge", () => {
    const history = weekly(["2026-10-02", "2026-10-09", "2026-10-26"], [{ reps: 8, weight: null }]);
    const r = evaluateLiveRank(input({ exerciseName: "Traction prise neutre", history }));
    expect(r.next).toMatchObject({ kind: "set", weight: null });
    if (r.next?.kind === "set") expect(r.next.reps).toBeGreaterThan(8);
  });
});

describe("evaluateLiveRank — Olympien et Titan se confirment dans le temps", () => {
  // 70 kg × 10 à 80 kg de poids de corps : niveau Olympien dès la séance, mais confirmation requise.
  const STRONG = [
    { reps: 10, weight: 70 },
    { reps: 10, weight: 70 },
  ];

  it("pas assez de séances sur l'exercice : l'expérience manquante est dite, pas une charge", () => {
    const history = weekly(["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"], STRONG);
    const r = evaluateLiveRank(input({ history, currentSets: [{ reps: 10, weight: 70 }] }));
    expect(r.tierIndex).toBe(19);
    expect(r.next).toEqual({ kind: "experience", tierIndex: 20, done: 5, required: 10 });
    expect(describeNextRank(r.next)).toEqual({
      title: "Vers Divin Olympien",
      detail: "se confirme après 10 séances de cet exercice (5 faites)",
    });
  });

  it("expérience acquise, séances au niveau insuffisantes : progression + série qui ferait compter aujourd'hui", () => {
    const LIGHT = [
      { reps: 10, weight: 55 },
      { reps: 10, weight: 55 },
    ];
    const dates = Array.from(
      { length: 10 },
      (_, i) => `2026-08-${String(1 + i * 3).padStart(2, "0")}`,
    );
    const history = [...weekly(dates, LIGHT), ...weekly(["2026-10-20"], STRONG)];
    const r = evaluateLiveRank(input({ history }));
    expect(r.next?.kind).toBe("qualifying");
    if (r.next?.kind !== "qualifying") return;
    expect(r.next.done).toBe(1);
    expect(r.next.required).toBe(3);
    expect(r.next.todayQualifies).toBe(false);
    expect(r.next.todayTarget?.reps).toBe(10);
    expect(describeNextRank(r.next)?.detail).toMatch(
      /^1\/3 séances au niveau · aujourd'hui dès .+ kg × 10$/,
    );

    // Une fois la série du jour validée au niveau : « aujourd'hui compte ».
    const withToday = evaluateLiveRank(input({ history, currentSets: STRONG }));
    expect(withToday.next).toMatchObject({ kind: "qualifying", todayQualifies: true, done: 2 });
    expect(describeNextRank(withToday.next)?.detail).toBe(
      "aujourd'hui compte · 2/3 séances au niveau",
    );
  });

  it("séances au niveau trop rapprochées : l'étalement manquant est dit", () => {
    const LIGHT = [{ reps: 10, weight: 55 }];
    const dates = Array.from(
      { length: 8 },
      (_, i) => `2026-08-${String(1 + i * 3).padStart(2, "0")}`,
    );
    const history = [
      ...weekly(dates, LIGHT),
      ...weekly(["2026-10-20", "2026-10-24", "2026-10-28"], STRONG),
    ];
    const r = evaluateLiveRank(input({ history }));
    expect(r.next).toMatchObject({ kind: "span", tierIndex: 20, spanDays: 8, requiredDays: 30 });
    expect(describeNextRank(r.next)?.detail).toBe(
      "séances au niveau à étaler sur 30 jours (8 pour l'instant)",
    );
  });
});

describe("rankHistoryByExercise", () => {
  it("exclut la séance en cours et les séries non validées, regroupe par identité", () => {
    const map = rankHistoryByExercise(
      [
        {
          id: "active",
          date: TODAY,
          exercises: [
            {
              name: "Chest press",
              exercise_sets: [{ reps: 10, weight: 90, completed: true }],
            },
          ],
        },
        {
          id: "past",
          date: "2026-10-28",
          exercises: [
            {
              name: "Chest press",
              exercise_sets: [
                { reps: 10, weight: 70, completed: true },
                { reps: 10, weight: 75, completed: false },
                { reps: null, weight: 70, completed: true },
              ],
            },
            { name: "  ", exercise_sets: [{ reps: 10, weight: 10, completed: true }] },
          ],
        },
      ],
      "active",
    );
    expect([...map.keys()]).toEqual(["name:chest press"]);
    expect(map.get("name:chest press")).toEqual([
      { workoutId: "past", date: "2026-10-28", sets: [{ reps: 10, weight: 70 }] },
    ]);
  });
});

describe("libellés", () => {
  it("tierLabel : grade nommé puis famille", () => {
    expect(tierLabel(0)).toEqual({
      rankKey: "mortel",
      rankLabel: "Mortel",
      fullLabel: "Éveillé Mortel",
    });
    expect(tierLabel(12).fullLabel).toBe("Glorieux Héros");
    expect(tierLabel(99).rankKey).toBe("titan");
  });

  it("describeNextRank : une série suffit", () => {
    expect(describeNextRank({ kind: "set", tierIndex: 12, weight: 85, reps: 10 })).toEqual({
      title: "Prochain grade : Glorieux Héros",
      detail: "à 85 kg × 10",
    });
    expect(describeNextRank(null)).toBeNull();
  });

  it("formatNextRankTarget : virgule française, poids du corps en répétitions", () => {
    expect(formatNextRankTarget({ weight: 82.5, reps: 8 })).toBe("82,5 kg × 8");
    expect(formatNextRankTarget({ weight: 85, reps: 10 })).toBe("85 kg × 10");
    expect(formatNextRankTarget({ weight: null, reps: 15 })).toBe("15 reps");
  });
});

describe("detectSessionHighlight — au plus une célébration, jamais rejouée", () => {
  const snap = (tierIndex: number, promoted: boolean, bestWeight: number | null) => ({
    tierIndex,
    promoted,
    bestWeight,
  });
  const ctx = (records: Record<string, number> = {}, seen: Record<string, number | null> = {}) => ({
    priorRecordByKey: new Map(Object.entries(records)),
    seenTierByKey: new Map(Object.entries(seen)),
  });

  it("premier calcul (reprise d'une séance) : rien", () => {
    expect(detectSessionHighlight(null, new Map([["a", snap(12, true, 90)]]), ctx())).toBeNull();
  });

  it("grade franchi pendant la séance : montée de grade, prioritaire sur le record", () => {
    const prev = new Map([["a", snap(11, false, 40)]]);
    const next = new Map([["a", snap(12, true, 50)]]);
    expect(detectSessionHighlight(prev, next, ctx({ a: 45 }))).toEqual({
      kind: "rankUp",
      key: "a",
      tierIndex: 12,
    });
  });

  it("grade déjà célébré sur cet appareil : pas de seconde cinématique, mais le record reste", () => {
    const prev = new Map([["a", snap(11, false, 40)]]);
    const next = new Map([["a", snap(12, true, 50)]]);
    expect(detectSessionHighlight(prev, next, ctx({ a: 45 }, { a: 12 }))).toEqual({
      kind: "record",
      key: "a",
      weight: 50,
    });
  });

  it("record : seulement au-delà du record d'avant la séance, et une fois par hausse", () => {
    const prev = new Map([["a", snap(11, false, 40)]]);
    expect(
      detectSessionHighlight(prev, new Map([["a", snap(11, false, 45)]]), ctx({ a: 45 })),
    ).toBeNull();
    expect(
      detectSessionHighlight(prev, new Map([["a", snap(11, false, 47.5)]]), ctx({ a: 45 })),
    ).toEqual({ kind: "record", key: "a", weight: 47.5 });
    // Même état d'une fois sur l'autre : plus rien.
    const same = new Map([["a", snap(11, false, 47.5)]]);
    expect(detectSessionHighlight(same, same, ctx({ a: 45 }))).toBeNull();
  });

  it("sans record antérieur (première fois) : pas de « record »", () => {
    const prev = new Map([["a", snap(0, false, null)]]);
    expect(detectSessionHighlight(prev, new Map([["a", snap(0, false, 30)]]), ctx())).toBeNull();
  });

  it("exercice ajouté en cours de séance (absent de l'état précédent) : rien", () => {
    expect(
      detectSessionHighlight(new Map(), new Map([["a", snap(12, true, 50)]]), ctx({ a: 45 })),
    ).toBeNull();
  });
});
