import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows, fetchAllRowsForIds } from "@/lib/supabase/pagedRead";
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

/** Ligne de `exercise_media` telle que lue par les deux hooks ci-dessous. */
interface MediaSelectRow {
  exercise_reference_id: string;
  media_type: string | null;
  url: string | null;
  is_primary: boolean | null;
}

/** Colonnes strictement nécessaires à `CatalogMediaEntry`. */
const MEDIA_COLUMNS = "exercise_reference_id, media_type, url, is_primary";

/** Agrège les lignes média en une carte `exercise_reference_id → entrée`. */
function toMediaMap(rows: MediaSelectRow[]): Map<string, CatalogMediaEntry> {
  const map = new Map<string, CatalogMediaEntry>();
  for (const row of rows) {
    const entry = map.get(row.exercise_reference_id) ?? {
      primaryPhotoUrl: null,
      primaryGifUrl: null,
      hasGif: false,
      hasVideo: false,
    };
    if (row.media_type === "image" && row.is_primary && row.url) entry.primaryPhotoUrl = row.url;
    if (row.media_type === "gif") {
      entry.hasGif = true;
      if (row.is_primary && row.url) entry.primaryGifUrl = row.url;
    }
    if (row.media_type === "video") entry.hasVideo = true;
    map.set(row.exercise_reference_id, entry);
  }
  return map;
}

// ── Médias de TOUTE la bibliothèque — pour le Catalogue/Picker, qui parcourt
//    réellement l'intégralité de `exercise_reference` (liste filtrable). Une
//    lecture d'ensemble y est légitime ; une lecture par ids ne le serait pas
//    (le jeu d'ids change à chaque frappe → refetch en rafale).
//
//    CHANTIER A (AUD-02) : la lecture était NON BORNÉE sur une table de
//    2 566 lignes, donc rabotée en silence par `max-rows` — environ la
//    moitié des exercices perdaient photo et GIF sans que rien ne l'indique.
//    Elle est désormais paginée avec preuve de complétude. Le contenu de la
//    carte est inchangé (mêmes colonnes, même agrégation), simplement
//    COMPLET. ────────────────────────────────────────────────────────────────
/**
 * Lecture serveur extraite du hook pour être testable isolément — cf.
 * `lib/supabase/referentialReadBounds.test.ts`, qui la fait tourner sur une fixture
 * DÉPASSANT le plafond `max-rows`.
 */
export async function fetchCatalogMediaMap(): Promise<Map<string, CatalogMediaEntry>> {
  // `exercise_media` n'est pas encore dans les types générés : cast local.
  // `order("id")` : ordre TOTAL, sans lequel deux pages successives peuvent
  // doublonner une ligne et en omettre une autre.
  const rows = await fetchAllRows<MediaSelectRow>(
    () =>
      (supabase as any)
        .from("exercise_media")
        .select(MEDIA_COLUMNS, { count: "exact" })
        .order("id"),
    { label: "exercise_media" },
  );
  return toMediaMap(rows);
}

export function useExerciseCatalogMedia() {
  return useQuery({
    queryKey: ["fitness", "exercise-catalog-media"],
    staleTime: 5 * 60 * 1000,
    queryFn: fetchCatalogMediaMap,
  });
}

// ── Médias des SEULS exercices affichés — pour un écran qui n'en montre
//    qu'une poignée (séance en cours). Rapatrier 2 566 lignes pour afficher
//    six vignettes était le gaspillage central d'AUD-02.
//
//    La clé de cache porte les ids TRIÉS et DÉDUPLIQUÉS : deux rendus
//    présentant le même ensemble d'exercices, quel que soit leur ordre,
//    partagent la même entrée de cache et ne relancent aucune requête. ─────
export function useExerciseMediaForExercises(exerciseReferenceIds: readonly (string | null)[]) {
  const ids = useMemo(
    () => [...new Set(exerciseReferenceIds.filter((id): id is string => !!id))].sort(),
    [exerciseReferenceIds],
  );
  return useQuery({
    queryKey: ["fitness", "exercise-media-for", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchMediaMapForExercises(ids),
  });
}

/** Pendant testable de `useExerciseMediaForExercises`. */
export async function fetchMediaMapForExercises(
  ids: readonly string[],
): Promise<Map<string, CatalogMediaEntry>> {
  const rows = await fetchAllRowsForIds<MediaSelectRow>(
    ids,
    (idChunk) =>
      (supabase as any)
        .from("exercise_media")
        .select(MEDIA_COLUMNS, { count: "exact" })
        .in("exercise_reference_id", idChunk)
        .order("id"),
    { label: "exercise_media" },
  );
  return toMediaMap(rows);
}

export function useExerciseCatalogEntry(exerciseName: string | null | undefined) {
  return useQuery({
    queryKey: ["fitness", "exercise-catalog-entry", exerciseName ? normalize(exerciseName) : null],
    enabled: !!exerciseName,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ExerciseCatalogEntry | null> => {
      if (!exerciseName) return null;

      // Colonnes `aliases`/`config`/`family_id`/`is_active` et table
      // `exercise_media` absentes des types générés : cast local, shape
      // décrite explicitement ci-dessous.
      const { data: rawRow, error } = await (supabase as any)
        .from("exercise_reference")
        .select(
          "id, name, category, aliases, description, config, family_id, dataset_source, merged_at",
        )
        .eq("discipline_id", "muscu")
        .eq("is_active", true)
        .ilike("name", escapeForIlike(exerciseName.trim()))
        .maybeSingle();
      if (error) throw error;
      if (!rawRow) return null;
      const row = rawRow as {
        id: string;
        name: string;
        category: string | null;
        aliases: string[] | null;
        description: string | null;
        config: Record<string, unknown> | null;
        family_id: string | null;
        dataset_source: string | null;
        merged_at: string | null;
      };

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

      // Les deux lectures sont paginées : leur cardinalité (médias d'un
      // exercice, variantes d'une famille) est faible aujourd'hui mais
      // n'est bornée par aucune contrainte — s'en remettre au plafond
      // serveur les rendrait tronquables en silence le jour où elle grandit.
      const [mediaRows, variantRows] = await Promise.all([
        fetchAllRows<{
          id: string;
          media_type: string | null;
          url: string | null;
          is_primary: boolean | null;
          attribution: string | null;
        }>(
          () =>
            (supabase as any)
              .from("exercise_media")
              .select("id, media_type, url, is_primary, attribution", { count: "exact" })
              .eq("exercise_reference_id", row.id)
              .order("media_type")
              .order("sort_order")
              .order("id"),
          { label: "exercise_media" },
        ),
        row.family_id
          ? fetchAllRows<{ id: string; name: string }>(
              () =>
                (supabase as any)
                  .from("exercise_reference")
                  .select("id, name", { count: "exact" })
                  .eq("family_id", row.family_id)
                  .eq("is_active", true)
                  .neq("id", row.id)
                  .order("name")
                  .order("id"),
              { label: "exercise_reference (variantes)" },
            )
          : Promise.resolve([] as Array<{ id: string; name: string }>),
      ]);

      const media: ExerciseMediaItem[] = mediaRows
        .filter((m): m is typeof m & { url: string } => !!m.url)
        .map((m) => ({
          id: m.id,
          type: m.media_type as ExerciseMediaItem["type"],
          url: m.url,
          isPrimary: !!m.is_primary,
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
        variants: variantRows.map((v) => ({ id: v.id, name: v.name })),
      };
    },
  });
}
