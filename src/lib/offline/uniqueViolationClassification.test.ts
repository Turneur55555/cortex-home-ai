import { describe, expect, it } from "vitest";
import {
  classifyUniqueViolation,
  describeSyncFailure,
  extractConstraintName,
  isBlockingSyncError,
  NON_RETRYABLE_PG_ERROR_CODES,
  UNIQUE_VIOLATION_PG_ERROR_CODE,
} from "./syncErrors";
import { nextFreeSequenceValue, uniqueSequenceRuleFor } from "./uniqueSequenceRemap";

/**
 * CHANTIER 8 (A1, volet 1) — CLASSIFICATION DU CODE `23505`.
 *
 * Le point central de l'audit : `23505` n'a PAS une seule signification dans
 * cette application. Les contraintes d'unicité réellement atteignables par la
 * sync queue ont été relevées EN BASE (projet `bcwfvpwxzlmkxobvbtzp`), et
 * elles se répartissent en trois familles au comportement différent :
 *
 *   exercise_sets_exercise_id_set_number_key   → numéro d'ordre client, REMAPPABLE
 *   workouts_one_active_per_user               → partiel `status='active'`, dépend de l'état serveur
 *   physical_goals_one_active_per_user         → idem
 *   recipe_collections_user_id_name_key        → valeur saisie par l'utilisateur, DÉFINITIF
 *   workout_analyses_workout_id_key            → identité de la ligne, DÉFINITIF
 *   idx_recipes_user_source_url                → identité de la ligne, DÉFINITIF
 *
 * Les traiter toutes pareil serait faux dans les deux sens : bloquer d'office
 * gèlerait une collision de numéro de série (le défaut A1) ; retenter d'office
 * ferait boucler un nom de collection déjà pris jusqu'à épuisement du budget.
 */

/** Erreur telle que PostgREST la remonte réellement (format relevé en base). */
function violation(constraint: string, details: string) {
  return {
    code: "23505",
    message: `duplicate key value violates unique constraint "${constraint}"`,
    details,
    hint: null,
  };
}

const SET_NUMBER_VIOLATION = violation(
  "exercise_sets_exercise_id_set_number_key",
  "Key (exercise_id, set_number)=(11111111-1111-1111-1111-111111111111, 3) already exists.",
);
const ACTIVE_WORKOUT_VIOLATION = violation(
  "workouts_one_active_per_user",
  "Key (user_id)=(22222222-2222-2222-2222-222222222222) already exists.",
);
const COLLECTION_NAME_VIOLATION = violation(
  "recipe_collections_user_id_name_key",
  "Key (user_id, name)=(22222222-2222-2222-2222-222222222222, Favoris) already exists.",
);

describe("extractConstraintName", () => {
  it("lit le nom de contrainte dans le message Postgres", () => {
    expect(extractConstraintName(SET_NUMBER_VIOLATION)).toBe(
      "exercise_sets_exercise_id_set_number_key",
    );
  });

  it("renvoie null quand le message ne le porte pas", () => {
    expect(extractConstraintName({ message: "network down" })).toBeNull();
    expect(extractConstraintName({ message: "" })).toBeNull();
  });
});

describe("classifyUniqueViolation", () => {
  it("collision de numéro de série → remappable", () => {
    expect(
      classifyUniqueViolation(SET_NUMBER_VIOLATION, { table: "exercise_sets", opType: "create" }),
    ).toBe("remappable-sequence");
  });

  it("séance déjà active → dépend de l'état serveur (une autre opération peut la clôturer)", () => {
    expect(
      classifyUniqueViolation(ACTIVE_WORKOUT_VIOLATION, { table: "workouts", opType: "create" }),
    ).toBe("state-dependent");
  });

  it("nom de collection déjà pris → définitif (jamais réécrire une valeur de l'utilisateur)", () => {
    expect(
      classifyUniqueViolation(COLLECTION_NAME_VIOLATION, {
        table: "recipe_collections",
        opType: "create",
      }),
    ).toBe("definitive");
  });

  it("déduit le cas remappable quand le nom de contrainte est absent du message", () => {
    // Le `create` part en `upsert onConflict: "id"` : la clé primaire ne peut
    // pas être la contrainte violée, et `exercise_sets` n'en a pas d'autre.
    expect(
      classifyUniqueViolation(
        { message: "duplicate key value" },
        {
          table: "exercise_sets",
          opType: "create",
        },
      ),
    ).toBe("remappable-sequence");
  });

  it("ne déduit RIEN pour une table sans règle de séquence", () => {
    expect(
      classifyUniqueViolation(
        { message: "duplicate key value" },
        {
          table: "recipes",
          opType: "create",
        },
      ),
    ).toBe("definitive");
  });

  it("ne remappe jamais une AUTRE contrainte de la même table", () => {
    expect(
      classifyUniqueViolation(violation("exercise_sets_pkey", "Key (id)=(x) already exists."), {
        table: "exercise_sets",
        opType: "create",
      }),
    ).toBe("definitive");
  });

  it("sans contexte de table, reste sur le classement le plus conservateur", () => {
    expect(classifyUniqueViolation({ message: "duplicate key value" }, {})).toBe("definitive");
  });
});

describe("isBlockingSyncError — 23505", () => {
  it("23505 fait bien partie des codes non retryables à l'identique", () => {
    expect(NON_RETRYABLE_PG_ERROR_CODES.has(UNIQUE_VIOLATION_PG_ERROR_CODE)).toBe(true);
  });

  it("une collision de numéro de série ne bloque JAMAIS (c'est le cœur de A1)", () => {
    for (const hasOtherQueuedOperations of [true, false]) {
      expect(
        isBlockingSyncError(SET_NUMBER_VIOLATION, {
          hasOtherQueuedOperations,
          table: "exercise_sets",
          opType: "create",
        }),
      ).toBe(false);
    }
  });

  it("une séance déjà active reste retryable tant que la file peut clôturer l'autre", () => {
    expect(
      isBlockingSyncError(ACTIVE_WORKOUT_VIOLATION, {
        hasOtherQueuedOperations: true,
        table: "workouts",
        opType: "create",
      }),
    ).toBe(false);
  });

  it("…et bloque quand plus rien dans la file ne peut lever la condition", () => {
    expect(
      isBlockingSyncError(ACTIVE_WORKOUT_VIOLATION, {
        hasOtherQueuedOperations: false,
        table: "workouts",
        opType: "create",
      }),
    ).toBe(true);
  });

  it("un nom déjà pris bloque immédiatement, sans boucle de tentatives inutiles", () => {
    expect(
      isBlockingSyncError(COLLECTION_NAME_VIOLATION, {
        hasOtherQueuedOperations: true,
        table: "recipe_collections",
        opType: "create",
      }),
    ).toBe(true);
  });

  it("aucune régression sur les autres codes déjà classés", () => {
    const fk = { code: "23503", message: "insert violates foreign key constraint" };
    expect(isBlockingSyncError(fk, { hasOtherQueuedOperations: true })).toBe(false);
    expect(isBlockingSyncError(fk, { hasOtherQueuedOperations: false })).toBe(true);
    expect(
      isBlockingSyncError(
        { code: "PGRST204", message: "column not found" },
        { hasOtherQueuedOperations: true },
      ),
    ).toBe(true);
    // Erreur réseau ordinaire (aucun code Postgres) : toujours retryable.
    expect(
      isBlockingSyncError(
        { code: null, message: "fetch failed" },
        {
          hasOtherQueuedOperations: false,
        },
      ),
    ).toBe(false);
    // PGRST116 n'est toujours pas un code bloquant (il devient un conflit).
    expect(
      isBlockingSyncError(
        { code: "PGRST116", message: "0 rows" },
        { hasOtherQueuedOperations: false },
      ),
    ).toBe(false);
  });
});

describe("message utilisateur", () => {
  it("une violation d'unicité bloquée est expliquée en français, sans jargon Postgres", () => {
    const message = describeSyncFailure({
      status: "blocked",
      lastError: `${COLLECTION_NAME_VIOLATION.message} | code=23505`,
      lastErrorCode: "23505",
      retryCount: 1,
    });
    expect(message).toBe("Cette valeur existe déjà côté serveur — modifiez-la avant de réessayer.");
    expect(message).not.toMatch(/duplicate|constraint|23505/i);
  });
});

describe("uniqueSequenceRuleFor / nextFreeSequenceValue", () => {
  it("seule `exercise_sets` déclare une règle de remappage", () => {
    expect(uniqueSequenceRuleFor("exercise_sets")).toMatchObject({
      constraintName: "exercise_sets_exercise_id_set_number_key",
      scopeColumn: "exercise_id",
      sequenceColumn: "set_number",
    });
    for (const table of ["workouts", "exercises", "recipes", "recipe_collections", "nutrition"]) {
      expect(uniqueSequenceRuleFor(table)).toBeNull();
    }
  });

  it("le numéro remappé est STRICTEMENT croissant — c'est la preuve de terminaison", () => {
    expect(nextFreeSequenceValue({ current: 2, taken: [1, 2, 3], maxValue: 32767 })).toBe(4);
    expect(nextFreeSequenceValue({ current: 9, taken: [1, 2], maxValue: 32767 })).toBe(10);
  });

  it("ne comble jamais un trou (reprendre un numéro inférieur casserait la terminaison)", () => {
    // 2 est libre, mais on ne redescend pas : la série irait se placer AVANT
    // des séries déjà saisies, et le remappage pourrait boucler.
    expect(nextFreeSequenceValue({ current: 3, taken: [1, 3, 4], maxValue: 32767 })).toBe(5);
  });

  it("ignore les valeurs inexploitables", () => {
    expect(
      nextFreeSequenceValue({ current: 1, taken: [Number.NaN, 4, Number.NaN], maxValue: 32767 }),
    ).toBe(5);
  });

  it("renvoie null au-delà du SMALLINT plutôt que de fabriquer un payload invalide", () => {
    expect(nextFreeSequenceValue({ current: 32767, taken: [32767], maxValue: 32767 })).toBeNull();
    expect(nextFreeSequenceValue({ current: 5, taken: [40000], maxValue: 32767 })).toBeNull();
  });
});
