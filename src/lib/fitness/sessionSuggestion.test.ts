import { describe, expect, it } from "vitest";
import { addDaysYMD } from "@/lib/dates";
import {
  MIN_DAYS_SINCE,
  MIN_OCCURRENCES,
  WINDOW_DAYS,
  suggestSessionToRepeat,
} from "./sessionSuggestion";
import type { TodayWorkout } from "./todayCard";

const TODAY = "2026-10-01";
const ago = (days: number) => addDaysYMD(TODAY, -days);

let seq = 0;
/** Une séance terminée ; `sets` séries à 100 kg × 5 (0 = séance importée, sans exercice). */
function session(
  name: string,
  daysAgo: number,
  sets = 3,
  extra: Partial<TodayWorkout> = {},
): TodayWorkout {
  seq += 1;
  return {
    id: `w-${seq}`,
    name,
    date: ago(daysAgo),
    status: "completed",
    discipline: "muscu",
    created_at: `${ago(daysAgo)}T08:00:00Z`,
    exercises:
      sets === 0
        ? []
        : [
            {
              id: `e-${seq}`,
              name: "Exo",
              weight: null,
              sets: null,
              reps: null,
              exercise_sets: Array.from({ length: sets }, (_, i) => ({
                id: `s-${seq}-${i}`,
                set_number: i + 1,
                reps: 5,
                weight: 100,
                completed: true,
              })),
            },
          ],
    ...extra,
  } as TodayWorkout;
}

describe("suggestSessionToRepeat — la plus ancienne de tes séances habituelles", () => {
  const history = [
    session("Pectoraux", 3),
    session("Pectoraux", 10),
    session("Dos", 5),
    session("Dos", 12),
    session("Jambes", 8),
    session("Jambes", 17),
  ];

  it("propose celle qu'on n'a pas faite depuis le plus longtemps", () => {
    const s = suggestSessionToRepeat(history, TODAY)!;
    expect(s.name).toBe("Jambes");
    expect(s.daysSince).toBe(8);
    expect(s.occurrences).toBe(2);
  });

  it("la référence à refaire est la dernière séance de ce nom (celle d'il y a 8 jours)", () => {
    const s = suggestSessionToRepeat(history, TODAY)!;
    expect(s.reference.date).toBe(ago(8));
    expect(s.reference.sets).toBe(3);
  });

  it("l'ordre de l'historique ne change rien", () => {
    const reversed = [...history].reverse();
    expect(suggestSessionToRepeat(reversed, TODAY)!.name).toBe("Jambes");
  });

  it("aucune séance : rien à proposer", () => {
    expect(suggestSessionToRepeat([], TODAY)).toBeNull();
  });

  describe("ce qui n'est PAS un rythme", () => {
    it(`une séance isolée (moins de ${MIN_OCCURRENCES} fois) n'est pas habituelle`, () => {
      expect(suggestSessionToRepeat([session("Jambes", 8)], TODAY)).toBeNull();
    });

    it("hors de la fenêtre, une séance ne compte plus", () => {
      const old = [session("Jambes", WINDOW_DAYS + 5), session("Jambes", WINDOW_DAYS + 12)];
      expect(suggestSessionToRepeat(old, TODAY)).toBeNull();
    });

    it("deux occurrences dont UNE hors fenêtre : une seule compte, donc pas habituelle", () => {
      const mixed = [session("Jambes", 8), session("Jambes", WINDOW_DAYS + 3)];
      expect(suggestSessionToRepeat(mixed, TODAY)).toBeNull();
    });

    it("aujourd'hui n'est pas dans la fenêtre : une séance faite ce matin ne se propose pas", () => {
      const done = [session("Jambes", 0), session("Jambes", 7)];
      expect(suggestSessionToRepeat(done, TODAY)).toBeNull();
    });
  });

  describe("pas de suggestion pour ce qu'on vient de faire", () => {
    it(`moins de ${MIN_DAYS_SINCE} jours : hier ne se propose pas`, () => {
      const recent = [session("Dos", 1), session("Dos", 6)];
      expect(suggestSessionToRepeat(recent, TODAY)).toBeNull();
    });

    it("pile au seuil : proposée", () => {
      const edge = [session("Dos", MIN_DAYS_SINCE), session("Dos", 9)];
      expect(suggestSessionToRepeat(edge, TODAY)!.daysSince).toBe(MIN_DAYS_SINCE);
    });

    it("une séance récente laisse la place à une plus ancienne", () => {
      const mix = [
        session("Dos", 1),
        session("Dos", 6),
        session("Jambes", 9),
        session("Jambes", 20),
      ];
      expect(suggestSessionToRepeat(mix, TODAY)!.name).toBe("Jambes");
    });
  });

  describe("il faut de quoi REFAIRE", () => {
    it("une séance importée (sans exercice) compte pour le rythme mais n'est pas la référence", () => {
      const withShell = [
        session("Jambes", 8, 0), // importée : date et nom seulement
        session("Jambes", 15, 4), // la dernière qui porte des séries
      ];
      const s = suggestSessionToRepeat(withShell, TODAY)!;
      expect(s.daysSince).toBe(8); // le fait se lit sur la plus récente, répétable ou non
      expect(s.reference.date).toBe(ago(15));
      expect(s.reference.sets).toBe(4);
    });

    it("aucune séance de ce nom n'a de séries : rien à refaire, donc rien à proposer", () => {
      const shells = [session("Jambes", 8, 0), session("Jambes", 15, 0)];
      expect(suggestSessionToRepeat(shells, TODAY)).toBeNull();
    });

    it("une séance sans série n'écarte pas les autres noms", () => {
      const mix = [session("Jambes", 8, 0), session("Jambes", 15, 0), ...history.slice(0, 4)];
      expect(suggestSessionToRepeat(mix, TODAY)!.name).toBe("Dos");
    });
  });

  describe("ce qui compte comme « la même séance »", () => {
    it("casse, espaces et accents ignorés", () => {
      const variants = [session("Épaules", 9), session(" epaules ", 20), session("ÉPAULES", 30)];
      const s = suggestSessionToRepeat(variants, TODAY)!;
      expect(s.occurrences).toBe(3);
      expect(s.daysSince).toBe(9);
    });

    it("un nom différent est une autre séance : « Épaules A » ≠ « Épaules B »", () => {
      const ab = [session("Épaules A", 9), session("Épaules B", 12)];
      expect(suggestSessionToRepeat(ab, TODAY)).toBeNull();
    });

    it("un nom vide n'est jamais proposé", () => {
      const blank = [session("   ", 9), session("", 20)];
      expect(suggestSessionToRepeat(blank, TODAY)).toBeNull();
    });
  });

  describe("seules les séances de musculation terminées comptent", () => {
    it("une séance active, annulée ou d'une autre discipline n'entre pas dans le rythme", () => {
      const other = [
        session("Course", 9, 3, { discipline: "cardio" }),
        session("Course", 12, 3, { discipline: "cardio" }),
        session("Jambes", 9, 3, { status: "active" }),
        session("Jambes", 12),
      ];
      expect(suggestSessionToRepeat(other, TODAY)).toBeNull();
    });
  });

  describe("égalités départagées de façon stable", () => {
    it("même ancienneté : celle faite le plus souvent", () => {
      const tie = [
        session("Dos", 9),
        session("Dos", 16),
        session("Dos", 23),
        session("Jambes", 9),
        session("Jambes", 20),
      ];
      expect(suggestSessionToRepeat(tie, TODAY)!.name).toBe("Dos");
    });

    it("même ancienneté, même fréquence : l'ordre alphabétique, jamais l'ordre d'arrivée", () => {
      const a = [
        session("Jambes", 9),
        session("Jambes", 16),
        session("Dos", 9),
        session("Dos", 16),
      ];
      expect(suggestSessionToRepeat(a, TODAY)!.name).toBe("Dos");
      expect(suggestSessionToRepeat([...a].reverse(), TODAY)!.name).toBe("Dos");
    });
  });

  it("le nom affiché garde la casse de la séance la plus récente", () => {
    const s = suggestSessionToRepeat([session("jambes", 20), session("Jambes ", 9)], TODAY)!;
    expect(s.name).toBe("Jambes");
  });
});
