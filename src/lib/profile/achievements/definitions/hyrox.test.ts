import { describe, expect, it } from "vitest";
import { hyroxAchievements } from "./hyrox";
import { buildFixtureContext } from "../testFixtures";

function find(id: string) {
  const def = hyroxAchievements.find((d) => d.id === id);
  if (!def) throw new Error(`Succès introuvable : ${id}`);
  return def;
}

describe("hyroxAchievements — données réelles (Phase 8)", () => {
  it("hyrox_simulations_1_1 se débloque dès la première simulation complète réellement enregistrée", () => {
    const def = find("hyrox_simulations_1_1");
    expect(def.evaluate(buildFixtureContext({ hyroxSimulationsCount: 0 })).unlocked).toBe(false);
    expect(def.evaluate(buildFixtureContext({ hyroxSimulationsCount: 1 })).unlocked).toBe(true);
  });

  it("hyrox_station_explorer suit le nombre de postes distincts, pas le nombre de séances", () => {
    const def = find("hyrox_station_explorer");
    expect(def.evaluate(buildFixtureContext({ hyroxDistinctStationsCount: 4 })).unlocked).toBe(
      false,
    );
    const result = def.evaluate(buildFixtureContext({ hyroxDistinctStationsCount: 5 }));
    expect(result.unlocked).toBe(true);
    expect(result.currentLabel).toBe("5/9 postes");
  });

  it("les succès nécessitant un temps réalisé ou un statut d'événement officiel restent honnêtement comingSoon", () => {
    for (const id of ["hyrox_first_event", "hyrox_time_progress", "hyrox_goal"]) {
      const def = find(id);
      expect(def.comingSoon).toBe(true);
      expect(def.evaluate(buildFixtureContext()).unlocked).toBe(false);
    }
  });
});
