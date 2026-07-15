import { describe, expect, it } from "vitest";
import {
  baseSummaryStats,
  genericBuildLiveSegments,
  genericFormatLiveSegment,
  segmentsFromMetadata,
} from "./sessionViewHelpers";
import type { LiveSegmentRow, WorkoutRecordDraft, WorkoutTemplate } from "./types";

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

describe("genericBuildLiveSegments", () => {
  it("convertit template.segments en seeds, en reprenant le miroir metrics", () => {
    const template: WorkoutTemplate = {
      name: "Rameur",
      exercises: [],
      segments: [
        {
          label: "Rameur",
          stats: [{ label: "Distance", value: "800 m" }],
          metrics: { distance_m: 800 },
        },
      ],
    };
    const draft: WorkoutRecordDraft = {
      discipline: "cardio",
      name: "Rameur",
      duration_minutes: 30,
    };
    expect(genericBuildLiveSegments(template, draft)).toEqual([
      { label: "Rameur", metrics: { distance_m: 800 } },
    ]);
  });

  it("retombe sur metrics: {} quand le segment n'en a pas (ex: Autre activité générée par l'IA)", () => {
    const template: WorkoutTemplate = {
      name: "Escalade",
      exercises: [],
      segments: [{ label: "Échauffement", stats: [{ label: "Durée", value: "10 min" }] }],
    };
    const draft: WorkoutRecordDraft = {
      discipline: "autre",
      name: "Escalade",
      duration_minutes: 60,
    };
    expect(genericBuildLiveSegments(template, draft)).toEqual([
      { label: "Échauffement", metrics: {} },
    ]);
  });

  it("retourne [] si le template n'a pas de segments", () => {
    const template: WorkoutTemplate = { name: "Vide", exercises: [] };
    const draft: WorkoutRecordDraft = { discipline: "cardio", name: "Vide", duration_minutes: 0 };
    expect(genericBuildLiveSegments(template, draft)).toEqual([]);
  });
});

describe("genericFormatLiveSegment", () => {
  it("reformate un segment live complété en SessionSegment (stats texte + miroir numérique)", () => {
    const row: LiveSegmentRow = {
      id: "1",
      label: "Rameur",
      metrics: { distance_m: 850, note: "dur" },
      completed: true,
      position: 0,
    };
    expect(genericFormatLiveSegment(row)).toEqual({
      label: "Rameur",
      stats: [
        { label: "distance_m", value: "850" },
        { label: "note", value: "dur" },
        { label: "Statut", value: "Réalisé" },
      ],
      metrics: { distance_m: 850 },
    });
  });

  it("omet le statut Réalisé quand le segment n'est pas complété", () => {
    const row: LiveSegmentRow = {
      id: "2",
      label: "Wall Balls",
      metrics: {},
      completed: false,
      position: 1,
    };
    expect(genericFormatLiveSegment(row)).toEqual({ label: "Wall Balls", stats: [], metrics: {} });
  });
});
