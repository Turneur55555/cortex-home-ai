// Bibliothèque d'exercices — hooks d'administration (recherche, similarité,
// fusion manuelle, annulation, archivage, restauration, suppression).
// Voir docs/architecture/exercises-dataset-integration.md §14.
//
// Note types.ts : ce fichier interroge des tables/colonnes ajoutées par la
// migration 20260731120000_exercise_library_admin.sql, qui n'a volontairement
// PAS encore été appliquée à la production (voir doc §14 — décision de
// Nathan de ne jamais toucher la prod tant que l'import réel n'est pas
// validé). `types.ts` ne les connaît donc pas encore : les requêtes vers ces
// tables passent par un client non typé (`admin`) le temps que la migration
// soit appliquée et `npm run gen:types` régénéré — à ne PAS garder après coup
// (voir docs/architecture/supabase-types-source-of-truth.md).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  scoreExercisePair,
  type ExistingExerciseForMatch,
} from "@/lib/fitness/exerciseDatasetMatching";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabase as any;

export interface ExerciseMediaRow {
  id: string;
  exercise_reference_id: string;
  media_type: "image" | "gif" | "video";
  url: string | null;
  storage_path: string | null;
  source: "cortex" | "dataset";
  attribution: string | null;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export interface ExerciseRow {
  id: string;
  name: string;
  category: string | null;
  aliases: string[] | null;
  description: string | null;
  config: {
    muscle_group?: string | null;
    secondary_muscles?: string[] | null;
    equipment?: string | null;
  } | null;
  is_active: boolean;
  archived_at: string | null;
  merged_into_id: string | null;
  merged_at: string | null;
  dataset_source: string | null;
  family_id: string | null;
  created_at: string;
}

export interface SimilarityPairRow {
  id: string;
  exercise_id_a: string;
  exercise_id_b: string;
  score: number;
  reasons: string[] | null;
  status: "suggested" | "dismissed" | "merged";
  computed_at: string;
  exerciseA?: ExerciseRow;
  exerciseB?: ExerciseRow;
}

export interface MergeLogRow {
  id: string;
  kept_exercise_id: string;
  archived_exercise_id: string;
  performed_at: string;
  undone_at: string | null;
  keptName?: string;
  archivedName?: string;
}

export interface ExerciseUsageStats {
  sessionCount: number;
  totalUses: number;
}

export interface ExerciseMediaSummary {
  hasPhoto: boolean;
  hasGif: boolean;
  hasVideo: boolean;
}

export type ExerciseOrigin = "cortex" | "dataset" | "merged";
export type LibraryFilter = "all" | "cortex" | "dataset" | "merged" | "archived";

/**
 * Provenance affichée (Cortex / Dataset / Fusionné) — jamais ambiguë.
 * `merged_at` (posé par `merge_exercise_references`, restauré par
 * `undo_exercise_merge`) prévaut sur l'origine d'import d'origine : une
 * fiche dataset qui a ensuite reçu une fusion devient "Fusionné".
 */
export function deriveExerciseOrigin(row: Pick<ExerciseRow, "merged_at" | "dataset_source">): ExerciseOrigin {
  if (row.merged_at) return "merged";
  return row.dataset_source ? "dataset" : "cortex";
}

export interface LibraryStats {
  total: number;
  cortex: number;
  dataset: number;
  merged: number;
  archived: number;
}

/** Statistiques globales de la bibliothèque — lecture directe, RLS "lisible par tous". */
export function useLibraryStats() {
  return useQuery({
    queryKey: ["admin", "library-stats"],
    queryFn: async (): Promise<LibraryStats> => {
      const base = () =>
        admin.from("exercise_reference").select("id", { count: "exact", head: true }).eq("discipline_id", DISCIPLINE);

      const [{ count: total }, { count: archived }, { count: merged }, { count: dataset }, { count: cortex }] =
        await Promise.all([
          base(),
          base().eq("is_active", false),
          base().eq("is_active", true).not("merged_at", "is", null),
          base().eq("is_active", true).is("merged_at", null).not("dataset_source", "is", null),
          base().eq("is_active", true).is("merged_at", null).is("dataset_source", null),
        ]);

      return {
        total: total ?? 0,
        archived: archived ?? 0,
        merged: merged ?? 0,
        dataset: dataset ?? 0,
        cortex: cortex ?? 0,
      };
    },
    staleTime: 15_000,
  });
}

const DISCIPLINE = "muscu";

async function invokeAdminAction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-exercise-actions", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ── Recherche — sur toute la bibliothèque (Cortex + Dataset + Fusionnés),
//    filtrable par provenance. "all" est le comportement par défaut :
//    tous les exercices actifs, quelle que soit leur origine (les archivés
//    ont leur propre filtre dédié, ils n'apparaissent jamais dans "all"). ──
export function useExerciseSearch(query: string, filter: LibraryFilter = "all") {
  return useQuery({
    queryKey: ["admin", "exercises", "search", query, filter],
    queryFn: async (): Promise<ExerciseRow[]> => {
      let q = admin
        .from("exercise_reference")
        .select(
          "id, name, category, aliases, description, config, is_active, archived_at, merged_into_id, merged_at, dataset_source, family_id, created_at",
        )
        .eq("discipline_id", DISCIPLINE)
        .order("name")
        .limit(100);

      if (filter === "archived") {
        q = q.eq("is_active", false);
      } else {
        q = q.eq("is_active", true);
        if (filter === "cortex") q = q.is("merged_at", null).is("dataset_source", null);
        if (filter === "dataset") q = q.is("merged_at", null).not("dataset_source", "is", null);
        if (filter === "merged") q = q.not("merged_at", "is", null);
      }
      if (query.trim()) q = q.ilike("name", `%${query.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ExerciseRow[];
    },
    staleTime: 30_000,
  });
}

// ── Comparaison à la volée (score calculé côté client, jamais persisté) ──
export function compareExercises(a: ExerciseRow, b: ExerciseRow) {
  const toMatchInput = (row: ExerciseRow): ExistingExerciseForMatch => ({
    id: row.id,
    name: row.name,
    category: row.category,
    aliases: row.aliases,
    config: row.config,
  });
  return scoreExercisePair(toMatchInput(a), toMatchInput(b));
}

// ── Médias ────────────────────────────────────────────────────────────────
export function useExerciseMedia(exerciseId: string | null) {
  return useQuery({
    queryKey: ["admin", "exercise-media", exerciseId],
    enabled: !!exerciseId,
    queryFn: async (): Promise<ExerciseMediaRow[]> => {
      const { data, error } = await admin
        .from("exercise_media")
        .select("*")
        .eq("exercise_reference_id", exerciseId)
        .order("media_type")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ExerciseMediaRow[];
    },
  });
}

// ── Statistiques d'usage (nombre de séances, utilisations totales) — passe
//    par admin-exercise-actions (service_role) car `exercises` est protégé
//    par une RLS "propriétaire uniquement" : un accès direct depuis le
//    client n'agrégerait que les séances de la personne connectée, pas
//    l'usage réel de tout Cortex. ─────────────────────────────────────────
export function useExerciseUsageStats(ids: string[]) {
  const sortedIds = [...ids].sort();
  return useQuery({
    queryKey: ["admin", "exercise-usage-stats", sortedIds],
    enabled: sortedIds.length > 0,
    queryFn: async (): Promise<Record<string, ExerciseUsageStats>> => {
      const data = await invokeAdminAction<{ stats: Record<string, ExerciseUsageStats> }>({
        action: "usage_stats",
        ids: sortedIds,
      });
      return data.stats;
    },
    staleTime: 30_000,
  });
}

// ── Présence de médias (photo/gif/vidéo) par exercice — `exercise_media`
//    est lisible par tout le monde (voir migration), pas besoin de passer
//    par le service_role ici. ─────────────────────────────────────────────
export function useExerciseMediaSummary(ids: string[]) {
  const sortedIds = [...ids].sort();
  return useQuery({
    queryKey: ["admin", "exercise-media-summary", sortedIds],
    enabled: sortedIds.length > 0,
    queryFn: async (): Promise<Record<string, ExerciseMediaSummary>> => {
      const { data, error } = await admin
        .from("exercise_media")
        .select("exercise_reference_id, media_type")
        .in("exercise_reference_id", sortedIds);
      if (error) throw error;
      const summary: Record<string, ExerciseMediaSummary> = {};
      for (const id of sortedIds) summary[id] = { hasPhoto: false, hasGif: false, hasVideo: false };
      for (const row of (data ?? []) as Array<{ exercise_reference_id: string; media_type: string }>) {
        const entry = summary[row.exercise_reference_id];
        if (!entry) continue;
        if (row.media_type === "image") entry.hasPhoto = true;
        if (row.media_type === "gif") entry.hasGif = true;
        if (row.media_type === "video") entry.hasVideo = true;
      }
      return summary;
    },
    staleTime: 30_000,
  });
}

// ── Suggestions de similarité ────────────────────────────────────────────
export function useSimilarityPairs(status: "suggested" | "dismissed" | "merged" = "suggested") {
  return useQuery({
    queryKey: ["admin", "similarity-pairs", status],
    queryFn: async (): Promise<SimilarityPairRow[]> => {
      const { data, error } = await admin
        .from("exercise_similarity_pairs")
        .select(
          "*, exerciseA:exercise_id_a(id, name, category), exerciseB:exercise_id_b(id, name, category)",
        )
        .eq("status", status)
        .order("score", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as SimilarityPairRow[];
    },
    staleTime: 30_000,
  });
}

// ── Journal de fusions ────────────────────────────────────────────────────
export function useMergeLog() {
  return useQuery({
    queryKey: ["admin", "merge-log"],
    queryFn: async (): Promise<MergeLogRow[]> => {
      const { data, error } = await admin
        .from("exercise_merge_log")
        .select(
          "id, kept_exercise_id, archived_exercise_id, performed_at, undone_at, kept:kept_exercise_id(name), archived:archived_exercise_id(name)",
        )
        .order("performed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        kept_exercise_id: row.kept_exercise_id as string,
        archived_exercise_id: row.archived_exercise_id as string,
        performed_at: row.performed_at as string,
        undone_at: row.undone_at as string | null,
        keptName: (row.kept as { name?: string } | null)?.name,
        archivedName: (row.archived as { name?: string } | null)?.name,
      }));
    },
    staleTime: 15_000,
  });
}

export interface ImportDatasetSummary {
  datasetRecords: number;
  technicalDuplicatesSkipped: number;
  skippedNoName: number;
  createdIndependentFiches: number;
  dryRun: boolean;
  runId: string | null;
  errors: string[];
}

// ── Import du dataset externe — bouton "Importer le dataset" de l'onglet
//    dédié. dry_run:true (comportement par défaut du hook) n'écrit jamais
//    rien, seulement un résumé ; dry_run:false crée réellement les fiches
//    (voir import-exercises-dataset). Passe par requireAdminOrCron (même
//    edge function que le job batch), pas admin-exercise-actions. ────────
export function useImportDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dryRun: boolean): Promise<ImportDatasetSummary> => {
      const { data, error } = await supabase.functions.invoke("import-exercises-dataset", {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ImportDatasetSummary;
    },
    onSuccess: (summary) => {
      if (!summary.dryRun) {
        qc.invalidateQueries({ queryKey: ["admin", "exercises"] });
        qc.invalidateQueries({ queryKey: ["admin", "library-stats"] });
      }
    },
  });
}

export interface DetectSimilaritiesSummary {
  exercisesAnalyzed: number;
  pairsFound: number;
  dryRun: boolean;
  written: number;
  skippedAlreadyDecided: number;
  errors: string[];
}

// ── Détection de similarité — bouton "Lancer la détection de similarité",
//    typiquement après un import réel, pour peupler l'onglet "Suggestions". ─
export function useDetectSimilarities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dryRun: boolean): Promise<DetectSimilaritiesSummary> => {
      const { data, error } = await supabase.functions.invoke("detect-exercise-similarities", {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as DetectSimilaritiesSummary;
    },
    onSuccess: (summary) => {
      if (!summary.dryRun) qc.invalidateQueries({ queryKey: ["admin", "similarity-pairs"] });
    },
  });
}

// ── Mutations (toutes passent par l'edge function admin-exercise-actions,
//    jamais un accès direct en écriture depuis le client) ────────────────
function useAdminMutation<TArgs>(action: string, invalidateKeys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => invokeAdminAction<Record<string, unknown>>({ action, ...args }),
    onSuccess: () => {
      invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

export function useMergeExercises() {
  return useAdminMutation<{ keep_id: string; archive_id: string }>("merge", [
    ["admin", "exercises"],
    ["admin", "similarity-pairs"],
    ["admin", "merge-log"],
  ]);
}

export function useUndoMerge() {
  return useAdminMutation<{ merge_log_id: string }>("undo_merge", [
    ["admin", "exercises"],
    ["admin", "similarity-pairs"],
    ["admin", "merge-log"],
  ]);
}

export function useArchiveExercise() {
  return useAdminMutation<{ id: string }>("archive", [["admin", "exercises"]]);
}

export function useRestoreExercise() {
  return useAdminMutation<{ id: string }>("restore", [["admin", "exercises"]]);
}

export function useDeleteExercise() {
  return useAdminMutation<{ id: string }>("delete", [["admin", "exercises"]]);
}

export function useDismissSimilarityPair() {
  return useAdminMutation<{ pair_id: string }>("dismiss_pair", [["admin", "similarity-pairs"]]);
}
