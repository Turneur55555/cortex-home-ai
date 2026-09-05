/**
 * CHANTIER 8 — A1 : CONTRAINTES D'UNICITÉ DONT LA VALEUR EN COLLISION EST UN
 * SIMPLE NUMÉRO D'ORDRE ATTRIBUÉ PAR LE CLIENT.
 *
 * LE PROBLÈME, PRÉCISÉMENT
 * ------------------------
 * `exercise_sets` porte `UNIQUE (exercise_id, set_number)` (contrainte
 * `exercise_sets_exercise_id_set_number_key`, migration
 * `20260613172120_add_exercise_sets_table.sql`, vérifiée en base sur le projet
 * `bcwfvpwxzlmkxobvbtzp`). Le numéro est choisi CÔTÉ CLIENT à partir du store
 * local (`useAddExerciseSet` → `max(set_number local) + 1`), parce qu'une
 * série doit pouvoir être créée entièrement hors ligne — il n'existe donc
 * aucune autorité centrale qui distribue ces numéros.
 *
 * Deux contextes qui ne partagent pas le même store local (deux appareils, ou
 * un appareil dont l'hydratation n'a pas encore rapatrié la série de l'autre)
 * choisissent alors le MÊME numéro pour deux séries DIFFÉRENTES : ids clients
 * distincts, couple `(exercise_id, set_number)` identique. À la
 * synchronisation, la seconde échoue en `23505`.
 *
 * POURQUOI CE CAS MÉRITE UN TRAITEMENT À PART
 * -------------------------------------------
 * Les autres violations d'unicité de l'app portent sur une valeur qui APPARTIENT
 * à l'utilisateur ou identifie la ligne : le nom d'une collection de recettes
 * (`recipe_collections_user_id_name_key`), la séance analysée
 * (`workout_analyses_workout_id_key`), l'URL source d'une recette importée
 * (`idx_recipes_user_source_url`). La corriger d'office reviendrait à
 * RÉÉCRIRE une donnée que l'utilisateur a saisie — interdit.
 *
 * `set_number` n'est pas de cette famille : c'est un ordre d'affichage
 * (« série 1, série 2… »), pas une identité. L'identité de la ligne, c'est son
 * `id` client. Décaler ce numéro d'un cran ne perd RIEN — ni les reps, ni le
 * poids, ni l'appartenance à l'exercice — et c'est la seule façon de faire
 * coexister deux séries réellement distinctes créées en parallèle.
 *
 * POURQUOI UNE LISTE STATIQUE ET NON UN REGISTRE ALIMENTÉ PAR LE DOMAINE
 * ---------------------------------------------------------------------
 * Même raison que `serverRewrittenRows.ts` : la file est persistée dans
 * IndexedDB et rejouée au démarrage, potentiellement AVANT que le module du
 * domaine concerné n'ait été importé. Une déclaration manquante rendrait le
 * bug silencieusement. La liste est donc lue directement par le moteur, et
 * documentée ici avec la contrainte serveur exacte qui la justifie.
 *
 * POUR AJOUTER UNE TABLE : elle doit réunir les TROIS conditions, sans quoi le
 * remappage détruirait de l'information —
 *   1. la colonne en collision est un NUMÉRO D'ORDRE attribué par le client,
 *      jamais une donnée saisie ni une référence ;
 *   2. la ligne reste parfaitement identifiée sans elle (son `id` client) ;
 *   3. rien côté serveur ne dépend de sa valeur exacte (aucun trigger, aucune
 *      jointure) — seulement de son ORDRE relatif.
 */

export interface UniqueSequenceRule {
  /** Nom exact de la contrainte côté serveur (`pg_constraint.conname`). */
  constraintName: string;
  /** Colonne qui délimite le groupe d'unicité (ex. `exercise_id`). */
  scopeColumn: string;
  /** Colonne portant le numéro d'ordre remappable (ex. `set_number`). */
  sequenceColumn: string;
  /**
   * Valeur maximale acceptée par la base. `exercise_sets.set_number` est un
   * `SMALLINT` (vérifié en base) : au-delà, l'écriture échouerait de toute
   * façon — on préfère alors ne rien remapper et laisser l'erreur suivre le
   * chemin d'échec normal, plutôt que de fabriquer un payload invalide.
   */
  maxValue: number;
}

/** `SMALLINT` PostgreSQL — borne haute de `exercise_sets.set_number`. */
const SMALLINT_MAX = 32_767;

export const UNIQUE_SEQUENCE_RULES: ReadonlyMap<string, UniqueSequenceRule> = new Map([
  [
    "exercise_sets",
    {
      constraintName: "exercise_sets_exercise_id_set_number_key",
      scopeColumn: "exercise_id",
      sequenceColumn: "set_number",
      maxValue: SMALLINT_MAX,
    },
  ],
]);

/** Règle de remappage de cette table locale, ou `null` si elle n'en a pas. */
export function uniqueSequenceRuleFor(table: string): UniqueSequenceRule | null {
  return UNIQUE_SEQUENCE_RULES.get(table) ?? null;
}

/**
 * Prochain numéro libre, à partir de ceux DÉJÀ PRIS dans le même groupe
 * d'unicité (côté serveur ET côté local, cf. `syncEngine.remapUniqueSequence`).
 *
 * STRICTEMENT CROISSANT, PAR CONSTRUCTION — c'est la propriété qui garantit la
 * TERMINAISON du remappage : chaque tour produit un numéro plus grand que le
 * précédent, donc aucune boucle sur une même valeur n'est possible. Un
 * nouveau tour ne peut avoir lieu que si un autre acteur a RÉELLEMENT inséré
 * ce numéro entre-temps ; le nombre de tours est donc borné par le nombre
 * d'écritures concurrentes réelles, pas par une limite arbitraire.
 *
 * On ne comble volontairement PAS les trous (une série supprimée laisse son
 * numéro libre) : reprendre un numéro inférieur casserait cette croissance
 * stricte — donc la preuve de terminaison — et placerait la nouvelle série
 * AVANT des séries déjà saisies, ce que l'utilisateur n'a pas demandé.
 *
 * Renvoie `null` quand aucun numéro valide n'est atteignable (dépassement du
 * type `SMALLINT`) : l'appelant laisse alors l'erreur suivre son chemin normal
 * plutôt que d'envoyer un payload que la base refusera.
 */
export function nextFreeSequenceValue(params: {
  /** Valeur actuellement portée par l'opération en collision. */
  current: number;
  /** Valeurs déjà occupées dans le même groupe d'unicité. */
  taken: readonly number[];
  maxValue: number;
}): number | null {
  const usable = params.taken.filter((value) => Number.isFinite(value));
  const highest = usable.reduce((max, value) => Math.max(max, value), params.current);
  const next = Math.floor(highest) + 1;
  if (!Number.isFinite(next) || next <= params.current || next > params.maxValue) return null;
  return next;
}
