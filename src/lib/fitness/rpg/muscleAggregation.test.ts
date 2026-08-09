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

  describe("pondération primaire/secondaire (audit RPG V2)", () => {
    it("le muscle listé en premier (moteur principal) pèse plus qu'un muscle synergiste", () => {
      // Triceps : deux mouvements composés où triceps est SECONDAIRE
      // (développé couché/militaire, pectoraux/épaules moteur principal)
      // à un tier bas, contre deux exercices d'ISOLATION triceps
      // (moteur principal) à un tier haut. On compare au résultat qu'on
      // obtiendrait avec les 4 mêmes exercices tous "primaires" (poids
      // égal, comportement de l'ancienne Méthode A) — la pondération doit
      // rapprocher le résultat des exercices primaires, même si la moyenne
      // géométrique reste par nature sensible aux valeurs basses (c'est
      // voulu, cf. garde-fou anti-domination).
      const exercises = [
        { key: "bench", name: "Développé couché", tierIndex: 2 }, // triceps secondaire
        { key: "ohp", name: "Développé militaire barre", tierIndex: 2 }, // triceps secondaire
        { key: "pushdown", name: "Extension triceps câble", tierIndex: 22 }, // triceps primaire
        { key: "skull", name: "Extension triceps skull crusher", tierIndex: 22 }, // triceps primaire
      ];
      const weighted = aggregateMuscleRanks(exercises);
      // Repère : les 4 mêmes exercices, mais tous mono-muscle "triceps"
      // (donc tous primaires à poids égal) — équivalent de l'ancienne
      // Méthode A sur ces mêmes données.
      const equalWeightBaseline = aggregateMuscleRanks(
        exercises.map((e) => ({ ...e, name: "Extension triceps câble" })),
      );
      expect(weighted.triceps.status).toBe("evaluated");
      expect(equalWeightBaseline.triceps.status).toBe("evaluated");
      // La pondération doit produire un résultat mesurablement différent
      // (plus proche des exercices primaires) que le poids égal.
      expect(weighted.triceps.tierIndex!).not.toBe(equalWeightBaseline.triceps.tierIndex);
    });

    it("un exercice mono-muscle (isolation) est traité comme primaire pour ce muscle", () => {
      const result = aggregateMuscleRanks([
        { key: "curl1", name: "Curl haltères", tierIndex: 12 },
        { key: "curl2", name: "Curl barre EZ", tierIndex: 12 },
      ]);
      // Deux mouvements où biceps est listé en premier → tous deux
      // "primaires" → résultat = 12 exactement (poids égaux entre eux).
      expect(result.biceps).toEqual({
        status: "evaluated",
        tierIndex: 12,
        contributingCount: 2,
      });
    });
  });

  describe("garde-fou — un seul exercice ne détermine jamais seul le rang (§4)", () => {
    const cases: Array<[string, number, number]> = [
      ["Titan / Mortel", 27, 2],
      ["Titan / Guerrier", 27, 7],
      ["Titan / Héros", 27, 12],
      ["Colosse / Héros", 17, 12],
      ["Héros / Héros", 12, 12],
    ];

    it.each(cases)("%s → reste borné, pas de Titan artificiel", (_label, a, b) => {
      const result = aggregateMuscleRanks([
        { key: "e1", name: "Curl haltères", tierIndex: a }, // biceps primaire
        { key: "e2", name: "Curl barre EZ", tierIndex: b }, // biceps primaire
      ]);
      expect(result.biceps.status).toBe("evaluated");
      expect(result.biceps.tierIndex!).toBeGreaterThanOrEqual(Math.min(a, b));
      expect(result.biceps.tierIndex!).toBeLessThanOrEqual(Math.max(a, b));
      if (a !== b) expect(result.biceps.tierIndex).not.toBe(27); // jamais Titan si l'un des deux ne l'est pas
    });

    it("3 exercices avec un exercice dominant (primaire Titan, 2 secondaires Mortel) : le dominant seul ne suffit pas", () => {
      const result = aggregateMuscleRanks([
        { key: "curl", name: "Curl haltères", tierIndex: 27 }, // biceps primaire, Titan
        { key: "tirage1", name: "Tirage vertical poignée serrée", tierIndex: 2 }, // biceps secondaire, Mortel
        { key: "tirage2", name: "Traction prise neutre", tierIndex: 2 }, // biceps secondaire, Mortel
      ]);
      expect(result.biceps.status).toBe("evaluated");
      // Même en poids plein (1,0) le curl seul ne peut pas, structurellement
      // (plafond 50% + plafond relatif de muscleRank.ts), imposer Titan.
      expect(result.biceps.tierIndex!).toBeLessThan(25);
    });
  });
});
