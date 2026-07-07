import { describe, expect, it } from "vitest";
import { runningAchievements } from "./running";
import { buildFixtureContext } from "../testFixtures";

function find(id: string) {
  const def = runningAchievements.find((d) => d.id === id);
  if (!def) throw new Error(`Succès introuvable : ${id}`);
  return def;
}

describe("runningAchievements — données réelles (Phase 8)", () => {
  it("running_sessions_1_1 se débloque dès la première séance de course enregistrée", () => {
    const def = find("running_sessions_1_1");
    expect(def.evaluate(buildFixtureContext({ courseSessionsCount: 0 })).unlocked).toBe(false);
    expect(def.evaluate(buildFixtureContext({ courseSessionsCount: 1 })).unlocked).toBe(true);
  });

  it("chaque préparation de course (5km/10km/semi/marathon) est vérifiée indépendamment", () => {
    expect(
      find("running_first_5k").evaluate(buildFixtureContext({ coursePrep5kDone: true })).unlocked,
    ).toBe(true);
    expect(
      find("running_first_5k").evaluate(buildFixtureContext({ coursePrep5kDone: false })).unlocked,
    ).toBe(false);
    expect(
      find("running_marathon").evaluate(buildFixtureContext({ coursePrepMarathonDone: true }))
        .unlocked,
    ).toBe(true);
    // Un flag ne doit jamais en débloquer un autre (pas de fuite entre distances).
    expect(
      find("running_marathon").evaluate(buildFixtureContext({ coursePrep5kDone: true })).unlocked,
    ).toBe(false);
  });

  it("running_pr reste honnêtement comingSoon (aucune performance réelle n'est capturée)", () => {
    const def = find("running_pr");
    expect(def.comingSoon).toBe(true);
    expect(def.evaluate(buildFixtureContext()).unlocked).toBe(false);
  });
});
