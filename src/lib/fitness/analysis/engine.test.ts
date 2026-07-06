import { describe, it, expect } from "vitest";
import { analyzeExercise, type AnalyzeInput } from "./engine";
import { inferObjective, resolveMuscleRoles } from "./index";
import type { MuscleId } from "../muscleMapping";
import type { RecoveryStatus } from "../recovery";

function muscle(
  id: MuscleId,
  status: RecoveryStatus = "ready",
  hoursSinceLast: number | null = 100,
) {
  return { id, status, hoursSinceLast, hoursRemaining: 0 };
}

const READY_ALL = ([
  "pectoraux",
  "dos",
  "epaules",
  "biceps",
  "triceps",
  "abdos",
  "obliques",
  "quadriceps",
  "ischio",
  "fessiers",
  "mollets",
  "trapeze",
  "avant-bras",
  "lombaires",
] as MuscleId[]).map((id) => muscle(id));

function base(overrides: Partial<AnalyzeInput> = {}): AnalyzeInput {
  return {
    exerciseName: "Développé couché",
    sessions: [
      { date: "2026-01-01", sets: [{ reps: 10, weight: 60 }, { reps: 10, weight: 60 }] },
      { date: "2026-01-08", sets: [{ reps: 10, weight: 62.5 }, { reps: 9, weight: 62.5 }] },
    ],
    recovery: READY_ALL,
    profile: {},
    ...overrides,
  };
}

describe("resolveMuscleRoles", () => {
  it("décompose le développé couché en principal/secondaire/stabilisateur", () => {
    const r = resolveMuscleRoles("Développé couché");
    expect(r.isGeneric).toBe(false);
    expect(r.primary).toContain("pectoraux");
    expect(r.secondary).toEqual(expect.arrayContaining(["triceps", "epaules"]));
    expect(r.primary).not.toContain("triceps"); // pas de doublon de rôle
  });

  it("tombe sur le modèle générique pour un mouvement inconnu", () => {
    const r = resolveMuscleRoles("Exercice martien inconnu 42");
    expect(r.isGeneric).toBe(true);
    expect(r.primary).toHaveLength(0);
    expect(r.stabilizer.length).toBeGreaterThan(0);
  });

  it("utilise les muscles résolus par l'IA en repli", () => {
    const r = resolveMuscleRoles("Exercice custom", ["quadriceps", "fessiers"]);
    expect(r.isGeneric).toBe(false);
    expect(r.primary).toContain("quadriceps");
  });
});

describe("inferObjective", () => {
  it("privilégie l'objectif explicite", () => {
    expect(inferObjective({ explicitObjective: "posture" })).toBe("posture");
  });
  it("infère la sèche depuis un objectif de perte de poids actif", () => {
    expect(inferObjective({ goals: [{ goal_type: "weight_loss", is_completed: false }] })).toBe(
      "seche",
    );
  });
  it("infère la force depuis des reps basses", () => {
    expect(inferObjective({ avgReps: 4 })).toBe("force");
  });
  it("repli général sans donnée", () => {
    expect(inferObjective({})).toBe("general");
  });
});

describe("analyzeExercise", () => {
  it("produit une fiche complète et non vide", () => {
    const a = analyzeExercise(base());
    expect(a.muscles.length).toBeGreaterThan(0);
    expect(a.physicalImpact.length).toBeGreaterThanOrEqual(2);
    expect(a.recommendations.length).toBeGreaterThan(0);
    expect(a.relevance.stars).toBeGreaterThanOrEqual(1);
    expect(a.relevance.stars).toBeLessThanOrEqual(5);
    expect(a.narrative.length).toBeGreaterThan(0);
    expect(a.smartSummary).toContain("★");
  });

  it("détecte la progression et un record de charge", () => {
    const a = analyzeExercise(base());
    expect(a.comparison.state).toBe("progression");
    expect(a.comparison.prsBroken.some((p) => p.includes("Charge max"))).toBe(true);
  });

  it("détecte la stagnation quand rien ne bouge", () => {
    const a = analyzeExercise(
      base({
        sessions: [
          { date: "2026-01-01", sets: [{ reps: 10, weight: 60 }] },
          { date: "2026-01-08", sets: [{ reps: 10, weight: 60 }] },
        ],
      }),
    );
    expect(a.comparison.state).toBe("stagnation");
    expect(a.recommendations.length).toBeGreaterThan(0);
  });

  it("reste analysable pour un exercice inconnu (modèle générique)", () => {
    const a = analyzeExercise(base({ exerciseName: "Mouvement inconnu ZZZ" }));
    expect(a.isGenericModel).toBe(true);
    expect(a.narrative.length).toBeGreaterThan(0);
    expect(a.relevance.stars).toBeLessThanOrEqual(3);
  });

  it("recommande la récupération quand un muscle moteur est fatigué", () => {
    const rec = READY_ALL.map((m) =>
      m.id === "pectoraux" ? muscle("pectoraux", "fatigued", 10) : m,
    );
    const a = analyzeExercise(base({ recovery: rec }));
    expect(a.recommendations.some((r) => r.type === "recuperer")).toBe(true);
    expect(a.imbalances.some((i) => i.type === "recuperation_incomplete")).toBe(true);
  });

  it("ne renvoie jamais une analyse vide même sans historique", () => {
    const a = analyzeExercise(base({ sessions: [] }));
    expect(a.comparison.state).toBe("nouveau");
    expect(a.muscles.length).toBeGreaterThan(0);
    expect(a.narrative.length).toBeGreaterThan(0);
  });
});
