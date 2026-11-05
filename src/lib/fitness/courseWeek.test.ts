import { describe, expect, it } from "vitest";
import { buildCourseMetadata, COURSES } from "./courses";
import { courseWeek } from "./courseWeek";

const lagree = buildCourseMetadata(COURSES.lagree);
const w = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id,
  date,
  status: "completed",
  metadata: lagree,
  created_at: `${date}T16:29:00Z`,
  xp_before: 72269,
  xp_after: 72319,
  ...extra,
});

describe("courseWeek — les créneaux de cours de la semaine", () => {
  it("un cours mercredi remplit le premier créneau, le second reste ouvert", () => {
    const week = courseWeek([w("a", "2026-11-04")], "2026-11-05");
    expect(week.doneCount).toBe(1);
    expect(week.slots).toEqual([
      { kind: "done", workoutId: "a", courseName: "Lagree", dayShort: "Mer.", xp: 50 },
      { kind: "open" },
    ]);
  });

  it("ignore la musculation, les séances actives et les autres semaines", () => {
    const week = courseWeek(
      [
        w("muscu", "2026-11-04", { metadata: {} }),
        w("active", "2026-11-05", { status: "active" }),
        w("avant", "2026-11-01"),
        w("après", "2026-11-09"),
      ],
      "2026-11-05",
    );
    expect(week.doneCount).toBe(0);
    expect(week.slots).toEqual([{ kind: "open" }, { kind: "open" }]);
  });

  it("XP pas encore déposée par le serveur : null, jamais un montant inventé", () => {
    const week = courseWeek([w("a", "2026-11-04", { xp_after: null })], "2026-11-05");
    expect(week.slots[0]).toMatchObject({ kind: "done", xp: null });
  });

  it("un troisième cours s'ajoute, dans l'ordre de la semaine", () => {
    const week = courseWeek(
      [w("c", "2026-11-07", { xp_after: 72269 }), w("a", "2026-11-03"), w("b", "2026-11-05")],
      "2026-11-08",
    );
    expect(week.slots.map((s) => (s.kind === "done" ? s.dayShort : "open"))).toEqual([
      "Mar.",
      "Jeu.",
      "Sam.",
    ]);
    expect(week.slots[2]).toMatchObject({ xp: 0 });
  });
});
