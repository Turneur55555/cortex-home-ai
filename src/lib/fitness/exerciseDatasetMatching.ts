// Réexporte le moteur de correspondance dataset externe depuis sa source
// unique côté Edge Functions (`supabase/functions/_shared/exerciseDatasetMatching.ts`),
// même convention que `src/lib/nutrition/meals.ts` / `_shared/meals.ts` — pas
// de duplication de la logique de scoring entre client et Edge Function.
export {
  normalizeForMatch,
  tokenSetSimilarity,
  scoreCandidate,
  findBestMatch,
  classifyMatch,
  scoreExercisePair,
  buildAliasesForDatasetRecord,
  AUTO_MERGE_THRESHOLD,
  CREATE_NEW_THRESHOLD,
  type MatchDecision,
  type ExistingExerciseForMatch,
  type ExistingExerciseConfigForMatch,
  type DatasetRecordForMatch,
  type MatchResult,
  type MatchBreakdown,
} from "../../../supabase/functions/_shared/exerciseDatasetMatching.ts";
