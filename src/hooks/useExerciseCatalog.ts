import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import { EXERCISE_CATALOG, type CatalogExercise } from "@/lib/fitness/exerciseCatalog";
import type { DisciplineId } from "@/lib/fitness/engines/types";

export type DbCatalogRow = {
  id: string;
  name: string;
  category: string | null;
  sort_order: number;
  created_at: string;
  // Additif (dataset externe hasaneyldrm/exercises-dataset, voir
  // docs/architecture/exercises-dataset-integration.md) : absents (undefined)
  // pour les exercices non enrichis, jamais requis par l'affichage existant.
  aliases?: string[] | null;
  media?: unknown;
  description?: string | null;
  config?: { equipment?: string | null } | null;
  /**
   * Correctif de sécurité CTX-06 (audit du 16/08/2026) : `exercise_reference`
   * est un catalogue PARTAGÉ, désormais en lecture seule côté client. Seules
   * les lignes créées par l'utilisateur (table `user_exercise_reference`)
   * portent `owned: true` et restent modifiables/supprimables — l'interface
   * s'appuie sur ce drapeau pour n'exposer « Modifier » et « Supprimer » que
   * là où l'écriture aboutira réellement.
   */
  owned?: boolean;
};

/**
 * Le catalogue personnel n'est pas encore présent dans `types.ts` (régénéré
 * depuis la base, cf. docs/architecture/supabase-types-source-of-truth.md).
 * On passe donc par l'échappatoire `db` prévue par le projet — même client,
 * même session, même RLS — plutôt que d'éditer `types.ts` à la main.
 */
const USER_CATALOG_TABLE = "user_exercise_reference";

const CACHE_KEY = ["fitness", "exercise-catalog"] as const;
const FULL_CACHE_KEY = ["fitness", "exercise-catalog-full"] as const;

// ── Catalogue DB (pour le picker) ─────────────────────────────────────────────
// Filtré sur discipline_id="muscu" : depuis Phase 3 (exercice-central),
// exercise_reference est un référentiel partagé par toutes les disciplines
// (voir ExerciseResolutionService) — ce picker reste muscu-only, il ne doit
// jamais afficher les exercices auto-créés par les autres disciplines.
export function useExerciseCatalog() {
  return useQuery({
    queryKey: CACHE_KEY,
    queryFn: async (): Promise<DbCatalogRow[]> => {
      const { data, error } = await supabase
        .from("exercise_reference")
        .select("*")
        .eq("discipline_id", "muscu")
        .order("category")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as DbCatalogRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Catalogue complet = DB + exercices custom (pour la sheet de gestion) ─────
// Phase B (2026-07-15) : paramétré par discipline (défaut "muscu",
// comportement identique à avant pour tous les appelants existants) — voir
// docs/architecture/phase-b-carte-exercice-unique.md. La fusion avec les
// exercices "custom" de la table `exercises` (2e requête ci-dessous) reste
// muscu-only : cette table ne contient QUE des occurrences musculation
// (voir exercise-central-architecture.md section 2.3), aucun équivalent
// pour les autres disciplines à ce jour.
export function useFullExerciseCatalog(discipline: DisciplineId = "muscu") {
  return useQuery({
    queryKey: [...FULL_CACHE_KEY, discipline],
    queryFn: async (): Promise<DbCatalogRow[]> => {
      const catalogResult = await supabase
        .from("exercise_reference")
        .select("*")
        .eq("discipline_id", discipline)
        .order("category")
        .order("sort_order")
        .order("name");

      if (catalogResult.error) throw catalogResult.error;

      // Catalogue partagé : lecture seule depuis CTX-06.
      const rows = ((catalogResult.data ?? []) as DbCatalogRow[]).map((r) => ({
        ...r,
        owned: false,
      }));

      // Catalogue personnel de l'utilisateur (RLS : ses lignes uniquement).
      const ownResult = await db
        .from(USER_CATALOG_TABLE)
        .select("id, name, category, sort_order, created_at")
        .eq("discipline_id", discipline)
        .order("category")
        .order("sort_order")
        .order("name");
      if (ownResult.error) throw ownResult.error;

      const ownNames = new Set<string>();
      for (const r of (ownResult.data ?? []) as DbCatalogRow[]) {
        ownNames.add(r.name.toLowerCase());
        rows.push({ ...r, owned: true });
      }

      if (discipline !== "muscu") return rows;

      const customResult = await supabase.from("exercises").select("name").order("name");
      const catalogNames = new Set(rows.map((r) => r.name.toLowerCase()));

      // Ajoute les exercices créés par l'utilisateur non encore dans le catalogue
      const seen = new Set<string>(ownNames);
      for (const ex of customResult.data ?? []) {
        const key = ex.name.toLowerCase();
        if (!catalogNames.has(key) && !seen.has(key)) {
          seen.add(key);
          rows.push({
            id: `custom__${ex.name}`,
            name: ex.name,
            category: "Mes exercices",
            sort_order: 999,
            created_at: "",
            // Entrée dérivée d'un nom trouvé dans `exercises`, sans ligne de
            // catalogue : ni partagée, ni personnelle. `isCustom()` la traite
            // à part (action « Ajouter au catalogue »), jamais Modifier/Supprimer.
            owned: false,
          });
        }
      }

      return rows;
    },
    staleTime: 2 * 60 * 1000,
  });
}

// ── Convertit les lignes DB en CatalogExercise (pour ExercisePicker) ────────
export function dbRowsToCatalog(rows: DbCatalogRow[]): CatalogExercise[] {
  return rows.map((r) => ({
    name: r.name,
    group: r.category ?? "",
    ...(r.aliases && r.aliases.length > 0 ? { aliases: r.aliases } : {}),
  }));
}

// ── Mutations ─────────────────────────────────────────────────────────────────
// Correctif CTX-06 : toutes les écritures ci-dessous visent désormais le
// catalogue PERSONNEL (`user_exercise_reference`, RLS propriétaire) et non
// plus le catalogue partagé `exercise_reference`, passé en lecture seule.
// L'ergonomie est inchangée pour l'utilisateur — il ajoute, renomme et
// supprime ses exercices exactement comme avant — mais il ne peut plus
// altérer la bibliothèque commune à tous les comptes.

/** Identifiant de l'utilisateur courant, requis par la policy INSERT. */
async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Session expirée — reconnecte-toi.");
  return data.user.id;
}

export function useAddExercise(discipline: DisciplineId = "muscu") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, category }: { name: string; category: string | null }) => {
      const userId = await currentUserId();
      const { error } = await db
        .from(USER_CATALOG_TABLE)
        .insert({ user_id: userId, name: name.trim(), category, discipline_id: discipline });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: FULL_CACHE_KEY });
    },
  });
}

export function useDeleteExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from(USER_CATALOG_TABLE).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: FULL_CACHE_KEY });
    },
  });
}

export function useUpdateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      category,
    }: {
      id: string;
      name: string;
      category: string | null;
    }) => {
      const { error } = await db
        .from(USER_CATALOG_TABLE)
        .update({ name: name.trim(), category })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: FULL_CACHE_KEY });
    },
  });
}

// ── Ajouter un exercice hors catalogue à SON catalogue personnel ─────────────
export function usePromoteExercise(discipline: DisciplineId = "muscu") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, category }: { name: string; category: string | null }) => {
      const userId = await currentUserId();
      const { error } = await db
        .from(USER_CATALOG_TABLE)
        .insert({ user_id: userId, name: name.trim(), category, discipline_id: discipline });
      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: FULL_CACHE_KEY });
    },
  });
}
