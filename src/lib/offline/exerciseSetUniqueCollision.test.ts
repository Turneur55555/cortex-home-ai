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
 * CHANTIER 8 — A1 : UNE COLLISION D'UNICITÉ SUR `exercise_sets` NE DOIT PLUS
 * POUVOIR RETENIR INDÉFINIMENT LA CLÔTURE D'UNE SÉANCE.
 *
 * LE SCÉNARIO, PRÉCISÉMENT
 * ------------------------
 * `exercise_sets` porte `UNIQUE (exercise_id, set_number)` (migration
 * `20260613172120_add_exercise_sets_table.sql`, vérifiée en base :
 * contrainte `exercise_sets_exercise_id_set_number_key`). Le numéro de série
 * est attribué CÔTÉ CLIENT à partir du store local
 * (`useAddExerciseSet` → `max(set_number local) + 1`). Deux contextes qui ne
 * partagent pas ce store — deux appareils, ou un appareil dont l'hydratation
 * n'a pas encore rapatrié la série de l'autre — choisissent donc le MÊME
 * numéro pour deux séries DIFFÉRENTES (ids clients distincts).
 *
 * À la synchronisation, la seconde ligne échoue en `23505`. Avant ce
 * chantier, cette erreur n'était classée nulle part : l'opération repartait à
 * l'identique, échouait à l'identique, et finissait par épuiser son budget de
 * tentatives (`MAX_RETRY_ATTEMPTS`, MIN-17) → `blocked`. Or `blocked` est une
 * dépendance VIVANTE pour la barrière du chantier 1 bis
 * (`LIVE_OPERATION_STATUSES`) : la clôture de la séance, qui déclare cette
 * série dans ses `dependsOnRecords`, n'était alors plus JAMAIS envoyée.
 * Conséquence en bout de chaîne : `award_xp_on_workout_complete` ne se
 * déclenche pas, `useSessionReward` reste sur `syncing` — écran de récompense
 * figé, XP jamais versée, séance bloquée localement.
 *
 * CE QUE VÉRIFIE CE FICHIER
 * -------------------------
 * Le faux serveur applique RÉELLEMENT la contrainte d'unicité et renvoie
 * l'erreur au format PostgREST exact (message + details relevés sur le projet
 * `bcwfvpwxzlmkxobvbtzp`), sans quoi le test ne prouverait rien.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface PgLikeError {
  message: string;
  code?: string;
  details?: string;
}

/**
 * Erreur d'unicité telle que PostgREST la remonte réellement (relevé direct
 * sur la base : `message` porte le NOM de la contrainte, `details` le couple
 * de colonnes et ses valeurs).
 */
function uniqueViolation(constraint: string, columns: string, values: string): PgLikeError {
  return {
    code: "23505",
    message: `duplicate key value violates unique constraint "${constraint}"`,
    details: `Key (${columns})=(${values}) already exists.`,
  };
}

/** Compteur de lectures serveur, pour prouver qu'aucune n'a lieu hors ligne. */
const serverReads = { count: 0 };

/**
 * Faux Supabase qui APPLIQUE les contraintes d'unicité réelles des tables du
 * scénario. Sans cela, la collision ne serait qu'une erreur inventée et le
 * test ne démontrerait pas le comportement de la vraie base.
 */
function createFakeSupabase(server: Map<string, Map<string, Row>>) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "upsert" | "update" | "delete"; payload?: Row } | null = null;
      const filters = new Map<string, unknown>();
      let selectedColumns = "*";

      /** UNIQUE (exercise_id, set_number) — la contrainte au cœur de A1. */
      const violatesSetNumberUnique = (row: Row): boolean =>
        table === "exercise_sets" &&
        Array.from(store.values()).some(
          (other) =>
            other.id !== row.id &&
            other.exercise_id === row.exercise_id &&
            other.set_number === row.set_number,
        );

      /** UNIQUE (workout_id) sur `workout_analyses` — contrainte NON remappable. */
      const violatesWorkoutAnalysisUnique = (row: Row): boolean =>
        table === "workout_analyses" &&
        Array.from(store.values()).some(
          (other) => other.id !== row.id && other.workout_id === row.workout_id,
        );

      /**
       * Index unique PARTIEL `workouts_one_active_per_user` : une seule séance
       * `active` par utilisateur. Violation qui dépend de l'ÉTAT SERVEUR, pas
       * du payload — une autre opération de la file peut la lever.
       */
      const violatesActiveWorkoutUnique = (row: Row): boolean =>
        table === "workouts" &&
        row.status === "active" &&
        Array.from(store.values()).some(
          (other) =>
            other.id !== row.id && other.user_id === row.user_id && other.status === "active",
        );

      const exec = async (): Promise<{ data: unknown; error: PgLikeError | null }> => {
        if (!op) {
          serverReads.count += 1;
          let rows = Array.from(store.values());
          for (const [column, value] of filters) {
            rows = rows.filter((row) => row[column] === value);
          }
          if (selectedColumns !== "*") {
            const wanted = selectedColumns.split(",").map((c) => c.trim());
            rows = rows.map(
              (row) => Object.fromEntries(wanted.map((c) => [c, row[c]])) as unknown as Row,
            );
          }
          if (filters.has("id")) return { data: rows[0] ?? null, error: null };
          return { data: rows, error: null };
        }

        if (op.type === "upsert") {
          const row: Row = { ...(op.payload as Row), updated_at: new Date().toISOString() };
          if (violatesSetNumberUnique(row)) {
            return {
              data: null,
              error: uniqueViolation(
                "exercise_sets_exercise_id_set_number_key",
                "exercise_id, set_number",
                `${String(row.exercise_id)}, ${String(row.set_number)}`,
              ),
            };
          }
          if (violatesWorkoutAnalysisUnique(row)) {
            return {
              data: null,
              error: uniqueViolation(
                "workout_analyses_workout_id_key",
                "workout_id",
                String(row.workout_id),
              ),
            };
          }
          if (violatesActiveWorkoutUnique(row)) {
            return {
              data: null,
              error: uniqueViolation(
                "workouts_one_active_per_user",
                "user_id",
                String(row.user_id),
              ),
            };
          }
          const previousStatus = store.get(row.id)?.status as string | undefined;
          store.set(row.id, row);
          if (table === "workouts" && row.status === "completed") {
            witnessCompletion(row.id, previousStatus);
          }
          return { data: row, error: null };
        }

        const idFilter = filters.get("id") as string | undefined;
        if (op.type === "update") {
          if (!idFilter || !store.has(idFilter)) {
            return { data: null, error: { message: "0 rows", code: "PGRST116" } };
          }
          const existing = store.get(idFilter) as Row;
          const updated: Row = {
            ...existing,
            ...(op.payload as Row),
            updated_at: new Date().toISOString(),
          };
          if (violatesSetNumberUnique(updated)) {
            return {
              data: null,
              error: uniqueViolation(
                "exercise_sets_exercise_id_set_number_key",
                "exercise_id, set_number",
                `${String(updated.exercise_id)}, ${String(updated.set_number)}`,
              ),
            };
          }
          store.set(idFilter, updated);
          if (table === "workouts" && updated.status === "completed") {
            witnessCompletion(idFilter, existing.status as string | undefined);
          }
          return { data: updated, error: null };
        }

        if (idFilter) store.delete(idFilter);
        return { data: null, error: null };
      };

      const builder = {
        select(columns?: string) {
          if (columns) selectedColumns = columns;
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.set(col, val);
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

/**
 * TÉMOIN DU TRIGGER `award_xp_on_workout_complete` : ce que le serveur voit
 * de la séance À L'INSTANT où elle atteint `completed`. Le vrai trigger ne se
 * redéclenche jamais (garde `OLD.status IS DISTINCT FROM 'completed'`) — cette
 * unique observation est donc bien ce qui décide de l'XP.
 */
const completionWitness: Array<{ exercises: number; sets: number }> = [];

function witnessCompletion(workoutId: string, previousStatus: string | undefined) {
  if (previousStatus === "completed") return;
  const exerciseIds = new Set(
    Array.from(serverStore.get("exercises")?.values() ?? [])
      .filter((e) => e.workout_id === workoutId)
      .map((e) => e.id),
  );
  completionWitness.push({
    exercises: exerciseIds.size,
    sets: Array.from(serverStore.get("exercise_sets")?.values() ?? []).filter((st) =>
      exerciseIds.has(st.exercise_id as string),
    ).length,
  });
}

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase(serverStore);
  },
}));

// Imports après le mock (obligatoire avec `vi.mock` hoisté).
import { getOfflineDb, resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import {
  hasLiveDependencies,
  hasQueuedOperationsForRecord,
  listAllOperations,
  listBlockedDependencies,
} from "./syncQueue";
import { discardBlockedOperation, processSyncQueue } from "./syncEngine";
import type { SyncOperation } from "./types";
import { collectWorkoutSyncDependencies } from "@/lib/fitness/workoutSyncDependencies";
import { resolveRewardConfirmation } from "@/lib/fitness/rpg/rewardConfirmation";

const USER = "user-a1";

interface WorkoutRow extends Row {
  user_id: string;
  name: string;
  status: string;
  created_at: string;
}
interface ExerciseRow extends Row {
  user_id: string;
  workout_id: string;
  name: string;
  created_at: string;
}
interface ExerciseSetRow extends Row {
  user_id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  created_at: string;
}
interface AnalysisRow extends Row {
  user_id: string;
  workout_id: string;
  created_at: string;
}

const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");
const exercisesRepo = createOfflineRepository<ExerciseRow>("exercises");
const setsRepo = createOfflineRepository<ExerciseSetRow>("exercise_sets");
const analysesRepo = createOfflineRepository<AnalysisRow>("workout_analyses");

function serverRows(table: string): Row[] {
  return Array.from(serverStore.get(table)?.values() ?? []);
}

/** Pré-remplit le serveur comme si un AUTRE appareil avait déjà poussé sa ligne. */
function seedServerRow(table: string, row: Row): void {
  if (!serverStore.has(table)) serverStore.set(table, new Map());
  (serverStore.get(table) as Map<string, Row>).set(row.id, {
    ...row,
    updated_at: new Date().toISOString(),
  });
}

async function readOp(opId: string): Promise<SyncOperation> {
  const db = await getOfflineDb();
  return (await db.get("syncQueue", opId)) as SyncOperation;
}

/**
 * Séance vécue hors ligne sur l'appareil A : séance + 1 exercice + N séries,
 * puis clôture protégée par ses dépendances RÉELLES (mêmes options que
 * `useFinishWorkout`).
 */
async function queueOfflineSession(setNumbers: number[]) {
  const workout = await workoutsRepo.create(USER, {
    name: "Push Day",
    status: "active",
  } as never);
  const exercise = await exercisesRepo.create(USER, {
    workout_id: workout.id,
    name: "Développé couché",
  } as never);
  const sets: ExerciseSetRow[] = [];
  for (const setNumber of setNumbers) {
    sets.push(
      await setsRepo.create(USER, {
        exercise_id: exercise.id,
        set_number: setNumber,
        reps: 10,
        weight: 60 + setNumber,
      } as never),
    );
  }

  const dependsOnRecords = collectWorkoutSyncDependencies(workout.id, {
    exercises: await exercisesRepo.list(USER),
    exerciseSets: await setsRepo.list(USER),
    workoutSegments: [],
  });
  await workoutsRepo.update(
    workout.id,
    USER,
    { status: "completed" },
    { neverMergeIntoPendingCreate: true, dependsOnRecords },
  );

  const ops = await listAllOperations(USER);
  const closureOp = ops.find(
    (op) => op.opType === "update" && op.recordLocalId === workout.id,
  ) as SyncOperation;
  return { workout, exercise, sets, closureOp };
}

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
  completionWitness.length = 0;
  serverReads.count = 0;
});

// ─── Reproduction du scénario A1 ───────────────────────────────────────

describe("A1 — collision 23505 sur exercise_sets", () => {
  it("REPRODUCTION : appareil B a déjà poussé la série n°2 → la série n°2 de A entre en collision", async () => {
    const { exercise, sets } = await queueOfflineSession([1, 2]);
    // L'appareil B a poussé SA série n°2 (id différent) pendant que A était
    // hors ligne : le couple (exercise_id, set_number) est déjà pris.
    seedServerRow("exercise_sets", {
      id: "set-de-l-appareil-b",
      user_id: USER,
      exercise_id: exercise.id,
      set_number: 2,
      reps: 8,
      weight: 80,
      created_at: new Date().toISOString(),
    });

    await processSyncQueue(USER);

    // La série n°2 de A n'a PAS écrasé celle de B, et elle n'est pas perdue.
    const rows = serverRows("exercise_sets");
    const fromB = rows.find((r) => r.id === "set-de-l-appareil-b");
    expect(fromB).toBeDefined();
    expect(fromB?.weight).toBe(80);
    // La donnée locale de A est intacte (poids 62 = 60 + 2).
    const localA = await setsRepo.get(sets[1].id);
    expect(localA?.weight).toBe(62);
  });

  it("la collision se résout d'elle-même : la série de A est poussée avec un numéro libre", async () => {
    const { exercise, sets } = await queueOfflineSession([1, 2]);
    seedServerRow("exercise_sets", {
      id: "set-de-l-appareil-b",
      user_id: USER,
      exercise_id: exercise.id,
      set_number: 2,
      reps: 8,
      weight: 80,
      created_at: new Date().toISOString(),
    });

    // Premier passage : collision détectée + remappage. Second passage : envoi.
    await processSyncQueue(USER);
    await processSyncQueue(USER);

    const pushed = serverRows("exercise_sets").find((r) => r.id === sets[1].id);
    expect(pushed).toBeDefined();
    expect(pushed?.weight).toBe(62);
    // Numéro strictement supérieur à celui déjà pris — jamais un doublon.
    expect(Number(pushed?.set_number)).toBeGreaterThan(2);
    // Aucun doublon (exercise_id, set_number) côté serveur.
    const pairs = serverRows("exercise_sets").map((r) => `${r.exercise_id}::${r.set_number}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    // Le store local est aligné sur le numéro réellement persisté.
    const local = await setsRepo.get(sets[1].id);
    expect(local?.set_number).toBe(pushed?.set_number);
  });

  it("la clôture n'est plus retenue : la séance est synchronisée et le serveur la voit COMPLÈTE", async () => {
    const { workout, exercise, closureOp } = await queueOfflineSession([1, 2]);
    seedServerRow("exercise_sets", {
      id: "set-de-l-appareil-b",
      user_id: USER,
      exercise_id: exercise.id,
      set_number: 2,
      reps: 8,
      weight: 80,
      created_at: new Date().toISOString(),
    });

    // Plusieurs passages, comme le fait le poll du driver offline.
    for (let i = 0; i < 4; i += 1) await processSyncQueue(USER);

    // Plus AUCUNE opération en file : la clôture est passée.
    expect(await listAllOperations(USER)).toEqual([]);
    expect(await readOp(closureOp.id)).toBeUndefined();
    const serverWorkout = serverRows("workouts").find((r) => r.id === workout.id);
    expect(serverWorkout?.status).toBe("completed");
    // Le trigger a observé la séance COMPLÈTE au moment de la clôture : les
    // deux séries de A (dont la renumérotée) PLUS celle que B avait déjà
    // poussée sur le même exercice — aucune n'a été perdue en route.
    expect(completionWitness).toEqual([{ exercises: 1, sets: 3 }]);
  });

  it("la barrière n'est jamais retenue par une opération BLOQUÉE née d'une collision", async () => {
    const { exercise, closureOp } = await queueOfflineSession([1, 2]);
    seedServerRow("exercise_sets", {
      id: "set-de-l-appareil-b",
      user_id: USER,
      exercise_id: exercise.id,
      set_number: 2,
      reps: 8,
      weight: 80,
      created_at: new Date().toISOString(),
    });

    for (let i = 0; i < 4; i += 1) await processSyncQueue(USER);

    // Aucune opération n'a été figée en `blocked` par la collision.
    const remaining = await listAllOperations(USER);
    expect(remaining.filter((op) => op.status === "blocked")).toEqual([]);
    expect(await hasLiveDependencies(USER, closureOp)).toBe(false);
  });

  it("collision en cascade : trois séries concurrentes finissent toutes sur des numéros distincts", async () => {
    const { exercise, sets } = await queueOfflineSession([1, 2, 3]);
    // L'appareil B a poussé SES trois séries en premier.
    for (const setNumber of [1, 2, 3]) {
      seedServerRow("exercise_sets", {
        id: `set-b-${setNumber}`,
        user_id: USER,
        exercise_id: exercise.id,
        set_number: setNumber,
        reps: 8,
        weight: 80,
        created_at: new Date().toISOString(),
      });
    }

    for (let i = 0; i < 8; i += 1) await processSyncQueue(USER);

    const rows = serverRows("exercise_sets");
    // Les 3 séries de B + les 3 de A, toutes présentes, toutes distinctes.
    expect(rows).toHaveLength(6);
    const pairs = rows.map((r) => `${r.exercise_id}::${r.set_number}`);
    expect(new Set(pairs).size).toBe(6);
    for (const set of sets) {
      expect(rows.some((r) => r.id === set.id)).toBe(true);
    }
    expect(await listAllOperations(USER)).toEqual([]);
  });
});

// ─── Aucune régression sur les AUTRES contraintes d'unicité ────────────

describe("Autres contraintes d'unicité — comportement inchangé", () => {
  it("UNIQUE(workout_id) sur workout_analyses : opération bloquée, donnée locale conservée", async () => {
    const workout = await workoutsRepo.create(USER, {
      name: "Push Day",
      status: "active",
    } as never);
    seedServerRow("workout_analyses", {
      id: "analyse-existante",
      user_id: USER,
      workout_id: workout.id,
      created_at: new Date().toISOString(),
    });
    const analysis = await analysesRepo.create(USER, { workout_id: workout.id } as never);

    await processSyncQueue(USER);

    const ops = await listAllOperations(USER);
    const analysisOp = ops.find((op) => op.recordLocalId === analysis.id) as SyncOperation;
    // Non remappable : aucune colonne de numérotation à recalculer — l'action
    // est bloquée immédiatement, visible, et la donnée locale est conservée.
    expect(analysisOp.status).toBe("blocked");
    expect(analysisOp.lastErrorCode).toBe("23505");
    expect(await analysesRepo.get(analysis.id)).toBeDefined();
    // La ligne serveur de l'autre analyse n'a jamais été touchée.
    expect(serverRows("workout_analyses")).toHaveLength(1);
  });

  it("workouts_one_active_per_user : reste RETRYABLE tant que la file peut clôturer l'autre séance", async () => {
    // Une séance est déjà `active` côté serveur (démarrée sur un autre appareil).
    const previous = await workoutsRepo.create(USER, {
      name: "Séance précédente",
      status: "active",
    } as never);
    await processSyncQueue(USER);
    expect(serverRows("workouts").find((r) => r.id === previous.id)?.status).toBe("active");

    // L'utilisateur démarre la suivante AVANT que la précédente ne soit
    // clôturée : la file porte donc, dans cet ordre, le `create` de la
    // nouvelle séance (qui va entrer en collision) puis la clôture de
    // l'ancienne (qui va lever la condition).
    const next = await workoutsRepo.create(USER, {
      name: "Nouvelle séance",
      status: "active",
    } as never);
    await workoutsRepo.update(previous.id, USER, { status: "completed" });

    await processSyncQueue(USER);
    // Régression évitée : maintenant que `23505` est classé non retryable, une
    // classification par CODE seul aurait bloqué cette création d'office. Elle
    // reste en échec temporaire parce que la file peut encore lever la
    // condition.
    const afterFirstPass = (await listAllOperations(USER)).find(
      (op) => op.recordLocalId === next.id,
    ) as SyncOperation;
    expect(afterFirstPass.status).toBe("failed");

    await processSyncQueue(USER);
    expect(await listAllOperations(USER)).toEqual([]);
    expect(serverRows("workouts").find((r) => r.id === next.id)?.status).toBe("active");
    expect(serverRows("workouts").find((r) => r.id === previous.id)?.status).toBe("completed");
  });

  it("workouts_one_active_per_user : bloque quand plus rien dans la file ne peut lever la condition", async () => {
    seedServerRow("workouts", {
      id: "seance-active-ailleurs",
      user_id: USER,
      name: "Séance d'un autre appareil",
      status: "active",
      created_at: new Date().toISOString(),
    });
    const next = await workoutsRepo.create(USER, {
      name: "Nouvelle séance",
      status: "active",
    } as never);

    await processSyncQueue(USER);

    const op = (await listAllOperations(USER)).find(
      (o) => o.recordLocalId === next.id,
    ) as SyncOperation;
    expect(op.status).toBe("blocked");
    expect(op.lastErrorCode).toBe("23505");
    // La séance locale n'est jamais supprimée : elle attend un arbitrage.
    expect(await workoutsRepo.get(next.id)).toBeDefined();
  });
});

// ─── Récompense : l'XP n'est plus retenue par la collision ─────────────

describe("Confirmation de la récompense (CRIT-03) après collision", () => {
  it("avant synchronisation la récompense reste honnêtement « syncing », après elle est confirmable", async () => {
    const { workout, exercise } = await queueOfflineSession([1, 2]);
    seedServerRow("exercise_sets", {
      id: "set-de-l-appareil-b",
      user_id: USER,
      exercise_id: exercise.id,
      set_number: 2,
      reps: 8,
      weight: 80,
      created_at: new Date().toISOString(),
    });

    // Tant que la clôture est en file, aucune XP ne peut être présentée.
    expect(await hasQueuedOperationsForRecord(USER, "workouts", workout.id)).toBe(true);
    expect(
      resolveRewardConfirmation({
        snapshot: null,
        hasQueuedWorkoutOps: true,
        isOnline: true,
      }),
    ).toBe("syncing");

    for (let i = 0; i < 4; i += 1) await processSyncQueue(USER);

    // La clôture a atteint le serveur : l'écran de récompense n'est plus figé.
    expect(await hasQueuedOperationsForRecord(USER, "workouts", workout.id)).toBe(false);
    expect(
      resolveRewardConfirmation({
        // Ce que le trigger `award_xp_on_workout_complete` dépose sur la séance.
        snapshot: { xp_before: 100, xp_after: 180, level_before: 3, level_after: 3 },
        hasQueuedWorkoutOps: false,
        isOnline: true,
      }),
    ).toBe("confirmed");
  });
});

// ─── `blocked` reste une dépendance vivante — mais découvrable ─────────

describe("Une opération BLOQUÉE pour une autre cause retient toujours la clôture", () => {
  it("l'invariant DISC-01b est préservé, la rétention est expliquée, et l'issue utilisateur la lève", async () => {
    const workout = await workoutsRepo.create(USER, {
      name: "Push Day",
      status: "active",
    } as never);
    const exercise = await exercisesRepo.create(USER, {
      workout_id: workout.id,
      name: "Développé couché",
    } as never);
    const analysis = await analysesRepo.create(USER, { workout_id: workout.id } as never);
    // Une analyse existe déjà côté serveur pour cette séance : son `create`
    // sera bloqué par `UNIQUE (workout_id)`, contrainte NON remappable.
    seedServerRow("workout_analyses", {
      id: "analyse-existante",
      user_id: USER,
      workout_id: workout.id,
      created_at: new Date().toISOString(),
    });

    // La clôture déclare l'analyse comme dépendance (cas volontairement forcé :
    // c'est le comportement générique de la barrière qui est vérifié ici).
    await workoutsRepo.update(
      workout.id,
      USER,
      { status: "completed" },
      {
        neverMergeIntoPendingCreate: true,
        dependsOnRecords: [
          { table: "exercises", recordLocalId: exercise.id },
          { table: "workout_analyses", recordLocalId: analysis.id },
        ],
      },
    );
    const closureOp = (await listAllOperations(USER)).find(
      (op) => op.opType === "update" && op.recordLocalId === workout.id,
    ) as SyncOperation;

    for (let i = 0; i < 3; i += 1) await processSyncQueue(USER);

    // INVARIANT DISC-01b : la clôture n'est PAS partie — le serveur ne doit
    // jamais observer une séance dont une écriture liée n'est pas arrivée.
    expect(serverRows("workouts").find((r) => r.id === workout.id)?.status).toBe("active");
    expect(completionWitness).toEqual([]);

    // DÉCOUVRABILITÉ : la file dit précisément QUI retient la clôture.
    const ops = await listAllOperations(USER);
    const blocking = listBlockedDependencies(closureOp, ops);
    expect(blocking.map((op) => op.recordLocalId)).toEqual([analysis.id]);

    // ISSUE UTILISATEUR : « Retirer de la file » lève la barrière sans jamais
    // supprimer la donnée locale.
    await discardBlockedOperation(blocking[0].id);
    expect(await analysesRepo.get(analysis.id)).toBeDefined();
    expect(await hasLiveDependencies(USER, closureOp)).toBe(false);

    await processSyncQueue(USER);
    expect(serverRows("workouts").find((r) => r.id === workout.id)?.status).toBe("completed");
    expect(completionWitness).toEqual([{ exercises: 1, sets: 0 }]);
  });
});

// ─── Hors ligne : aucune dépendance réseau pour créer une série ────────

describe("Fonctionnement hors ligne", () => {
  it("créer une série ne déclenche AUCUNE lecture ni écriture serveur", async () => {
    const { sets } = await queueOfflineSession([1, 2, 3]);
    expect(serverReads.count).toBe(0);
    expect(serverRows("exercise_sets")).toHaveLength(0);
    // Tout est bien enregistré localement, prêt à partir au retour du réseau.
    expect(await setsRepo.list(USER)).toHaveLength(3);
    expect(sets.map((s) => s.set_number)).toEqual([1, 2, 3]);
  });

  it("synchronisation après reconnexion : tout part, y compris après collision", async () => {
    const { workout, exercise } = await queueOfflineSession([1, 2, 3]);
    seedServerRow("exercise_sets", {
      id: "set-de-l-appareil-b",
      user_id: USER,
      exercise_id: exercise.id,
      set_number: 3,
      reps: 8,
      weight: 80,
      created_at: new Date().toISOString(),
    });

    for (let i = 0; i < 6; i += 1) await processSyncQueue(USER);

    expect(await listAllOperations(USER)).toEqual([]);
    expect(serverRows("workouts").find((r) => r.id === workout.id)?.status).toBe("completed");
    expect(completionWitness).toEqual([{ exercises: 1, sets: 4 }]);
  });
});
