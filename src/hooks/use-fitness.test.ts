import { describe, expect, it } from "vitest";
import { isValidWorkoutDurationMinutes } from "./use-fitness";

describe("isValidWorkoutDurationMinutes", () => {
  it("accepts a strictly positive integer", () => {
    expect(isValidWorkoutDurationMinutes(62)).toBe(true);
    expect(isValidWorkoutDurationMinutes(1)).toBe(true);
  });

  it("rejects zero", () => {
    expect(isValidWorkoutDurationMinutes(0)).toBe(false);
  });

  it("rejects negative values", () => {
    expect(isValidWorkoutDurationMinutes(-10)).toBe(false);
  });

  it("rejects non-integer values", () => {
    expect(isValidWorkoutDurationMinutes(62.5)).toBe(false);
  });

  it("rejects NaN", () => {
    expect(isValidWorkoutDurationMinutes(NaN)).toBe(false);
  });
});
