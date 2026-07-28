// Réexporte le filtre de doublons techniques depuis sa source unique côté
// Edge Functions (`supabase/functions/_shared/exerciseDatasetDedup.ts`).
export {
  stripDemoQualifiers,
  deduplicateDatasetRecords,
  type DedupInput,
  type DedupResult,
} from "../../../supabase/functions/_shared/exerciseDatasetDedup.ts";
