import { describe, expect, it } from "vitest";
import { computeHeartRateZones, formatZoneRange } from "./heartRateZones";

describe("computeHeartRateZones", () => {
  it("computes 5 zones from a max heart rate", () => {
    const zones = computeHeartRateZones(190);
    expect(zones).toHaveLength(5);
    expect(zones[1]).toEqual({ zone: 2, label: "Z2 — Endurance fondamentale", minBpm: 114, maxBpm: 133 });
  });

  it("returns an empty array for an invalid max heart rate", () => {
    expect(computeHeartRateZones(0)).toEqual([]);
    expect(computeHeartRateZones(NaN)).toEqual([]);
  });
});

describe("formatZoneRange", () => {
  it("formats a zone label with its bpm range when max HR is known", () => {
    expect(formatZoneRange(190, 2)).toBe("Z2 — Endurance fondamentale (114-133 bpm)");
  });

  it("returns undefined when max heart rate is not provided", () => {
    expect(formatZoneRange(undefined, 2)).toBeUndefined();
  });
});
