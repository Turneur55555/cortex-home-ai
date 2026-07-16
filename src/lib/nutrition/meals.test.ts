import { describe, it, expect } from "vitest";
import {
  MEAL_SLUGS,
  MEAL_LABELS,
  MEAL_OPTIONS,
  isMealSlug,
  clampMacroSet,
  scalePer100,
} from "./meals";

describe("MEAL_SLUGS", () => {
  it("contains exactly the 5 slugs the DB constraint accepts for new rows", () => {
    expect(MEAL_SLUGS).toEqual(["petit-dej", "dejeuner", "gouter", "diner", "collation"]);
  });

  it("every slug has a French label", () => {
    for (const slug of MEAL_SLUGS) {
      expect(MEAL_LABELS[slug], `missing label for "${slug}"`).toBeTruthy();
    }
  });

  it("MEAL_OPTIONS mirrors MEAL_SLUGS 1:1, in order", () => {
    expect(MEAL_OPTIONS.map((o) => o.value)).toEqual([...MEAL_SLUGS]);
  });
});

describe("isMealSlug — every valid slug", () => {
  it.each(MEAL_SLUGS)("accepts %s", (slug) => {
    expect(isMealSlug(slug)).toBe(true);
  });
});

describe("isMealSlug — invalid values", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["leading/trailing whitespace around a valid slug", " gouter "],
    ["wrong casing", "Gouter"],
    ["accented form (label, not slug)", "goûter"],
    ["capitalized French label", "Petit-déjeuner"],
    ["English translation", "snack"],
    ["legacy DB-only alias (accepted by the constraint, not by the app)", "petit-dejeuner"],
    ["unrelated string", "not-a-meal"],
    ["numeric-looking string", "123"],
    ["SQL-injection-shaped string", "'; DROP TABLE nutrition; --"],
  ] as const)("rejects %s (%p)", (_label, value) => {
    expect(isMealSlug(value)).toBe(false);
  });
});

describe("clampMacroSet", () => {
  it("clamps calories to MAX_CALORIES and macros to MAX_MACRO", () => {
    expect(clampMacroSet({ calories: 99999, proteins: 5000, carbs: 5000, fats: 5000 })).toEqual({
      calories: 10000,
      proteins: 1000,
      carbs: 1000,
      fats: 1000,
    });
  });

  it("floors negative/NaN/Infinity values to 0", () => {
    expect(
      clampMacroSet({ calories: -5, proteins: NaN, carbs: -Infinity, fats: Infinity }),
    ).toEqual({
      calories: 0,
      proteins: 0,
      carbs: 0,
      fats: 0,
    });
  });
});

describe("scalePer100", () => {
  it("scales a per-100g value to an arbitrary gram amount", () => {
    expect(scalePer100(200, 150)).toBe(300);
  });

  it("passes null through", () => {
    expect(scalePer100(null, 150)).toBeNull();
  });
});
