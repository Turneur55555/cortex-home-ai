/**
 * CHANTIER A — LECTURES DE RÉFÉRENTIEL BORNÉES.
 *
 * Motif de lecture serveur COMPLÈTE mais JAMAIS tronquée en silence.
 *
 * LE PROBLÈME QU'IL RÈGLE : PostgREST applique un plafond `max-rows`
 * (1 000 par défaut chez Supabase) qui tronque une réponse **sans erreur**.
 * Une lecture `select(...)` sans `limit`/`range` au-delà de ce plafond ne
 * renvoie donc pas « toutes les lignes », elle renvoie « les N premières »,
 * et personne ne le sait. C'était le cas de `exercise_reference`
 * (1 477 lignes muscu) et de `exercise_media` (2 566 lignes) : environ un
 * tiers du catalogue et la moitié des médias n'arrivaient jamais au client.
 *
 * LA RÈGLE : la complétude est une PREUVE, pas une supposition. On ne
 * conclut « j'ai tout lu » que si le nombre de lignes accumulées ATTEINT le
 * total exact annoncé par la base elle-même (`count: "exact"`, en-tête
 * `Content-Range`). On ne se fie JAMAIS à « la page est plus courte que
 * demandée » : ce signal ne distingue pas « fin du jeu de données » de
 * « réponse rabotée par `max-rows` ».
 *
 * COROLLAIRE IMPORTANT : `max-rows` est une configuration SERVEUR, dont la
 * valeur n'est pas connue du client (et n'a pas pu être confirmée sur ce
 * projet). Le résultat de ces helpers est donc correct quelle que soit
 * cette valeur — un plafond abaissé sous `PAGE_SIZE` est ABSORBÉ (chaque
 * page revient plus courte, la boucle continue jusqu'au total) au lieu
 * d'être pris pour une fin de jeu de données.
 *
 * Ce module reprend, en le rendant réutilisable et testable isolément, le
 * motif déjà éprouvé par `fetchChildRowsForParents` (use-fitness.ts,
 * MAJ-08). Différence de contrat assumée : ici on LÈVE l'erreur au lieu de
 * renvoyer `complete: false`, parce que les appelants sont des `queryFn`
 * React Query — pour eux, « je n'ai pas pu tout lire » doit devenir un état
 * d'erreur visible et réessayable, jamais une donnée partielle silencieuse.
 *
 * Zéro import React : logique pure, testable sans DOM.
 */

/**
 * Taille d'une page. Volontairement SOUS le plafond `max-rows` par défaut
 * (1 000) : dans le cas nominal une page n'est donc jamais rabotée, et le
 * nombre d'allers-retours reste faible (1 477 lignes = 3 pages).
 */
export const PAGE_SIZE = 500;

/**
 * Nombre d'ids par filtre `in(...)`. Borne la longueur de l'URL PostgREST :
 * 100 uuids ≈ 3,7 ko de query string, très en dessous des limites usuelles
 * des proxys HTTP (souvent 8 ko).
 */
export const IN_CHUNK_SIZE = 100;

/**
 * Garde-fou anti-boucle infinie. 200 pages × 500 lignes = 100 000 lignes,
 * très au-delà de tout jeu de données légitime de l'application : au-delà,
 * c'est un défaut (total qui enfle sous des écritures concurrentes,
 * pagination qui n'avance pas) et il vaut mieux échouer que boucler.
 */
const MAX_PAGES = 200;

/**
 * Vue minimale d'un query builder Supabase après `select(..., { count: "exact" })`
 * et ses filtres. Décrite structurellement plutôt qu'importée : le typage
 * généré ne couvre pas les tables encore absentes de `types.ts` (accédées
 * via `db` ou un cast local), et un `any` ferait perdre tout contrat.
 */
export interface RangeableQuery {
  range(
    from: number,
    to: number,
  ): PromiseLike<{
    data: unknown[] | null;
    error: unknown;
    count?: number | null;
  }>;
}

export interface PagedReadOptions {
  /** Taille de page. Par défaut `PAGE_SIZE`. */
  pageSize?: number;
  /**
   * Libellé utilisé dans les messages d'erreur (nom de table en général).
   * Sans lui, un échec de pagination est illisible dans un rapport de bug.
   */
  label?: string;
}

/** Découpe une liste en paquets de `size`. Renvoie `[]` pour une liste vide. */
export function chunkIds<T>(ids: readonly T[], size: number = IN_CHUNK_SIZE): T[][] {
  if (size <= 0) throw new Error("chunkIds: la taille de paquet doit être strictement positive.");
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/**
 * Lit TOUTES les lignes d'une requête, page par page, jusqu'à atteindre le
 * total exact annoncé par la base.
 *
 * `buildQuery` doit reconstruire la requête À CHAQUE PAGE (un builder
 * Supabase n'est pas réutilisable après exécution) et DOIT :
 *   - demander `{ count: "exact" }` — sans total exact, aucune complétude
 *     n'est démontrable et la fonction lève ;
 *   - porter un ORDRE TOTAL (déterministe, sans ex æquo). Sans lui, deux
 *     pages successives peuvent renvoyer deux fois la même ligne et en
 *     omettre une autre. En pratique : terminer les `order(...)` métier par
 *     un `order("id")` de départage.
 *
 * Lève à la moindre impossibilité de prouver la complétude — c'est le point
 * du helper : mieux vaut une erreur réessayable qu'un jeu de données
 * amputé que personne ne remarque.
 */
export async function fetchAllRows<T>(
  buildQuery: () => RangeableQuery,
  options: PagedReadOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  if (pageSize <= 0) throw new Error("fetchAllRows: la taille de page doit être positive.");
  const what = options.label ? ` (${options.label})` : "";
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = rows.length;
    const { data, error, count } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data) throw new Error(`Lecture paginée sans données ni erreur${what}.`);
    rows.push(...(data as T[]));

    // Sans total exact, « j'ai tout lu » n'est pas démontrable : l'appelant
    // a oublié `{ count: "exact" }`, ou le serveur ne l'a pas renvoyé.
    if (count == null) {
      throw new Error(
        `Lecture paginée sans total exact${what} : impossible de prouver que rien n'a été tronqué. ` +
          `Ajoute { count: "exact" } au select.`,
      );
    }
    if (rows.length >= count) return rows;
    // Une page vide alors qu'il resterait des lignes : la lecture n'avance
    // plus (plafond serveur à 0, filtre inattendu). On refuse de conclure.
    if (data.length === 0) {
      throw new Error(
        `Lecture paginée bloquée${what} : ${rows.length} ligne(s) lue(s) sur ${count} annoncée(s), ` +
          `mais la page suivante est vide.`,
      );
    }
  }

  throw new Error(`Lecture paginée interrompue${what} : plus de ${MAX_PAGES} pages.`);
}

/**
 * Lit TOUTES les lignes correspondant à une liste d'ids, en découpant le
 * filtre `in(...)` en paquets bornés, chaque paquet étant lui-même paginé.
 *
 * Les ids sont dédupliqués avant découpage : les paquets sont donc
 * DISJOINTS, et concaténer leurs résultats ne peut pas produire de doublon
 * (une ligne ne référence qu'un seul parent).
 *
 * Renvoie `[]` sans aucun aller-retour réseau si la liste est vide.
 */
export async function fetchAllRowsForIds<T>(
  ids: readonly string[],
  buildQuery: (idChunk: string[]) => RangeableQuery,
  options: PagedReadOptions & { chunkSize?: number } = {},
): Promise<T[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows: T[] = [];
  for (const idChunk of chunkIds(unique, options.chunkSize ?? IN_CHUNK_SIZE)) {
    rows.push(...(await fetchAllRows<T>(() => buildQuery(idChunk), options)));
  }
  return rows;
}
