import { describe, expect, it } from "vitest";
import {
  resolveMuscleGroup,
  inferMuscleGroupFromName,
  UNCATEGORIZED_MUSCLE_GROUP,
} from "./muscleGroupInference";

describe("resolveMuscleGroup", () => {
  it("utilise category si déjà renseignée, sans jamais consulter le reste", () => {
    expect(resolveMuscleGroup({ category: "Pectoraux" }, "Peu importe le nom")).toBe("Pectoraux");
  });

  it("retombe sur config.muscle_group si category est absente", () => {
    expect(
      resolveMuscleGroup({ category: null, config: { muscle_group: "Dos" } }, "Peu importe"),
    ).toBe("Dos");
  });

  it("déduit du nom si ni category ni config.muscle_group ne sont renseignés", () => {
    expect(resolveMuscleGroup({ category: null, config: null }, "Rowing T-barre")).toBe("Dos");
  });

  it("ne retourne jamais une chaîne vide — repli neutre en dernier recours", () => {
    const result = resolveMuscleGroup(
      { category: null, config: null },
      "Exercice totalement inconnu xyz123",
    );
    expect(result).toBe(UNCATEGORIZED_MUSCLE_GROUP);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("inferMuscleGroupFromName", () => {
  it("classe les rotations d'épaule en Épaules (pas Abdominaux malgré 'rotation')", () => {
    expect(inferMuscleGroupFromName("Rotation interne de l'épaule")).toBe("Épaules");
    expect(inferMuscleGroupFromName("Rotation externe de l'épaule à la poulie")).toBe("Épaules");
  });

  it("classe un 'développé' non qualifié en Pectoraux, sans capter 'développé militaire'", () => {
    expect(inferMuscleGroupFromName("Développé convergent à la poulie")).toBe("Pectoraux");
    expect(inferMuscleGroupFromName("développé militaire")).toBe("Épaules");
  });

  it("regroupe les mouvements d'échauffement sous un intitulé neutre", () => {
    expect(inferMuscleGroupFromName("Échauffement dynamique")).toBe("Échauffement");
    expect(inferMuscleGroupFromName("Activation Articulaire & Musculaire")).toBe("Échauffement");
  });

  it("regroupe les mouvements de retour au calme / étirements", () => {
    expect(inferMuscleGroupFromName("Retour au calme (étirements doux et relaxation)")).toBe(
      "Récupération",
    );
  });

  it("regroupe les mouvements polyarticulaires / full body", () => {
    expect(inferMuscleGroupFromName("Wall Balls")).toBe("Polyarticulaire");
    expect(inferMuscleGroupFromName("Farmer’s Carry")).toBe("Polyarticulaire");
  });

  it("retourne null si aucun signal (le fallback neutre est la responsabilité de resolveMuscleGroup)", () => {
    expect(inferMuscleGroupFromName("Xyzzy inconnu 123")).toBeNull();
  });

  it("déduit correctement les groupes musculaires courants", () => {
    expect(inferMuscleGroupFromName("Curl barre EZ poulie")).toBe("Biceps");
    expect(inferMuscleGroupFromName("Squat barre")).toBe("Quadriceps");
    expect(inferMuscleGroupFromName("Tirage nuque")).toBe("Dos");
  });
});
