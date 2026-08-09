import { describe, expect, it } from "vitest";
import { aggregateMuscleRanks } from "./muscleAggregation";

describe("aggregateMuscleRanks", () => {
  it("regroupe plusieurs exercices contribuant au même muscle", () => {
    const result = aggregateMuscleRanks([
      { key: "bench", name: "Développé couché", tierIndex: 12 },
      { key: "incline", name: "Développé incliné", tierIndex: 14 },
      { key: "flye", name: "Écarté couché", tierIndex: 10 },
    ]);
    // Développé couché/incliné/écarté contribuent tous aux pectoraux.
    expect(result.pectoraux.status).toBe("evaluated");
    expect(result.pectoraux.contributingCount).toBe(3);
  });

  it("un seul exercice contributeur → muscle non évalué", () => {
    const result = aggregateMuscleRanks([
      { key: "curl", name: "Curl haltères", tierIndex: 12 },
    ]);
    expect(result.biceps.status).toBe("not_evaluated");
  });

  it("aucun exercice → tous les muscles non évalués", () => {
    const result = aggregateMuscleRanks([]);
    for (const muscle of Object.values(result)) {
      expect(muscle.status).toBe("not_evaluated");
    }
  });

  it("ignore les muscles hors buste (ex. quadriceps via squat) sans planter", () => {
    const result = aggregateMuscleRanks([
      { key: "squat", name: "Squat", tierIndex: 15 },
      { key: "legpress", name: "Presse à cuisses", tierIndex: 15 },
    ]);
    // squat/presse ne contribuent à aucun des 8 muscles du buste.
    for (const muscle of Object.values(result)) {
      expect(muscle.status).toBe("not_evaluated");
    }
  });

  it("un exercice polyarticulaire (développé militaire) contribue à épaules ET triceps", () => {
    const result = aggregateMuscleRanks([
      { key: "ohp", name: "Développé militaire barre", tierIndex: 12 },
      { key: "lateral", name: "Élévation latérale", tierIndex: 14 },
      { key: "pushdown", name: "Extension triceps câble", tierIndex: 10 },
      { key: "skullcrusher", name: "Extension triceps skull crusher", tierIndex: 11 },
    ]);
    expect(result.epaules.contributingCount).toBe(2); // ohp + lateral
    expect(result.triceps.contributingCount).toBe(3); // ohp + pushdown + skullcrusher
  });
});
