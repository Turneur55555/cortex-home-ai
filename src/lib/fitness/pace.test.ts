import { describe, expect, it } from "vitest";
import { distanceForDuration, formatPace } from "./pace";

describe("formatPace", () => {
  it("formats a decimal min/km pace as mm:ss /km", () => {
    expect(formatPace(5.5)).toBe("5:30 /km");
    expect(formatPace(4)).toBe("4:00 /km");
    expect(formatPace(6.25)).toBe("6:15 /km");
  });

  it("returns a placeholder for invalid paces", () => {
    expect(formatPace(0)).toBe("—");
    expect(formatPace(-1)).toBe("—");
    expect(formatPace(NaN)).toBe("—");
  });
});

describe("distanceForDuration", () => {
  it("derives distance from duration and pace", () => {
    expect(distanceForDuration(30, 6)).toBe(5);
    expect(distanceForDuration(45, 6)).toBe(7.5);
  });

  it("returns 0 for an invalid pace", () => {
    expect(distanceForDuration(30, 0)).toBe(0);
  });
});
