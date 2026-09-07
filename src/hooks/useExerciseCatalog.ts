import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import { fetchAllRows } from "@/lib/supabase/pagedRead";
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

/**
 * CHANTIER A (AUD-01) — COLONNES RÉELLEMENT NÉCESSAIRES AU CATALOGUE.
 *
 * `select("*")` rapatriait 2 841 ko pour les 1 477 lignes muscu (mesuré sur
 * `bcwfvpwxzlmkxobvbtzp`), dont 1 547 ko de `config`, 639 ko de
 * `description` et 373 ko de `media` — trois colonnes qu'AUCUN consommateur
 * de ce hook ne lit. Le seul champ utile de `config` est `equipment`
 * (ExerciseExplorerSheet → `deriveExerciseBadges`), extrait ici côté serveur
 * via `config->>equipment` puis remis dans la forme `config: { equipment }`
 * attendue par `DbCatalogRow` — la shape consommée ne change pas.
 *
 * Résultat : 2 841 ko → ~100 ko (−96 %).
 *
 * `aliases` n'est plus demandé : son unique lecture était `dbRowsToCatalog()`,
 * supprimée avec `useExerciseCatalog()` (AUD-13, aucun consommateur). Le champ
 * reste optionnel sur `DbCatalogRow` pour les lignes construites ailleurs.
 *
 * L'ORDRE se termine par `id` : `fetchAllRows` pagine, et sans ordre TOTAL
 * deux pages successives peuvent renvoyer deux fois la même ligne et en
 * omettre une autre. Le tri affiché (catégorie, sort_order, nom) est
 * strictement inchangé — `id` ne départage que d'éventuels ex æquo.
 */
const CATALOG_COLUMNS = "id, name, category, sort_order, created_at, equipment:config->>equipment";

/** Ligne telle que renvoyée par `CATALOG_COLUMNS` (avant remise en forme). */
type CatalogSelectRow = Omit<DbCatalogRow, "config"> & { equipment: string | null };

/** Remet la ligne serveur dans la forme `DbCatalogRow` consommée par l'UI. */
function toCatalogRow(row: CatalogSelectRow, owned: boolean): DbCatalogRow {
  const { equipment, ...rest } = row;
  return { ...rest, config: { equipment }, owned };
}

// ── Catalogue complet = DB + exercices custom (pour la sheet de gestion) ─────
// Phase B (2026-07-15) : paramétré par discipline (défaut "muscu",
// comportement identique à avant pour tous les appelants existants) — voir
// docs/architecture/phase-b-carte-exercice-unique.md. La fusion avec les
// exercices "custom" de la table `exercises` (2e requête ci-dessous) reste
// muscu-only : cette table ne contient QUE des occurrences musculation
// (voir exercise-central-architecture.md section 2.3), aucun équivalent
// pour les autres disciplines à ce jour.
/**
 * Lecture serveur du catalogue complet, extraite du hook pour être
 * testable isolément (cf. `lib/supabase/referentialReadBounds.test.ts`, qui prouve
 * le comportement AU-DELÀ du plafond `max-rows` — un test qui passerait
 * avec les seuls volumes actuels ne démontrerait rien).
 */
export async function fetchFullExerciseCatalog(
  discipline: DisciplineId = "muscu",
): Promise<DbCatalogRow[]> {
  // Catalogue partagé : lecture seule depuis CTX-06. Paginé : 1 477 lignes
  // muscu dépassent le plafond `max-rows` de PostgREST, qui tronquait la
  // réponse SANS erreur — environ un tiers du catalogue n'arrivait jamais.
  const catalogRows = await fetchAllRows<CatalogSelectRow>(
    () =>
      supabase
        .from("exercise_reference")
        .select(CATALOG_COLUMNS, { count: "exact" })
        .eq("discipline_id", discipline)
        .order("category")
        .order("sort_order")
        .order("name")
        .order("id"),
    { label: "exercise_reference" },
  );
  const rows = catalogRows.map((r) => toCatalogRow(r, false));

  // Catalogue personnel de l'utilisateur (RLS : ses lignes uniquement).
  // Pas de `config` ici : cette table n'en porte pas, et n'en portait pas
  // davantage avant ce chantier — forme des lignes inchangée.
  const ownRows = await fetchAllRows<DbCatalogRow>(
    () =>
      db
        .from(USER_CATALOG_TABLE)
        .select("id, name, category, sort_order, created_at", { count: "exact" })
        .eq("discipline_id", discipline)
        .order("category")
        .order("sort_order")
        .order("name")
        .order("id"),
    { label: USER_CATALOG_TABLE },
  );

  const ownNames = new Set<string>();
  for (const r of ownRows) {
    ownNames.add(r.name.toLowerCase());
    rows.push({ ...r, owned: true });
  }

  if (discipline !== "muscu") return rows;

  // Noms des exercices déjà pratiqués (table `exercises`, RLS
  // propriétaire) — sert uniquement à proposer « Mes exercices ».
  // TOLÉRANCE PRÉSERVÉE : avant ce chantier l'erreur de cette 3e requête
  // n'était pas vérifiée (`customResult.data ?? []`), donc un échec
  // dégradait la liste sans casser le catalogue. On garde exactement ce
  // contrat — faire échouer toute la query viderait l'écran sur une
  // erreur transitoire, ce serait une régression.
  let customRows: Array<{ name: string }> = [];
  try {
    customRows = await fetchAllRows<{ name: string }>(
      () => supabase.from("exercises").select("name", { count: "exact" }).order("name").order("id"),
      { label: "exercises" },
    );
  } catch {
    customRows = [];
  }
  const catalogNames = new Set(rows.map((r) => r.name.toLowerCase()));

  // Ajoute les exercices créés par l'utilisateur non encore dans le catalogue
  const seen = new Set<string>(ownNames);
  for (const ex of customRows) {
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
}

export function useFullExerciseCatalog(discipline: DisciplineId = "muscu") {
  return useQuery({
    queryKey: [...FULL_CACHE_KEY, discipline],
    queryFn: () => fetchFullExerciseCatalog(discipline),
    staleTime: 2 * 60 * 1000,
  });
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
