import { describe, expect, it } from "vitest";
import { CardioWorkoutEngine } from "./cardioEngine";
import type { SenseiAnswers } from "./types";

function visibleQuestionIds(answers: SenseiAnswers): string[] {
  return CardioWorkoutEngine.questions.filter((q) => !q.when || q.when(answers)).map((q) => q.id);
}

describe("CardioWorkoutEngine.questions — flux conditionnel par activité", () => {
  it("Marche inclinée : vitesse + inclinaison, rien d'autre de spécifique", () => {
    const ids = visibleQuestionIds({ activity: "Marche inclinée" });
    expect(ids).toContain("speed_kmh");
    expect(ids).toContain("incline_pct");
    expect(ids).not.toContain("level");
    expect(ids).not.toContain("resistance");
    expect(ids).not.toContain("intensity");
  });

  it("Escalier : niveau uniquement", () => {
    const ids = visibleQuestionIds({ activity: "Escalier" });
    expect(ids).toContain("level");
    expect(ids).not.toContain("speed_kmh");
    expect(ids).not.toContain("resistance");
  });

  it("Vélo : résistance + cadence", () => {
    const ids = visibleQuestionIds({ activity: "Vélo" });
    expect(ids).toContain("resistance");
    expect(ids).toContain("cadence_rpm");
    expect(ids).not.toContain("intensity");
  });

  it("Rameur : distance + intensité, pas de cadence (spécifique Vélo)", () => {
    const ids = visibleQuestionIds({ activity: "Rameur" });
    expect(ids).toContain("distance_m");
    expect(ids).toContain("intensity");
    expect(ids).not.toContain("cadence_rpm");
  });

  it("gym_location et duration_minutes sont toujours visibles, quelle que soit l'activité", () => {
    for (const activity of [
      "Marche inclinée",
      "Escalier",
      "Vélo",
      "Elliptique",
      "Assault Bike",
      "Rameur",
    ]) {
      const ids = visibleQuestionIds({ activity });
      expect(ids).toContain("gym_location");
      expect(ids).toContain("duration_minutes");
    }
  });
});

describe("CardioWorkoutEngine.generate", () => {
  it("construit un nom déterministe et des segments pré-labellisés, sans appel réseau", async () => {
    const tpl = await CardioWorkoutEngine.generate({
      activity: "Vélo",
      duration_minutes: 40,
      resistance: 12,
      cadence_rpm: 85,
    });
    expect(tpl.name).toBe("Vélo — 40 min");
    expect(tpl.exercises).toEqual([]);
    expect(tpl.segments).toEqual([
      {
        label: "Vélo",
        stats: [
          { label: "Résistance", value: "12" },
          { label: "Cadence", value: "85 rpm" },
        ],
      },
    ]);
  });
});

describe("CardioWorkoutEngine.toWorkoutRecord", () => {
  it("copie les segments du template et range les paramètres bruts dans metadata, jamais dans exerciseRows", async () => {
    const answers: SenseiAnswers = {
      activity: "Vélo",
      duration_minutes: 40,
      resistance: 12,
      cadence_rpm: 85,
      gym_location: "Fitness Park",
    };
    const template = await CardioWorkoutEngine.generate(answers);

    const draft = CardioWorkoutEngine.toWorkoutRecord(template, answers);

    expect(draft.discipline).toBe("cardio");
    expect(draft.duration_minutes).toBe(40);
    expect(draft.gym_location).toBe("Fitness Park");
    expect(draft.exerciseRows).toBeUndefined();
    expect(draft.metadata).toEqual({
      activity: "Vélo",
      resistance: 12,
      cadence_rpm: 85,
      segments: template.segments,
    });
  });
});

describe("CardioWorkoutEngine.toSessionView", () => {
  it("relit les segments stockés dans metadata sans les re-dériver", () => {
    const view = CardioWorkoutEngine.toSessionView({
      discipline: "cardio",
      name: "Vélo — 40 min",
      duration_minutes: 40,
      metadata: {
        activity: "Vélo",
        segments: [
          {
            label: "Vélo",
            stats: [
              { label: "Résistance", value: "12" },
              { label: "Cadence", value: "85 rpm" },
            ],
          },
        ],
      },
    });

    expect(view.segments).toHaveLength(1);
    expect(view.segments[0].label).toBe("Vélo");
    expect(view.segments[0].stats).toEqual([
      { label: "Résistance", value: "12" },
      { label: "Cadence", value: "85 rpm" },
    ]);
    expect(view.summaryStats).toEqual(
      expect.arrayContaining([
        { label: "Durée", value: "40 min" },
        { label: "Activité", value: "Vélo" },
      ]),
    );
  });

  it("ne plante pas si metadata.segments est absent (ligne historique inattendue)", () => {
    const view = CardioWorkoutEngine.toSessionView({
      discipline: "cardio",
      name: "Vélo — 40 min",
      duration_minutes: 40,
      metadata: { activity: "Vélo" },
    });
    expect(view.segments).toEqual([]);
  });
});
