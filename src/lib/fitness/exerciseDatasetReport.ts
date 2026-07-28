// Réexporte le générateur de rapport de dry-run depuis sa source unique côté
// Edge Functions (`supabase/functions/_shared/exerciseDatasetReport.ts`),
// même convention que les autres modules `exerciseDataset*`.
export {
  formatPercent,
  decisionLabelFr,
  formatAmbiguousMatchEntry,
  buildDryRunReport,
  type DryRunCounts,
  type AmbiguousMatchEntry,
} from "../../../supabase/functions/_shared/exerciseDatasetReport.ts";
