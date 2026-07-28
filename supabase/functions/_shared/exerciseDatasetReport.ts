// Génération du rapport détaillé du dry-run d'import (demandé par Nathan,
// voir docs/architecture/exercises-dataset-integration.md §11). Zéro I/O,
// zéro dépendance Deno/React — pur formatage à partir des résultats du
// moteur de scoring (`exerciseDatasetMatching.ts`). Réexporté côté frontend
// dans `src/lib/fitness/exerciseDatasetReport.ts` pour être testé avec
// vitest, même convention que les autres modules `_shared/`.
import type { MatchBreakdown, MatchDecision } from "./exerciseDatasetMatching.ts";

export interface DryRunCounts {
  datasetRecords: number;
  autoMerged: number;
  createdNew: number;
  queuedForReview: number;
  skippedNoName: number;
}

export interface AmbiguousMatchEntry {
  datasetName: string;
  matchedExistingName: string | null;
  breakdown: MatchBreakdown;
  score: number;
  decision: MatchDecision;
}

/** Arrondit un score 0..1 en pourcentage entier (ex. 0.864 -> "86 %"). */
export function formatPercent(score: number): string {
  return `${Math.round(score * 100)} %`;
}

const DECISION_LABELS_FR: Record<MatchDecision, string> = {
  auto_merge: "Fusion automatique",
  needs_review: "Validation manuelle",
  create_new: "Création d'un nouvel exercice",
};

export function decisionLabelFr(decision: MatchDecision): string {
  return DECISION_LABELS_FR[decision];
}

/**
 * Formate une correspondance ambiguë au format demandé par Nathan :
 *
 * ```
 * Close Grip Lat Pulldown
 * → Tirage vertical prise serrée
 *
 * Nom : 86 %
 * Muscle principal : 100 %
 * Muscles secondaires : 100 %
 * Équipement : 100 %
 * Catégorie : 100 %
 *
 * Score global : 88 %
 *
 * Décision : Validation manuelle
 * ```
 */
export function formatAmbiguousMatchEntry(entry: AmbiguousMatchEntry): string {
  const lines: string[] = [entry.datasetName];
  lines.push(`→ ${entry.matchedExistingName ?? "(aucune correspondance existante)"}`);
  lines.push("");
  lines.push(`Nom : ${formatPercent(entry.breakdown.name)}`);
  lines.push(`Muscle principal : ${formatPercent(entry.breakdown.musclePrimary)}`);
  lines.push(`Muscles secondaires : ${formatPercent(entry.breakdown.secondaryMuscles)}`);
  lines.push(`Équipement : ${formatPercent(entry.breakdown.equipment)}`);
  lines.push(`Catégorie : ${formatPercent(entry.breakdown.category)}`);
  lines.push("");
  lines.push(`Score global : ${formatPercent(entry.score)}`);
  lines.push("");
  lines.push(`Décision : ${decisionLabelFr(entry.decision)}`);
  return lines.join("\n");
}

/**
 * Rapport complet du dry-run : compteurs globaux + liste intégrale des
 * correspondances ambiguës (une par exercice dataset classé `needs_review`),
 * jamais tronquée — Nathan doit pouvoir examiner CHAQUE cas avant d'autoriser
 * l'import réel (voir doc §11, exigence "liste complète des correspondances
 * ambiguës").
 */
export function buildDryRunReport(
  counts: DryRunCounts,
  ambiguousMatches: AmbiguousMatchEntry[],
  dryRun = true,
): string {
  const header = [
    dryRun
      ? "=== Rapport du dry-run — import-exercises-dataset ==="
      : "=== Rapport de l'import réel — import-exercises-dataset ===",
    "",
    `Exercices analysés : ${counts.datasetRecords}`,
    `Fusionnés automatiquement : ${counts.autoMerged}`,
    `Nouveaux exercices à créer : ${counts.createdNew}`,
    `Nécessitant une validation manuelle : ${counts.queuedForReview}`,
    ...(counts.skippedNoName > 0 ? [`Ignorés (nom vide) : ${counts.skippedNoName}`] : []),
    "",
    dryRun
      ? "Aucune écriture n'a été effectuée en base — ceci est un dry-run."
      : "Écritures effectuées en base — une sauvegarde complète a été prise avant le run (voir runId).",
    "",
  ].join("\n");

  if (ambiguousMatches.length === 0) {
    return `${header}\nAucune correspondance ambiguë à examiner.`;
  }

  const separator = "\n\n---\n\n";
  const entries = ambiguousMatches.map((entry) => formatAmbiguousMatchEntry(entry)).join(separator);

  return [
    header,
    `Correspondances ambiguës à examiner (${ambiguousMatches.length}) :`,
    "",
    entries,
  ].join("\n");
}
