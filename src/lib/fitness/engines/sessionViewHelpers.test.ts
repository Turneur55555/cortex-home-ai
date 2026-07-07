import { describe, expect, it } from "vitest";
import { baseSummaryStats, segmentsFromMetadata } from "./sessionViewHelpers";
import type { WorkoutRecordDraft } from "./types";

describe("segmentsFromMetadata", () => {
  it("relit metadata.segments tel quel", () => {
    const record: WorkoutRecordDraft = {
      discipline: "cardio",
      name: "X",
      duration_minutes: 10,
      metadata: { segments: [{ label: "Vélo", stats: [] }] },
    };
    expect(segmentsFromMetadata(record)).toEqual([{ label: "Vélo", stats: [] }]);
  });

  it("retombe sur [] si metadata.segments est absent ou malformé", () => {
    expect(segmentsFromMetadata({ discipline: "cardio", name: "X", duration_minutes: 10 })).toEqual(
      [],
    );
    expect(
      segmentsFromMetadata({
        discipline: "cardio",
        name: "X",
        duration_minutes: 10,
        metadata: { segments: "pas un tableau" },
      }),
    ).toEqual([]);
  });
});

describe("baseSummaryStats", () => {
  it("préfixe toujours par la durée, puis les stats additionnelles", () => {
    const record: WorkoutRecordDraft = { discipline: "cardio", name: "X", duration_minutes: 25 };
    expect(baseSummaryStats(record, [{ label: "Activité", value: "Rameur" }])).toEqual([
      { label: "Durée", value: "25 min" },
      { label: "Activité", value: "Rameur" },
    ]);
  });

  it("fonctionne sans stats additionnelles", () => {
    const record: WorkoutRecordDraft = { discipline: "cardio", name: "X", duration_minutes: 25 };
    expect(baseSummaryStats(record)).toEqual([{ label: "Durée", value: "25 min" }]);
  });
});
