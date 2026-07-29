import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalize } from "@/lib/fitness/exerciseCatalog";

// ============================================================
// Fiche exercice V2 — point d'entrée unique vers les données "catalogue"
// (exercise_reference + exercise_media + variantes de famille), quelle que
// soit l'origine de l'exercice (Cortex historique, importé du dataset,
// fusionné). Complète useExerciseAnalysis/useExerciseProgression (qui
// restent la source de l'historique utilisateur) sans les remplacer — les
// deux se combinent dans la nouvelle fiche.
//
// Résolution par nom (ilike, sans wildcard = comparaison exacte insensible
// à la casse) : même stratégie que resolveExerciseId
// (services/exerciseResolution.ts), pour rester cohérent avec le reste du
// domaine. Un exercice personnalisé (aucune ligne exercise_reference)
// retourne simplement `null` — la fiche doit alors se contenter des
// données de progression, jamais planter ni inventer de contenu.
// ============================================================

export interface ExerciseMediaItem {
  id: string;
  type: "image" | "gif" | "video";
  url: string;
  isPrimary: boolean;
  attribution: string | null;
}

export interface ExerciseVariantRef {
  id: string;
  name: string;
}

export type ExerciseCatalogOrigin = "cortex" | "dataset" | "merged";

export interface ExerciseCatalogEntry {
  id: string;
  name: string;
  category: string | null;
  aliases: string[];
  description: string | null;
  secondaryMuscles: string[];
  equipment: string | null;
  instructionSteps: string[];
  origin: ExerciseCatalogOrigin;
  media: ExerciseMediaItem[];
  variants: ExerciseVariantRef[];
}

function deriveOrigin(row: {
  merged_at: string | null;
  dataset_source: string | null;
}): ExerciseCatalogOrigin {
  if (row.merged_at) return "merged";
  return row.dataset_source ? "dataset" : "cortex";
}

function escapeForIlike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export interface CatalogMediaEntry {
  primaryPhotoUrl: string | null;
  primaryGifUrl: string | null;
  hasGif: boolean;
  hasVideo: boolean;
}

// ── Médias du catalogue — une seule requête pour toute la bibliothèque
//    (exercise_media est petit, ~2500 lignes) plutôt qu'une requête par
//    exercice affiché. Utilisé par ExerciseListBrowser (Catalogue/Picker) ET
//    ActiveExerciseCard (carte de séance) pour remplacer l'icône générique
//    par le vrai média du dataset (photo, puis GIF) dès qu'il existe. ──────
export function useExerciseCatalogMedia() {
  return useQuery({
    queryKey: ["fitness", "exercise-catalog-media"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, CatalogMediaEntry>> => {
      const { data, error } = await supabase
        .from("exercise_media")
        .select("exercise_reference_id, media_type, url, is_primary");
      if (error) throw error;
      const map = new Map<string, CatalogMediaEntry>();
      for (const row of data ?? []) {
        const entry = map.get(row.exercise_reference_id) ?? {
          primaryPhotoUrl: null,
          primaryGifUrl: null,
          hasGif: false,
          hasVideo: false,
        };
        if (row.media_type === "image" && row.is_primary && row.url)
          entry.primaryPhotoUrl = row.url;
        if (row.media_type === "gif") {
          entry.hasGif = true;
          if (row.is_primary && row.url) entry.primaryGifUrl = row.url;
        }
        if (row.media_type === "video") entry.hasVideo = true;
        map.set(row.exercise_reference_id, entry);
      }
      return map;
    },
  });
}

export function useExerciseCatalogEntry(exerciseName: string | null | undefined) {
  return useQuery({
    queryKey: ["fitness", "exercise-catalog-entry", exerciseName ? normalize(exerciseName) : null],
    enabled: !!exerciseName,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ExerciseCatalogEntry | null> => {
      if (!exerciseName) return null;

      const { data: row, error } = await supabase
        .from("exercise_reference")
        .select(
          "id, name, category, aliases, description, config, family_id, dataset_source, merged_at",
        )
        .eq("discipline_id", "muscu")
        .eq("is_active", true)
        .ilike("name", escapeForIlike(exerciseName.trim()))
        .maybeSingle();
      if (error) throw error;
      if (!row) return null;

      const config = (row.config ?? {}) as Record<string, unknown>;
      const secondaryMuscles = Array.isArray(config.secondary_muscles)
        ? (config.secondary_muscles as unknown[]).filter((v): v is string => typeof v === "string")
        : [];
      const equipment = typeof config.equipment === "string" ? config.equipment : null;
      const instructionSteps = Array.isArray(config.instruction_steps_fr)
        ? (config.instruction_steps_fr as unknown[]).filter(
            (v): v is string => typeof v === "string",
          )
        : [];

      const [mediaResult, variantsResult] = await Promise.all([
        supabase
          .from("exercise_media")
          .select("id, media_type, url, is_primary, attribution")
          .eq("exercise_reference_id", row.id)
          .order("media_type")
          .order("sort_order"),
        row.family_id
          ? supabase
              .from("exercise_reference")
              .select("id, name")
              .eq("family_id", row.family_id)
              .eq("is_active", true)
              .neq("id", row.id)
              .order("name")
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
      ]);
      if (mediaResult.error) throw mediaResult.error;
      if (variantsResult.error) throw variantsResult.error;

      const media: ExerciseMediaItem[] = (mediaResult.data ?? [])
        .filter((m): m is typeof m & { url: string } => !!m.url)
        .map((m) => ({
          id: m.id,
          type: m.media_type as ExerciseMediaItem["type"],
          url: m.url,
          isPrimary: m.is_primary,
          attribution: m.attribution,
        }));

      return {
        id: row.id,
        name: row.name,
        category: row.category,
        aliases: row.aliases ?? [],
        description: row.description,
        secondaryMuscles,
        equipment,
        instructionSteps,
        origin: deriveOrigin(row),
        media,
        variants: (variantsResult.data ?? []).map((v) => ({ id: v.id, name: v.name })),
      };
    },
  });
}
