import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBFactory,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from "fake-indexeddb";

/**
 * CORRECTIF PGRST116 (02/09/2026) — « ligne supprimée du serveur alors qu'une
 * modification locale était encore en attente ».
 *
 * CAUSE (confirmée par l'audit du 01-02/09/2026, cf. mémoire projet
 * `audit-chrome-live-2026-09-01.md`) : la branche `update` de `applyOperation`
 * (`syncEngine.ts`) n'avait AUCUNE garde équivalente à celle de la branche
 * `delete` pour « la ligne visée n'existe plus côté serveur ». Elle appelait
 * directement `.update(payload).eq("id", …).select().single()`, qui échoue en
 * `PGRST116` (« 0 rows returned ») dès que 0 ligne ne matche. `PGRST116`
 * n'étant classé dans aucun des deux `Set` de `syncErrors.ts`,
 * `isBlockingSyncError` renvoyait toujours `false` : l'opération restait
 * `failed`, retentée indéfiniment (le backoff est plafonné, `retryCount` ne
 * l'est PAS — seul un passage `blocked`, jamais atteint pour ce code, sort de
 * la boucle).
 *
 * CORRECTIF : `applyOperation` vérifie maintenant SYSTÉMATIQUEMENT l'existence
 * de la ligne serveur avant d'émettre l'UPDATE. Une ligne absente devient un
 * CONFLIT EXPLICITE (`reason: "server_row_deleted"`), jamais un échec
 * silencieux ni un écrasement automatique façon `delete` idempotent — une
 * modification locale en attente peut porter des données que l'utilisateur
 * veut conserver, c'est à lui d'arbitrer.
 *
 * Ce fichier ne re-teste PAS le cas `updated_at_mismatch` (déjà couvert par
 * `syncQueueDependencyBarrier.test.ts`, `offlineSync.test.ts` etc., sur
 * lesquels ce correctif n'a aucun effet) ni le cas `delete` sur ligne absente
 * (idempotent, INCHANGÉ — un test de non-régression dédié est inclus
 * ci-dessous pour le garantir explicitement).
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

function createFakeSupabase(server: Map<string, Map<string, Row>>) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: unknown }> => {
        if (!op) {
          // Lecture simple (`select().eq("id",…).maybeSingle()`, utilisée par
          // `fetchServerRow`) : `null` propre si absente, JAMAIS d'erreur —
          // fidèle à PostgREST, qui ne lève `PGRST116` que via `.single()`.
          if (idFilter) return { data: store.get(idFilter) ?? null, error: null };
          return { data: Array.from(store.values()), error: null };
        }
        if (op.type === "upsert") {
          const row: Row = { ...(op.payload as Row), updated_at: new Date().toISOString() };
          store.set(row.id, row);
          return { data: row, error: null };
        }
        if (op.type === "update") {
          if (!idFilter || !store.has(idFilter)) {
            // Comportement PostgREST réel d'un `.update().select().single()`
            // sur 0 ligne matchée — c'est CE code que le correctif doit
            // désormais empêcher d'être jamais atteint.
            return {
              data: null,
              error: {
                message: "JSON object requested, multiple (or no) rows returned",
                code: "PGRST116",
                details: "The result contains 0 rows",
                hint: null,
              },
            };
          }
          const updated: Row = {
            ...(store.get(idFilter) as Row),
            ...(op.payload as Row),
            updated_at: new Date().toISOString(),
          };
          store.set(idFilter, updated);
          return { data: updated, error: null };
        }
        // delete
        if (idFilter) store.delete(idFilter);
        return { data: null, error: null };
      };

      const builder = {
        select: () => builder,
        eq(col: string, val: string) {
          if (col === "id") idFilter = val;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        upsert(payload: Row) {
          op = { type: "upsert", payload };
          return builder;
        },
        update(payload: Row) {
          op = { type: "update", payload };
          return builder;
        },
        delete() {
          op = { type: "delete" };
          return builder;
        },
        maybeSingle: () => exec(),
        single: () => exec(),
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          exec().then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const serverStore = new Map<string, Map<string, Row>>();

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase(serverStore);
  },
}));

// Imports après le mock (obligatoire avec vi.mock hoisté).
import { resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import { hasLiveDependencies, listAllOperations } from "./syncQueue";
import { listConflicts, processSyncQueue, resolveConflict } from "./syncEngine";
import type { SyncDependencyRef } from "./types";

const USER = "user-pgrst116";

interface ExerciseRow extends Row {
  user_id: string;
  workout_id: string;
  name: string;
}
interface WorkoutRow extends Row {
  user_id: string;
  name: string;
  status: string;
}

const exercisesRepo = createOfflineRepository<ExerciseRow>("exercises");
const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");

beforeEach(() => {
  Object.assign(globalThis, {
    indexedDB: new IDBFactory(),
    IDBCursor,
    IDBCursorWithValue,
    IDBDatabase,
    IDBIndex,
    IDBKeyRange,
    IDBObjectStore,
    IDBOpenDBRequest,
    IDBRequest,
    IDBTransaction,
    IDBVersionChangeEvent,
  });
  resetOfflineDbForTests();
  serverStore.clear();
});

/** Crée un exercice, le synchronise (il existe donc bien côté serveur), puis
 *  le fait disparaître DIRECTEMENT côté serveur (simulateur d'une suppression
 *  concurrente — autre appareil, nettoyage — jamais vue par ce client) avant
 *  qu'une modification locale ne parte. */
async function createSyncedThenDeletedOnServer(): Promise<ExerciseRow> {
  const exercise = await exercisesRepo.create(USER, {
    workout_id: "w-1",
    name: "Développé couché",
  } as never);
  await processSyncQueue(USER);
  expect(serverStore.get("exercises")?.has(exercise.id)).toBe(true);
  serverStore.get("exercises")?.delete(exercise.id);
  return exercise;
}

describe("PGRST116 — ligne absente du serveur avant l'UPDATE", () => {
  it("1. devient un conflit explicite (reason server_row_deleted), jamais failed/retry", async () => {
    const exercise = await createSyncedThenDeletedOnServer();
    await exercisesRepo.update(exercise.id, USER, { name: "Fantôme" });

    const result = await processSyncQueue(USER);
    expect(result.conflicted).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.blocked).toBe(0);

    const [conflict] = await listConflicts(USER);
    expect(conflict).toBeDefined();
    expect(conflict.reason).toBe("server_row_deleted");
    expect(conflict.table).toBe("exercises");
    expect(conflict.recordLocalId).toBe(exercise.id);
    expect(conflict.serverData).toBeNull();
    expect(conflict.serverUpdatedAt).toBeNull();
  });

  it("2. aucun retry automatique après passage en conflit — l'opération quitte syncQueue", async () => {
    const exercise = await createSyncedThenDeletedOnServer();
    await exercisesRepo.update(exercise.id, USER, { name: "Fantôme" });
    await processSyncQueue(USER);

    const remainingOps = await listAllOperations(USER);
    expect(remainingOps).toHaveLength(0);

    // Des passages supplémentaires ne créent ni nouvelle tentative ni
    // nouveau conflit : il n'y a plus d'opération à traiter.
    const again = await processSyncQueue(USER);
    expect(again.conflicted).toBe(0);
    expect(again.retried).toBe(0);
    expect(await listConflicts(USER)).toHaveLength(1); // toujours le même, non dupliqué
  });

  it("3. retryCount n'augmente plus indéfiniment (borné par la disparition immédiate de la file)", async () => {
    const exercise = await createSyncedThenDeletedOnServer();
    await exercisesRepo.update(exercise.id, USER, { name: "Fantôme" });
    await processSyncQueue(USER);

    // Avant le correctif : `syncEngineTimeout.test.ts` (TEST 2, remplacé)
    // observait `retryCount === 3` après 3 passages, en croissance continue.
    // Maintenant, l'opération n'existe plus après le PREMIER passage — il n'y
    // a donc structurellement plus rien à re-tenter.
    for (let i = 0; i < 5; i += 1) {
      await processSyncQueue(USER);
    }
    expect(await listAllOperations(USER)).toHaveLength(0);
    expect(await listConflicts(USER)).toHaveLength(1);
  });

  it("4. la modification locale est conservée intégralement (rien n'est perdu)", async () => {
    const exercise = await createSyncedThenDeletedOnServer();
    await exercisesRepo.update(exercise.id, USER, { name: "Développé incliné" });
    await processSyncQueue(USER);

    const [conflict] = await listConflicts(USER);
    expect((conflict.localData as ExerciseRow).name).toBe("Développé incliné");

    // L'entité locale reste visible avec la modification, marquée `conflict`
    // — jamais supprimée ni écrasée silencieusement.
    const local = await exercisesRepo.get(exercise.id);
    expect(local?.name).toBe("Développé incliné");
  });

  it("5. résolution « garder ma version » : ré-enfile l'update, aboutit si la ligne réapparaît", async () => {
    const exercise = await createSyncedThenDeletedOnServer();
    await exercisesRepo.update(exercise.id, USER, { name: "Fantôme" });
    await processSyncQueue(USER);
    const [conflict] = await listConflicts(USER);

    await resolveConflict(conflict.id, "keep-local");
    expect(await listConflicts(USER)).toHaveLength(0);
    const [replayed] = await listAllOperations(USER);
    expect(replayed.opType).toBe("update");
    expect(replayed.baseUpdatedAt).toBeNull();

    // La ligne réapparaît côté serveur (ex. un autre appareil l'a recréée) :
    // l'update rejoué aboutit normalement, comme n'importe quelle opération.
    serverStore.get("exercises")?.set(exercise.id, {
      id: exercise.id,
      user_id: USER,
      workout_id: "w-1",
      name: "Développé couché",
      updated_at: new Date().toISOString(),
    });
    const result = await processSyncQueue(USER);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("exercises")?.get(exercise.id)?.name).toBe("Fantôme");
  });

  it("5bis. résolution « garder ma version » sans que la ligne ne réapparaisse : re-conflit maîtrisé, jamais de retry infini", async () => {
    const exercise = await createSyncedThenDeletedOnServer();
    await exercisesRepo.update(exercise.id, USER, { name: "Fantôme" });
    await processSyncQueue(USER);
    const [conflict] = await listConflicts(USER);
    await resolveConflict(conflict.id, "keep-local");

    // Toujours pas de ligne serveur : la garde du correctif intercepte à
    // nouveau AVANT l'UPDATE — un second conflit, jamais une boucle `failed`.
    const result = await processSyncQueue(USER);
    expect(result.conflicted).toBe(1);
    expect(result.retried).toBe(0);
    expect(await listAllOperations(USER)).toHaveLength(0);
  });

  it("6. abandon explicite (« garder la version serveur ») supprime proprement l'entité locale, sans opération orpheline", async () => {
    const exercise = await createSyncedThenDeletedOnServer();
    await exercisesRepo.update(exercise.id, USER, { name: "Fantôme" });
    await processSyncQueue(USER);
    const [conflict] = await listConflicts(USER);

    await resolveConflict(conflict.id, "keep-server");

    expect(await listConflicts(USER)).toHaveLength(0);
    expect(await listAllOperations(USER)).toHaveLength(0);
    // L'entité locale a disparu (alignée sur la réalité serveur), jamais
    // laissée avec `data: null`.
    expect(await exercisesRepo.get(exercise.id)).toBeUndefined();
  });

  it("7. un conflit updated_at_mismatch existant n'est pas cassé par le correctif", async () => {
    const exercise = await exercisesRepo.create(USER, {
      workout_id: "w-1",
      name: "Squat",
    } as never);
    await processSyncQueue(USER);

    // Modifiée AILLEURS (le serveur avance son updated_at) — la ligne existe
    // toujours, contrairement aux tests ci-dessus.
    const serverRow = serverStore.get("exercises")?.get(exercise.id) as Row;
    serverStore.get("exercises")?.set(exercise.id, {
      ...serverRow,
      name: "Squat (modifié ailleurs)",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    await exercisesRepo.update(exercise.id, USER, { name: "Squat (moi)" });
    const result = await processSyncQueue(USER);
    expect(result.conflicted).toBe(1);

    const [conflict] = await listConflicts(USER);
    expect(conflict.reason).toBe("updated_at_mismatch");
    expect(conflict.serverData).not.toBeNull();
    expect((conflict.serverData as Row).name).toBe("Squat (modifié ailleurs)");
    expect(conflict.serverUpdatedAt).not.toBeNull();
  });

  it("8. `delete` sur une ligne déjà absente reste idempotent (INCHANGÉ, jamais un conflit)", async () => {
    const exercise = await createSyncedThenDeletedOnServer();
    await exercisesRepo.remove(exercise.id, USER);

    const result = await processSyncQueue(USER);
    expect(result.succeeded).toBe(1);
    expect(result.conflicted).toBe(0);
    expect(await listConflicts(USER)).toHaveLength(0);
    expect(await listAllOperations(USER)).toHaveLength(0);
  });
});

describe("PGRST116 — interaction avec la barrière de dépendance (chantier 1 bis)", () => {
  /** Séance + un exercice déjà synchronisés, puis l'exercice disparaît côté
   *  serveur — exactement le terrain du correctif — et une clôture de séance
   *  déclare en dépendre. */
  async function setupConflictedDependency(): Promise<{
    workout: WorkoutRow;
    exercise: ExerciseRow;
    dependsOnRecords: SyncDependencyRef[];
  }> {
    const workout = await workoutsRepo.create(USER, {
      name: "Push Day",
      status: "active",
    } as never);
    const exercise = await exercisesRepo.create(USER, {
      workout_id: workout.id,
      name: "Développé couché",
    } as never);
    await processSyncQueue(USER);
    serverStore.get("exercises")?.delete(exercise.id);

    await exercisesRepo.update(exercise.id, USER, { name: "Fantôme" });
    const dependsOnRecords: SyncDependencyRef[] = [
      { table: "exercises", recordLocalId: exercise.id },
    ];
    return { workout, exercise, dependsOnRecords };
  }

  it("9. une opération en conflit compte comme dépendance vivante", async () => {
    const { exercise, dependsOnRecords } = await setupConflictedDependency();
    await processSyncQueue(USER); // l'update de l'exercice devient un conflit

    expect(await listConflicts(USER)).toHaveLength(1);
    const fakeClosureOp = {
      id: "closure-fake",
      createdAt: new Date(Date.now() + 60_000).toISOString(), // postérieure au conflit
      dependsOnRecords,
    };
    expect(await hasLiveDependencies(USER, fakeClosureOp)).toBe(true);
    void exercise;
  });

  it("10. la résolution du conflit libère la dépendance", async () => {
    const { dependsOnRecords } = await setupConflictedDependency();
    await processSyncQueue(USER);
    const [conflict] = await listConflicts(USER);

    const fakeClosureOp = {
      id: "closure-fake",
      createdAt: new Date(Date.now() + 60_000).toISOString(),
      dependsOnRecords,
    };
    expect(await hasLiveDependencies(USER, fakeClosureOp)).toBe(true);

    await resolveConflict(conflict.id, "keep-server"); // abandon explicite
    expect(await hasLiveDependencies(USER, fakeClosureOp)).toBe(false);
  });

  it("11. une opération indépendante (dépendance non concernée) continue normalement", async () => {
    const { dependsOnRecords } = await setupConflictedDependency();
    await processSyncQueue(USER); // conflit levé sur `exercises`/exercise.id

    // Une AUTRE séance, sans rapport avec le conflit.
    const other = await workoutsRepo.create(USER, {
      name: "Autre séance",
      status: "active",
    } as never);
    const result = await processSyncQueue(USER);

    expect(result.succeeded).toBe(1); // la séance indépendante part normalement
    expect(serverStore.get("workouts")?.has(other.id)).toBe(true);
    void dependsOnRecords;
  });

  it("12. deux instances en parallèle sur la même ligne disparue : un seul conflit, jamais de double traitement", async () => {
    const exercise = await createSyncedThenDeletedOnServer();
    await exercisesRepo.update(exercise.id, USER, { name: "Fantôme" });

    const [a, b] = await Promise.all([processSyncQueue(USER), processSyncQueue(USER)]);
    expect(a.conflicted + b.conflicted).toBe(1); // une seule des deux passes a réellement traité l'opération
    expect(await listConflicts(USER)).toHaveLength(1);
    expect(await listAllOperations(USER)).toHaveLength(0);
  });
});
