import { describe, expect, it } from "vitest";
import {
  formatPercent,
  decisionLabelFr,
  formatAmbiguousMatchEntry,
  buildDryRunReport,
  type AmbiguousMatchEntry,
} from "./exerciseDatasetReport";
import type { MatchBreakdown } from "./exerciseDatasetMatching";

function breakdown(overrides: Partial<MatchBreakdown> = {}): MatchBreakdown {
  return {
    name: 1,
    musclePrimary: 1,
    secondaryMuscles: 1,
    equipment: 1,
    category: 1,
    ...overrides,
  };
}

describe("formatPercent", () => {
  it("arrondit un score 0..1 en pourcentage entier", () => {
    expect(formatPercent(0.864)).toBe("86 %");
    expect(formatPercent(1)).toBe("100 %");
    expect(formatPercent(0)).toBe("0 %");
  });
});

describe("decisionLabelFr", () => {
  it("traduit chaque décision en français", () => {
    expect(decisionLabelFr("auto_merge")).toBe("Fusion automatique");
    expect(decisionLabelFr("needs_review")).toBe("Validation manuelle");
    expect(decisionLabelFr("create_new")).toBe("Création d'un nouvel exercice");
  });
});

describe("formatAmbiguousMatchEntry", () => {
  it("formate une correspondance ambiguë au format attendu par Nathan", () => {
    const entry: AmbiguousMatchEntry = {
      datasetName: "Close Grip Lat Pulldown",
      matchedExistingName: "Tirage vertical prise serrée",
      breakdown: breakdown({ name: 0.86 }),
      score: 0.88,
      decision: "needs_review",
    };
    const text = formatAmbiguousMatchEntry(entry);
    expect(text).toContain("Close Grip Lat Pulldown");
    expect(text).toContain("→ Tirage vertical prise serrée");
    expect(text).toContain("Nom : 86 %");
    expect(text).toContain("Muscle principal : 100 %");
    expect(text).toContain("Muscles secondaires : 100 %");
    expect(text).toContain("Équipement : 100 %");
    expect(text).toContain("Catégorie : 100 %");
    expect(text).toContain("Score global : 88 %");
    expect(text).toContain("Décision : Validation manuelle");
  });

  it("gère l'absence de correspondance existante", () => {
    const entry: AmbiguousMatchEntry = {
      datasetName: "Some Exercise",
      matchedExistingName: null,
      breakdown: breakdown({
        name: 0.5,
        musclePrimary: 0,
        secondaryMuscles: 0,
        equipment: 0,
        category: 0,
      }),
      score: 0.5,
      decision: "needs_review",
    };
    expect(formatAmbiguousMatchEntry(entry)).toContain("(aucune correspondance existante)");
  });
});

describe("buildDryRunReport", () => {
  it("inclut les compteurs globaux et mentionne l'absence d'écriture", () => {
    const report = buildDryRunReport(
      {
        datasetRecords: 1324,
        autoMerged: 400,
        createdNew: 700,
        queuedForReview: 224,
        skippedNoName: 0,
      },
      [],
    );
    expect(report).toContain("Exercices analysés : 1324");
    expect(report).toContain("Fusionnés automatiquement : 400");
    expect(report).toContain("Nouveaux exercices à créer : 700");
    expect(report).toContain("Nécessitant une validation manuelle : 224");
    expect(report).toContain("Aucune écriture n'a été effectuée en base");
    expect(report).toContain("Aucune correspondance ambiguë à examiner.");
  });

  it("liste intégralement toutes les correspondances ambiguës, jamais tronquée", () => {
    const entries: AmbiguousMatchEntry[] = Array.from({ length: 5 }, (_, i) => ({
      datasetName: `Exercise ${i}`,
      matchedExistingName: `Exercice ${i}`,
      breakdown: breakdown(),
      score: 0.5,
      decision: "needs_review" as const,
    }));
    const report = buildDryRunReport(
      { datasetRecords: 5, autoMerged: 0, createdNew: 0, queuedForReview: 5, skippedNoName: 0 },
      entries,
    );
    for (const entry of entries) {
      expect(report).toContain(entry.datasetName);
    }
    expect(report).toContain("Correspondances ambiguës à examiner (5)");
  });

  it("mentionne les exercices ignorés (nom vide) uniquement s'il y en a", () => {
    const withSkipped = buildDryRunReport(
      { datasetRecords: 10, autoMerged: 0, createdNew: 0, queuedForReview: 0, skippedNoName: 2 },
      [],
    );
    expect(withSkipped).toContain("Ignorés (nom vide) : 2");

    const withoutSkipped = buildDryRunReport(
      { datasetRecords: 10, autoMerged: 0, createdNew: 0, queuedForReview: 0, skippedNoName: 0 },
      [],
    );
    expect(withoutSkipped).not.toContain("Ignorés");
  });

  it("distingue le libellé dry-run du libellé run réel", () => {
    const counts = {
      datasetRecords: 1,
      autoMerged: 1,
      createdNew: 0,
      queuedForReview: 0,
      skippedNoName: 0,
    };
    const dryRunReport = buildDryRunReport(counts, [], true);
    expect(dryRunReport).toContain("Aucune écriture n'a été effectuée en base");
    expect(dryRunReport).not.toContain("Écritures effectuées en base");

    const realRunReport = buildDryRunReport(counts, [], false);
    expect(realRunReport).toContain("Écritures effectuées en base");
    expect(realRunReport).not.toContain("Aucune écriture n'a été effectuée en base");
  });
});
