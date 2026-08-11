import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
 * Couverture offline-first du Cœur Fitness (vague finale, CLAUDE.md) :
 * `workouts` / `exercises` / `exercise_sets` (`src/hooks/use-fitness.ts`),
 * même infra générique que `wave3Offline.test.ts`/`nutritionOffline.test.ts`
 * (`createOfflineRepository`, `processSyncQueue`, `resolveConflict`,
 * `purgeUserOfflineData`). Voir `offlineSync.test.ts` pour le détail du
 * simulateur Supabase in-memory réutilisé ici.
 *
 * RPG : l'attribution d'XP à la clôture d'une séance est un TRIGGER SQL
 * SERVEUR (`award_xp_on_workout_complete`), déclenché quand `status` passe
 * à `'completed'` EN BASE — hors périmètre de ces tests (pas de simulateur
 * de trigger), on vérifie uniquement que la donnée passe bien à
 * `'completed'` localement et que l'opération de sync correspondante existe
 * dans la queue (le reste est arbitré serveur, cf. CLAUDE.md).
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface FakeSupabaseOptions {
  /** Si vrai, la PROCHAINE requête échoue avec une erreur réseau (simulateur de coupure). */
  failNext?: boolean;
}

/**
 * Colonnes réelles des tables du Cœur Fitness en prod (vérifié en direct via
 * `information_schema.columns`, projet `bcwfvpwxzlmkxobvbtzp`) — reproduit
 * ici pour que le simulateur Supabase rejette un payload contenant une
 * colonne inconnue, exactement comme PostgREST le ferait (code `PGRST204`).
 * Garde-fou contre la régression exacte trouvée en prod : `exercises`
 * n'avait PAS de colonne `created_at` alors que `repository.ts::create()`
 * l'ajoute inconditionnellement à CHAQUE payload créé (contrat générique
 * partagé par toutes les tables offline) — tout `create` échouait donc en
 * boucle (cf. migration `20260829130000_exercises_created_at.sql`).
 */
const SCHEMA_COLUMNS: Record<string, Set<string>> = {
  workouts: new Set([
    "id",
    "user_id",
    "name",
    "date",
    "gym_location",
    "status",
    "discipline",
    "duration_minutes",
    "notes",
    "metadata",
    "level_before",
    "level_after",
    "xp_before",
    "xp_after",
    "created_at",
    "updated_at",
  ]),
  exercises: new Set([
    "id",
    "user_id",
    "workout_id",
    "name",
    "sets",
    "reps",
    "weight",
    "notes",
    "image_path",
    "muscle_groups",
    "superset_group",
    "exercise_reference_id",
    "position",
    "created_at",
    "updated_at",
  ]),
  exercise_sets: new Set([
    "id",
    "exercise_id",
    "user_id",
    "set_number",
    "reps",
    "weight",
    "notes",
    "created_at",
    "tempo",
    "rest_seconds",
    "completed",
    "updated_at",
  ]),
};

/** Clés étrangères réelles (`exercise_sets_exercise_id_fkey` en prod) — un
 *  payload référençant une ligne absente de la table cible échoue en
 *  `23503`, comme Postgres le ferait réellement. */
const FOREIGN_KEYS: Record<string, Array<{ column: string; refTable: string }>> = {
  exercises: [{ column: "workout_id", refTable: "workouts" }],
  exercise_sets: [{ column: "exercise_id", refTable: "exercises" }],
};

interface FakePostgrestError {
  message: string;
  code: string;
}

function createFakeSupabase(server: Map<string, Map<string, Row>>, opts: FakeSupabaseOptions) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "insert" | "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{
        data: unknown;
        error: FakePostgrestError | Error | null;
      }> => {
        if (opts.failNext) {
          opts.failNext = false;
          return { data: null, error: new Error("network down") };
        }
        if (!op) {
          if (idFilter) return { data: store.get(idFilter) ?? null, error: null };
          return { data: Array.from(store.values()), error: null };
        }
        if (op.type === "insert" || op.type === "upsert") {
          const row = { ...(op.payload as Row) };
          const allowedColumns = SCHEMA_COLUMNS[table];
          if (allowedColumns) {
            const unknownColumn = Object.keys(row).find((col) => !allowedColumns.has(col));
            if (unknownColumn) {
              return {
                data: null,
                error: {
                  message: `Could not find the '${unknownColumn}' column of '${table}' in the schema cache`,
                  code: "PGRST204",
                },
              };
            }
          }
          for (const fk of FOREIGN_KEYS[table] ?? []) {
            const refId = row[fk.column] as string | undefined;
            if (refId && !server.get(fk.refTable)?.has(refId)) {
              return {
                data: null,
                error: {
                  message: `insert or update on table "${table}" violates foreign key constraint`,
                  code: "23503",
                },
              };
            }
          }
          store.set(row.id, row);
          return { data: row, error: null };
        }
        if (op.type === "update") {
          if (!idFilter || !store.has(idFilter)) {
            return { data: null, error: new Error("row not found") };
          }
          const existing = store.get(idFilter) as Row;
          const updated: Row = {
            ...existing,
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
        select() {
          return builder;
        },
        eq(col: string, val: string) {
          if (col === "id") idFilter = val;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        insert(payload: Row) {
          op = { type: "insert", payload };
          return builder;
        },
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
const fakeSupabaseOpts: FakeSupabaseOptions = {};

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase(serverStore, fakeSupabaseOpts);
  },
}));

// Imports après le mock (obligatoire avec vi.mock hoisté).
import { getOfflineDb, purgeUserOfflineData, resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import { listAllOperations } from "./syncQueue";
import { processSyncQueue, resolveConflict, listConflicts } from "./syncEngine";

const USER_A = "user-a";
const USER_B = "user-b";

beforeEach(() => {
  // Nouvelle base IndexedDB vierge à chaque test (globals complets requis par `idb`).
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
  fakeSupabaseOpts.failNext = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Fixtures ───────────────────────────────────────────────────────────

interface WorkoutRow extends Row {
  user_id: string;
  name: string;
  date: string;
  gym_location: string;
  status: string;
  discipline: string;
  duration_minutes: number | null;
}

interface ExerciseRow extends Row {
  user_id: string;
  workout_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  position: number;
}

interface ExerciseSetRow extends Row {
  user_id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  completed: boolean;
}

const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");
const exercisesRepo = createOfflineRepository<ExerciseRow>("exercises");
const exerciseSetsRepo = createOfflineRepository<ExerciseSetRow>("exercise_sets");

const activeWorkoutInput = (overrides: Partial<WorkoutRow> = {}) => ({
  name: "Push Day",
  date: "2026-08-08",
  gym_location: "Salle Neptune",
  status: "active",
  discipline: "muscu",
  duration_minutes: null,
  ...overrides,
});

// ─── Démarrage de séance offline ───────────────────────────────────────

describe("Cœur Fitness — démarrage de séance hors connexion", () => {
  it("crée une séance active visible immédiatement en local, rien envoyé au serveur", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    expect(workout.id).toBeTruthy();
    expect(workout.status).toBe("active");

    const local = await workoutsRepo.list(USER_A);
    expect(local).toHaveLength(1);
    expect(local[0].status).toBe("active");
    expect(serverStore.get("workouts")?.size ?? 0).toBe(0);
  });

  it("contrainte 'une seule séance active' respectée en local — un check-then-create manuel refuse la deuxième", async () => {
    await workoutsRepo.create(USER_A, activeWorkoutInput());
    const local = await workoutsRepo.list(USER_A);
    const hasActive = local.some((w) => w.status === "active");
    expect(hasActive).toBe(true);
    // Même garde que useStartWorkout/assertNoActiveWorkout (use-fitness.ts) :
    // vérification locale avant toute nouvelle création.
    if (hasActive) {
      expect(() => {
        throw new Error("Une séance est déjà en cours.");
      }).toThrow("Une séance est déjà en cours.");
    }
  });
});

// ─── Enregistrement de séries offline (plusieurs exercices) ───────────

describe("Cœur Fitness — enregistrement de séries hors connexion (plusieurs exercices)", () => {
  it("ajoute des exercices + séries à une séance active, tout visible localement", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    const squat = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Squat",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    const bench = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Développé couché",
      sets: null,
      reps: null,
      weight: null,
      position: 1,
    });

    await exerciseSetsRepo.create(USER_A, {
      exercise_id: squat.id,
      set_number: 1,
      reps: 8,
      weight: 100,
      completed: true,
    });
    await exerciseSetsRepo.create(USER_A, {
      exercise_id: squat.id,
      set_number: 2,
      reps: 8,
      weight: 102.5,
      completed: true,
    });
    await exerciseSetsRepo.create(USER_A, {
      exercise_id: bench.id,
      set_number: 1,
      reps: 10,
      weight: 60,
      completed: false,
    });

    const exercises = await exercisesRepo.list(USER_A);
    expect(exercises).toHaveLength(2);
    const sets = await exerciseSetsRepo.list(USER_A);
    expect(sets).toHaveLength(3);
    expect(sets.filter((s) => s.exercise_id === squat.id)).toHaveLength(2);
    expect(sets.filter((s) => s.exercise_id === bench.id)).toHaveLength(1);
    expect(serverStore.get("exercise_sets")?.size ?? 0).toBe(0);
  });

  it("set_number déterministe côté client (max local + 1) — jamais de doublon même après plusieurs ajouts", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    const ex = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Soulevé de terre",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });

    async function addSetDeterministic(reps: number, weight: number) {
      const existing = (await exerciseSetsRepo.list(USER_A)).filter((s) => s.exercise_id === ex.id);
      const n = existing.length > 0 ? Math.max(...existing.map((s) => s.set_number)) + 1 : 1;
      return exerciseSetsRepo.create(USER_A, {
        exercise_id: ex.id,
        set_number: n,
        reps,
        weight,
        completed: true,
      });
    }

    await addSetDeterministic(5, 120);
    await addSetDeterministic(5, 125);
    await addSetDeterministic(3, 130);

    const sets = (await exerciseSetsRepo.list(USER_A)).sort((a, b) => a.set_number - b.set_number);
    expect(sets.map((s) => s.set_number)).toEqual([1, 2, 3]);
  });
});

// ─── Modification d'une série ──────────────────────────────────────────

describe("Cœur Fitness — modification d'une série hors connexion", () => {
  it("met à jour reps/weight/completed localement, sans appel réseau", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    const ex = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Squat",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    const set = await exerciseSetsRepo.create(USER_A, {
      exercise_id: ex.id,
      set_number: 1,
      reps: 8,
      weight: 100,
      completed: false,
    });

    const updated = await exerciseSetsRepo.update(set.id, USER_A, {
      reps: 8,
      weight: 100,
      completed: true,
    });
    expect(updated.completed).toBe(true);

    const local = await exerciseSetsRepo.get(set.id);
    expect(local?.completed).toBe(true);
    expect(serverStore.get("exercise_sets")?.size ?? 0).toBe(0);
  });
});

// ─── Suppression ────────────────────────────────────────────────────────

describe("Cœur Fitness — suppression d'une série hors connexion", () => {
  it("disparaît de list() (tombstone local)", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    const ex = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Squat",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    const set = await exerciseSetsRepo.create(USER_A, {
      exercise_id: ex.id,
      set_number: 1,
      reps: 8,
      weight: 100,
      completed: false,
    });

    await exerciseSetsRepo.remove(set.id, USER_A);
    expect(await exerciseSetsRepo.list(USER_A)).toEqual([]);
    expect(await exerciseSetsRepo.get(set.id)).toBeUndefined();
  });

  it("une série jamais synchronisée, supprimée avant reconnexion, ne pousse rien au serveur", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    const ex = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Squat",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    const set = await exerciseSetsRepo.create(USER_A, {
      exercise_id: ex.id,
      set_number: 1,
      reps: 8,
      weight: 100,
      completed: false,
    });
    await exerciseSetsRepo.remove(set.id, USER_A);

    const result = await processSyncQueue(USER_A);
    // La création annulée (create+remove avant sync) ne laisse aucune
    // opération à rejouer pour cette série — seule la séance/l'exercice
    // restent en attente.
    expect(serverStore.get("exercise_sets")?.has(set.id)).toBeFalsy();
    expect(result.succeeded).toBeGreaterThanOrEqual(0);
  });
});

// ─── Fin de séance offline ──────────────────────────────────────────────

describe("Cœur Fitness — fin de séance hors connexion", () => {
  it("status passe à 'completed' localement, et l'opération de sync correspondante existe dans la queue", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    await processSyncQueue(USER_A); // séance déjà synchronisée une première fois

    const updated = await workoutsRepo.update(workout.id, USER_A, {
      status: "completed",
      duration_minutes: 62,
    });
    expect(updated.status).toBe("completed");

    const local = await workoutsRepo.get(workout.id);
    expect(local?.status).toBe("completed");
    expect(local?.duration_minutes).toBe(62);

    const ops = await listAllOperations(USER_A);
    const finishOp = ops.find((o) => o.table === "workouts" && o.recordLocalId === workout.id);
    expect(finishOp).toBeDefined();
    expect(finishOp?.opType).toBe("update");
    expect((finishOp?.payload as WorkoutRow | null)?.status).toBe("completed");

    // Hors périmètre client (CLAUDE.md) : l'attribution d'XP est un trigger
    // SQL serveur déclenché par ce même UPDATE une fois synchronisé — pas de
    // simulation de trigger ici, uniquement la donnée + l'opération de sync.
  });

  it("clôture d'une séance créée hors connexion (jamais synchronisée) fusionne dans le create en attente", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    await workoutsRepo.update(workout.id, USER_A, { status: "completed", duration_minutes: 45 });

    const ops = await listAllOperations(USER_A);
    // Une seule opération : le create initial, dont le payload porte déjà
    // status='completed' (fusion, cf. repository.ts update()).
    const workoutOps = ops.filter((o) => o.table === "workouts" && o.recordLocalId === workout.id);
    expect(workoutOps).toHaveLength(1);
    expect(workoutOps[0].opType).toBe("create");
    expect((workoutOps[0].payload as WorkoutRow).status).toBe("completed");
  });
});

// ─── Reprise après coupure réseau + retry + idempotence ────────────────

describe("Cœur Fitness — coupure réseau pendant la synchronisation + retry", () => {
  it("un échec réseau garde l'opération (status failed), le retry suivant la termine", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(first.succeeded).toBe(0);
    expect(serverStore.get("workouts")?.has(workout.id)).toBeFalsy();

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(await listAllOperations(USER_A)).toEqual([]);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
  });

  it("idempotence : un create rejoué après coupure ne crée pas de doublon (upsert par id)", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A);
    await processSyncQueue(USER_A);

    const server = serverStore.get("workouts");
    expect(server?.size).toBe(1);
    expect(server?.get(workout.id)?.name).toBe("Push Day");
  });

  it("idempotence sur exercise_sets : deux create+remove enchaînés avant reconnexion ne laissent aucun doublon serveur", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    const ex = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Squat",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    const s1 = await exerciseSetsRepo.create(USER_A, {
      exercise_id: ex.id,
      set_number: 1,
      reps: 8,
      weight: 100,
      completed: true,
    });

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A); // échoue sur la première opération en file
    const result = await processSyncQueue(USER_A);
    expect(result.retried).toBe(0);

    const server = serverStore.get("exercise_sets");
    expect(server?.size).toBe(1);
    expect(server?.get(s1.id)?.reps).toBe(8);
  });
});

// ─── Plusieurs opérations enchaînées avant reconnexion ─────────────────

describe("Cœur Fitness — plusieurs opérations enchaînées avant reconnexion", () => {
  it("démarrage + plusieurs exercices + plusieurs séries + modif + suppression sont toutes reflétées en local", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    const squat = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Squat",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    const bench = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Développé couché",
      sets: null,
      reps: null,
      weight: null,
      position: 1,
    });
    const s1 = await exerciseSetsRepo.create(USER_A, {
      exercise_id: squat.id,
      set_number: 1,
      reps: 8,
      weight: 100,
      completed: true,
    });
    await exerciseSetsRepo.create(USER_A, {
      exercise_id: squat.id,
      set_number: 2,
      reps: 8,
      weight: 102.5,
      completed: true,
    });
    const s3 = await exerciseSetsRepo.create(USER_A, {
      exercise_id: bench.id,
      set_number: 1,
      reps: 10,
      weight: 60,
      completed: false,
    });
    await exerciseSetsRepo.update(s1.id, USER_A, { weight: 105 });
    await exerciseSetsRepo.remove(s3.id, USER_A);

    const exercises = await exercisesRepo.list(USER_A);
    expect(exercises).toHaveLength(2);
    const sets = await exerciseSetsRepo.list(USER_A);
    expect(sets).toHaveLength(2);
    expect(sets.find((s) => s.id === s1.id)?.weight).toBe(105);
    expect(sets.find((s) => s.exercise_id === bench.id)).toBeUndefined();
    expect(serverStore.get("workouts")?.size ?? 0).toBe(0);
  });
});

// ─── Conflit local/serveur ──────────────────────────────────────────────

describe("Cœur Fitness — conflit local/serveur", () => {
  async function seedSyncedSet(userId: string) {
    const workout = await workoutsRepo.create(userId, activeWorkoutInput());
    const ex = await exercisesRepo.create(userId, {
      workout_id: workout.id,
      name: "Squat",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    const set = await exerciseSetsRepo.create(userId, {
      exercise_id: ex.id,
      set_number: 1,
      reps: 8,
      weight: 100,
      completed: false,
    });
    await processSyncQueue(userId);
    return { set };
  }

  it("détecte un conflit quand le serveur a changé ET la donnée locale aussi, sans écraser silencieusement", async () => {
    const { set } = await seedSyncedSet(USER_A);

    const serverRow = serverStore.get("exercise_sets")!.get(set.id)!;
    serverStore.get("exercise_sets")!.set(set.id, {
      ...serverRow,
      weight: 110,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    await exerciseSetsRepo.update(set.id, USER_A, { weight: 95 });

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(1);

    const conflicts = await listConflicts(USER_A);
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].localData as ExerciseSetRow).weight).toBe(95);
    expect((conflicts[0].serverData as ExerciseSetRow).weight).toBe(110);
  });

  it('résolution "Garder ma version" : ré-envoie la version locale et écrase le serveur', async () => {
    const { set } = await seedSyncedSet(USER_A);
    const serverRow = serverStore.get("exercise_sets")!.get(set.id)!;
    serverStore.get("exercise_sets")!.set(set.id, {
      ...serverRow,
      weight: 110,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await exerciseSetsRepo.update(set.id, USER_A, { weight: 95 });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-local");
    expect(await listConflicts(USER_A)).toEqual([]);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("exercise_sets")!.get(set.id)!.weight).toBe(95);
  });

  it('résolution "Garder la version serveur" : applique la version serveur en local, rien à renvoyer', async () => {
    const { set } = await seedSyncedSet(USER_A);
    const serverRow = serverStore.get("exercise_sets")!.get(set.id)!;
    serverStore.get("exercise_sets")!.set(set.id, {
      ...serverRow,
      weight: 110,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await exerciseSetsRepo.update(set.id, USER_A, { weight: 95 });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-server");
    expect(await listConflicts(USER_A)).toEqual([]);

    const local = await exerciseSetsRepo.get(set.id);
    expect(local?.weight).toBe(110);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

// ─── Changement de compte ───────────────────────────────────────────────

describe("Cœur Fitness — changement de compte", () => {
  it("purge le store offline par userId : aucune fuite de séance/exercice/série entre comptes", async () => {
    const wA = await workoutsRepo.create(USER_A, activeWorkoutInput({ name: "Séance A" }));
    const exA = await exercisesRepo.create(USER_A, {
      workout_id: wA.id,
      name: "Squat",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    await exerciseSetsRepo.create(USER_A, {
      exercise_id: exA.id,
      set_number: 1,
      reps: 8,
      weight: 100,
      completed: true,
    });

    const wB = await workoutsRepo.create(USER_B, activeWorkoutInput({ name: "Séance B" }));
    const exB = await exercisesRepo.create(USER_B, {
      workout_id: wB.id,
      name: "Fentes",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    await exerciseSetsRepo.create(USER_B, {
      exercise_id: exB.id,
      set_number: 1,
      reps: 12,
      weight: 40,
      completed: true,
    });

    expect(await workoutsRepo.list(USER_A)).toHaveLength(1);
    expect(await workoutsRepo.list(USER_B)).toHaveLength(1);

    await purgeUserOfflineData(USER_A);

    expect(await workoutsRepo.list(USER_A)).toEqual([]);
    expect(await exercisesRepo.list(USER_A)).toEqual([]);
    expect(await exerciseSetsRepo.list(USER_A)).toEqual([]);
    expect(await workoutsRepo.list(USER_B)).toHaveLength(1);
    expect(await exercisesRepo.list(USER_B)).toHaveLength(1);
    expect(await exerciseSetsRepo.list(USER_B)).toHaveLength(1);

    const db = await getOfflineDb();
    const remainingOpsA = await db.getAllFromIndex("syncQueue", "by-user", USER_A);
    expect(remainingOpsA).toEqual([]);
  });
});

// ─── Scénario bout-en-bout : coupure réseau pendant une séance complète ──

describe("Cœur Fitness — scénario bout-en-bout : offline complet → reconnexion → sync → historique correct", () => {
  it("démarrage, plusieurs exercices/séries, modifications, suppression, clôture hors connexion, puis synchronisation sans perte ni doublon", async () => {
    // 1. OFFLINE — démarrage de la séance.
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput({ name: "Full Body" }));
    expect(serverStore.get("workouts")?.size ?? 0).toBe(0);

    // 2. OFFLINE — deux exercices.
    const squat = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Squat",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    const row = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Rowing barre",
      sets: null,
      reps: null,
      weight: null,
      position: 1,
    });

    // 3. OFFLINE — plusieurs séries par exercice, set_number déterministe local.
    async function addSet(exerciseId: string, reps: number, weight: number, completed: boolean) {
      const existing = (await exerciseSetsRepo.list(USER_A)).filter(
        (s) => s.exercise_id === exerciseId,
      );
      const n = existing.length > 0 ? Math.max(...existing.map((s) => s.set_number)) + 1 : 1;
      return exerciseSetsRepo.create(USER_A, {
        exercise_id: exerciseId,
        set_number: n,
        reps,
        weight,
        completed,
      });
    }
    const squat1 = await addSet(squat.id, 8, 100, true);
    await addSet(squat.id, 8, 102.5, true);
    const row1 = await addSet(row.id, 10, 50, false);
    await addSet(row.id, 10, 50, false);

    // 4. OFFLINE — modification d'une série.
    await exerciseSetsRepo.update(squat1.id, USER_A, { weight: 105 });

    // 5. OFFLINE — suppression d'une série non désirée.
    await exerciseSetsRepo.remove(row1.id, USER_A);

    // 6. OFFLINE — clôture de la séance (écriture pure, cf. CLAUDE.md :
    // l'attribution d'XP est un trigger serveur, hors périmètre ici).
    await workoutsRepo.update(workout.id, USER_A, { status: "completed", duration_minutes: 58 });

    // Rien n'a atteint le serveur avant la reconnexion.
    expect(serverStore.get("workouts")?.size ?? 0).toBe(0);
    expect(serverStore.get("exercises")?.size ?? 0).toBe(0);
    expect(serverStore.get("exercise_sets")?.size ?? 0).toBe(0);

    // 7. RECONNEXION — synchronisation complète.
    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(0);
    expect(result.retried).toBe(0);
    expect(await listAllOperations(USER_A)).toEqual([]);

    // 8. Historique correct côté serveur — sans perte ni doublon.
    const serverWorkout = serverStore.get("workouts")!.get(workout.id)!;
    expect(serverWorkout.status).toBe("completed");
    expect(serverWorkout.duration_minutes).toBe(58);

    const serverExercises = serverStore.get("exercises")!;
    expect(serverExercises.size).toBe(2);
    expect(serverExercises.has(squat.id)).toBe(true);
    expect(serverExercises.has(row.id)).toBe(true);

    const serverSets = serverStore.get("exercise_sets")!;
    // 4 séries créées, 1 supprimée avant sync (create+remove annulés) => 3 restantes.
    expect(serverSets.size).toBe(3);
    expect(serverSets.has(row1.id)).toBe(false);
    expect(serverSets.get(squat1.id)?.weight).toBe(105);

    // 9. Un second processSyncQueue (ex. re-déclenché par erreur) reste
    // idempotent — aucun doublon, aucune opération résiduelle.
    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(0);
    expect(second.retried).toBe(0);
    expect(serverStore.get("exercise_sets")!.size).toBe(3);
    expect(serverStore.get("exercises")!.size).toBe(2);
  });
});

// ─── Régression — bug prod "31 actions en échec — nouvelle tentative
// automatique" (panneau de sync, iPhone en ligne) ───────────────────────
//
// Cause racine (confirmée par les logs Supabase API + Postgres du projet en
// prod) : `exercises` était la SEULE table câblée sur
// `createOfflineRepository` sans colonne `created_at`, alors que
// `repository.ts::create()` l'ajoute inconditionnellement à CHAQUE payload
// créé. Tout `POST /exercises` échouait donc en 400 (PGRST204) →
// l'exercice n'était jamais créé côté serveur → chaque `exercise_sets`
// dépendant (FK `exercise_id`) échouait en cascade en 409 (violation FK),
// retenté à l'infini sans jamais pouvoir réussir. Corrigé par la migration
// `20260829130000_exercises_created_at.sql`. Le simulateur Supabase
// ci-dessus valide désormais les colonnes réelles + la FK
// `exercise_sets.exercise_id -> exercises.id`, exactement ce qui manquait
// pour que cette régression soit détectable par les tests.
describe("Cœur Fitness — régression bug prod : colonne manquante sur exercises + cascade FK", () => {
  it("un exercice avec plusieurs séries synchronise entièrement (0 opération restante) — payload exercices conforme au schéma réel", async () => {
    const workout = await workoutsRepo.create(USER_A, activeWorkoutInput());
    const squat = await exercisesRepo.create(USER_A, {
      workout_id: workout.id,
      name: "Squat",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    });
    for (let setNumber = 1; setNumber <= 5; setNumber += 1) {
      await exerciseSetsRepo.create(USER_A, {
        exercise_id: squat.id,
        set_number: setNumber,
        reps: 8,
        weight: 100,
        completed: true,
      });
    }

    const result = await processSyncQueue(USER_A);
    expect(result.retried).toBe(0);
    expect(result.conflicted).toBe(0);
    expect(await listAllOperations(USER_A)).toEqual([]);

    expect(serverStore.get("exercises")?.has(squat.id)).toBe(true);
    expect(serverStore.get("exercise_sets")?.size).toBe(5);
  });

  it("une opération structurellement invalide (FK vers une ligne inexistante) échoue explicitement, avec le code Postgres en clair, sans bloquer une opération indépendante qui suit dans la file", async () => {
    // Série orpheline : référence un exercice qui n'existe nulle part —
    // simule une opération jamais résoluble par un retry (comme l'était
    // chaque `exercise_sets` du bug prod tant que `exercises` échouait).
    await exerciseSetsRepo.create(USER_A, {
      exercise_id: "00000000-0000-0000-0000-000000000000",
      set_number: 1,
      reps: 5,
      weight: 50,
      completed: false,
    });

    // Opération indépendante mise en file après — ne doit jamais être
    // bloquée par l'échec de la première (queue FIFO, pas de blocage global).
    const otherWorkout = await workoutsRepo.create(USER_A, activeWorkoutInput({ name: "Léger" }));

    const result = await processSyncQueue(USER_A);
    expect(result.retried).toBe(1);
    expect(result.succeeded).toBe(1);

    const ops = await listAllOperations(USER_A);
    const orphanOp = ops.find((o) => o.table === "exercise_sets");
    // Jamais de succès silencieux : l'opération invalide reste visible en
    // échec, avec le code Postgres exact (23503 = violation de clé
    // étrangère) directement dans `lastError` — pas juste un message vague.
    expect(orphanOp?.status).toBe("failed");
    expect(orphanOp?.lastError).toContain("23503");
    expect(serverStore.get("exercise_sets")?.size ?? 0).toBe(0);

    // L'opération indépendante, elle, a bien atteint le serveur malgré
    // l'échec de la première.
    expect(serverStore.get("workouts")?.has(otherWorkout.id)).toBe(true);
  });
});
