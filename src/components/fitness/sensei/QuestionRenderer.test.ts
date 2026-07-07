import { describe, expect, it } from "vitest";
import { formatAnswerForSummary, isAnswerValid } from "./QuestionRenderer";
import type { SenseiQuestionSpec } from "@/lib/fitness/engines/types";

const singleChoice: SenseiQuestionSpec = {
  id: "goal",
  prompt: "Objectif ?",
  type: "single-choice",
  options: [
    { value: "force", label: "Force" },
    { value: "hypertrophie", label: "Hypertrophie" },
  ],
};

const multiChoice: SenseiQuestionSpec = {
  id: "muscles",
  prompt: "Muscles ?",
  type: "multi-choice",
};

describe("formatAnswerForSummary", () => {
  it("résout le libellé via question.options quand disponible", () => {
    expect(formatAnswerForSummary(singleChoice, "force")).toBe("Force");
  });

  it("retombe sur la valeur brute si aucun libellé ne correspond (ex: muscles, sans options)", () => {
    expect(formatAnswerForSummary(multiChoice, ["pectoraux", "dos"])).toBe("pectoraux, dos");
  });

  it("affiche un tiret pour une valeur absente ou vide", () => {
    expect(formatAnswerForSummary(singleChoice, undefined)).toBe("—");
    expect(formatAnswerForSummary(multiChoice, [])).toBe("—");
  });
});

describe("isAnswerValid", () => {
  it("exige au moins une sélection pour un multi-choice", () => {
    expect(isAnswerValid(multiChoice, [])).toBe(false);
    expect(isAnswerValid(multiChoice, ["pectoraux"])).toBe(true);
  });

  it("accepte toute valeur définie pour les autres types", () => {
    expect(isAnswerValid(singleChoice, undefined)).toBe(false);
    expect(isAnswerValid(singleChoice, "force")).toBe(true);
  });
});
