import { describe, expect, it } from "vitest";
import { GuidedActivityEngine } from "./guidedEngine";
import type { SenseiAnswers } from "./types";

describe("GuidedActivityEngine.questions", () => {
  it("propose les 4 activités encadrées, sans branchement conditionnel (pas de sous-type par activité)", () => {
    const activityQuestion = GuidedActivityEngine.questions.find((q) => q.id === "activity");
    expect(activityQuestion?.options?.map((o) => o.value)).toEqual([
      "Pilates Lagree",
      "Yoga",
      "Mobilité",
      "Stretching",
    ]);
  });

  it("réutilise les fragments partagés niveau/durée/lieu (un cours se prend en salle)", () => {
    const ids = GuidedActivityEngine.questions.map((q) => q.id);
    expect(ids).toEqual(["activity", "level", "duration_minutes", "gym_location"]);
  });
});

describe("GuidedActivityEngine.generate — fiche descriptive, jamais une séance inventée", () => {
  it("ne produit ni séries/répétitions/charge, ni distance/allure — uniquement du descriptif", async () => {
    const tpl = await GuidedActivityEngine.generate({
      activity: "Pilates Lagree",
      level: "intermédiaire",
      duration_minutes: 45,
    });
    expect(tpl.exercises).toEqual([]);
    expect(tpl.segments).toHaveLength(1);
    const labels = tpl.segments![0].stats.map((s) => s.label);
    expect(labels).toEqual(["Groupes sollicités", "Bénéfices attendus"]);
    expect(labels).not.toContain("Séries");
    expect(labels).not.toContain("Distance");
    expect(labels).not.toContain("Allure cible");
  });

  it("chaque activité a son propre profil descriptif (intensité/groupes/bénéfices distincts)", async () => {
    const results = await Promise.all(
      (["Pilates Lagree", "Yoga", "Mobilité", "Stretching"] as const).map((activity) =>
        GuidedActivityEngine.generate({ activity, level: "débutant", duration_minutes: 30 }),
      ),
    );
    const musclesLabels = results.map(
      (r) => r.segments![0].stats.find((s) => s.label === "Groupes sollicités")?.value,
    );
    expect(new Set(musclesLabels).size).toBe(4); // 4 profils distincts
  });
});

describe("GuidedActivityEngine.toWorkoutRecord / toSessionView", () => {
  it("ne produit jamais exerciseRows ; transporte intensité, calories et récupération estimées", async () => {
    const answers: SenseiAnswers = {
      activity: "Yoga",
      level: "débutant",
      duration_minutes: 60,
      gym_location: "Keep Cool",
    };
    const template = await GuidedActivityEngine.generate(answers);
    const draft = GuidedActivityEngine.toWorkoutRecord(template, answers);

    expect(draft.discipline).toBe("guided");
    expect(draft.exerciseRows).toBeUndefined();
    expect(draft.gym_location).toBe("Keep Cool");
    expect(draft.metadata).toMatchObject({
      activity: "Yoga",
      intensityLabel: "Faible à modérée",
      caloriesEstimate: 180, // 3 kcal/min x 60 min
      recoveryHoursEstimate: 12,
    });

    const view = GuidedActivityEngine.toSessionView(draft);
    expect(view.segments).toEqual(template.segments);
    expect(view.summaryStats).toEqual(
      expect.arrayContaining([
        { label: "Intensité estimée", value: "Faible à modérée" },
        { label: "Calories estimées", value: "~180 kcal" },
        { label: "Récupération conseillée", value: "~12 h" },
      ]),
    );
  });

  it("feedsRankEngine=false et cardVariant='guided-session' (posé en phase 1, enfin consommé)", () => {
    expect(GuidedActivityEngine.feedsRankEngine).toBe(false);
    expect(GuidedActivityEngine.historyPresentation.cardVariant).toBe("guided-session");
  });
});
