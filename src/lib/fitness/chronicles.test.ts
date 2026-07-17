import { describe, it, expect } from "vitest";
import {
  computeRecordsBySession,
  computeHallOfFame,
  computeLegends,
  computeForgotten,
  computePlateaus,
  computeSpecializations,
  computeBadges,
  computeLongestStreak,
  type WorkoutLike,
} from "./chronicles";

// Historique de référence : 3 séances muscu échelonnées.
function w(id: string, date: string, exercises: WorkoutLike["exercises"]): WorkoutLike {
  return { id, date, name: `Séance ${id}`, duration_minutes: 60, exercises };
}

const HISTORY: WorkoutLike[] = [
  w("w1", "2026-05-01", [
    { id: "a", name: "Développé couché", weight: 80, sets: null, reps: 10 },
    { id: "b", name: "Squat", weight: 100, sets: null, reps: 5 },
  ]),
  w("w2", "2026-05-08", [
    { id: "c", name: "Développé couché", weight: 90, sets: null, reps: 8 },
    { id: "d", name: "Squat", weight: 100, sets: null, reps: 5 },
  ]),
  w("w3", "2026-05-15", [
    { id: "e", name: "Développé couché", weight: 100, sets: null, reps: 6 },
    { id: "f", name: "Squat", weight: 100, sets: null, reps: 5 },
  ]),
];

describe("computeRecordsBySession", () => {
  it("marque la première apparition comme nouvel exercice, les hausses strictes comme PR", () => {
    const map = computeRecordsBySession(HISTORY);
    expect(map.get("w1")!.every((r) => r.isNew)).toBe(true);
    const w2 = map.get("w2")!;
    expect(w2).toHaveLength(1); // le squat à 100 (égalité) ne compte pas
    expect(w2[0]).toMatchObject({ name: "Développé couché", weight: 90, isNew: false });
  });
});

describe("computeHallOfFame", () => {
  it("trouve les records absolus réels et les totaux carrière", () => {
    const hof = computeHallOfFame(HISTORY, 75);
    expect(hof.bestTonnage!.value).toBe(80 * 10 + 100 * 5); // w1 = 1300
    // Le Squat touche 100 kg dès w1 — premier arrivé, record conservé
    // (comparaison stricte, le DC à 100 en w3 n'égale que le record).
    expect(hof.heaviestSet).toMatchObject({ exercise: "Squat", weight: 100 });
    expect(hof.longestSet).toMatchObject({ exercise: "Développé couché", reps: 10 });
    expect(hof.longestSession!.minutes).toBe(60);
    expect(hof.career.sessions).toBe(3);
    expect(hof.career.series).toBe(6);
    expect(hof.career.prCount).toBe(2); // DC 90 puis 100
  });

  it("masque (null) ce qui n'existe pas", () => {
    const hof = computeHallOfFame([], null);
    expect(hof.bestTonnage).toBeNull();
    expect(hof.heaviestSet).toBeNull();
    expect(hof.longestSession).toBeNull();
    expect(hof.career.sessions).toBe(0);
  });
});

describe("computeLegends", () => {
  it("construit une carte par exercice récurrent avec PR et progression", () => {
    const legends = computeLegends(HISTORY);
    const dc = legends.find((l) => l.name === "Développé couché")!;
    expect(dc.pr).toBe(100);
    expect(dc.progressionPct).toBe(25); // 80 → 100
    expect(dc.sessions).toBe(3);
    expect(dc.lastUsed).toBe("2026-05-15");
    expect(dc.level).toBe("Confirmé");
    // Un exercice vu une seule fois n'est pas une légende.
    const single = computeLegends([HISTORY[0]]);
    expect(single).toHaveLength(0);
  });
});

describe("computeForgotten", () => {
  it("détecte un exercice récurrent absent depuis ≥ 21 jours, avec impact musculaire", () => {
    const now = new Date("2026-06-20T12:00:00");
    const forgotten = computeForgotten(HISTORY, now);
    expect(forgotten.length).toBeGreaterThan(0);
    const dc = forgotten.find((f) => f.name === "Développé couché")!;
    expect(dc.daysSince).toBe(36);
    expect(dc.impact).toContain("Pectoraux");
  });

  it("ne signale rien si tout est récent", () => {
    const now = new Date("2026-05-16T12:00:00");
    expect(computeForgotten(HISTORY, now)).toHaveLength(0);
  });
});

describe("computePlateaus", () => {
  it("détecte un plateau (≥3 séances sans hausse) sur un exercice encore actif", () => {
    const stalled: WorkoutLike[] = [
      ...HISTORY,
      w("w4", "2026-05-22", [{ id: "g", name: "Squat", weight: 100, sets: null, reps: 5 }]),
    ];
    const now = new Date("2026-05-25T12:00:00");
    const plateaus = computePlateaus(stalled, now);
    expect(plateaus).toHaveLength(1);
    expect(plateaus[0]).toMatchObject({ name: "Squat", pr: 100, stalledSessions: 3 });
    expect(plateaus[0].weeksSinceImprovement).toBeGreaterThanOrEqual(3);
    // Le Développé couché progresse à chaque séance : jamais en plateau.
    expect(plateaus.find((p) => p.name === "Développé couché")).toBeUndefined();
  });
});

describe("computeSpecializations", () => {
  it("agrège le volume par catégorie et note en étoiles relatives", () => {
    // 6 séances pour dépasser le seuil de séries.
    const many = Array.from({ length: 6 }, (_, i) =>
      w(`s${i}`, `2026-05-0${i + 1}`, [
        { id: `p${i}`, name: "Développé couché", weight: 80, sets: null, reps: 10 },
        { id: `q${i}`, name: "Squat", weight: 40, sets: null, reps: 5 },
      ]),
    );
    const specs = computeSpecializations(many);
    const pecs = specs.find((s) => s.id === "pecs")!;
    expect(pecs.stars).toBe(5); // volume dominant
    const jambes = specs.find((s) => s.id === "jambes")!;
    expect(jambes.stars).toBeGreaterThanOrEqual(1);
    expect(specs[0].volume).toBeGreaterThanOrEqual(specs[specs.length - 1].volume);
  });
});

describe("computeLongestStreak / computeBadges", () => {
  it("mesure la plus longue suite de jours consécutifs", () => {
    const days = ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-10"].map((d, i) =>
      w(`d${i}`, d, []),
    );
    expect(computeLongestStreak(days)).toBe(3);
  });

  it("n'attribue que les badges réellement gagnés", () => {
    const badges = computeBadges(HISTORY);
    const ids = badges.map((b) => b.id);
    expect(ids).toContain("first-100"); // DC à 100 kg en w3
    expect(ids).toContain("first-ton"); // w1 = 1300 kg
    expect(ids).not.toContain("streak-3"); // séances espacées d'une semaine
    expect(ids).not.toContain("prs-3"); // max 1 PR par séance
    expect(computeBadges([])).toHaveLength(0);
  });
});
