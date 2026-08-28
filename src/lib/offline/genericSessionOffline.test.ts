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
 * Couverture offline-first du module Séance GÉNÉRIQUE (Course/Hyrox/
 * hybride — `workout_segments`, `src/hooks/useGenericActiveSession.ts`),
 * suite à l'audit offline du 28/08/2026 : cette table était intégralement
 * online-only (appels `supabase.from("workout_segments")` directs), donc
 * toute séance non-musculation perdait la totalité de ses données hors
 * connexion. Migrée vers `createOfflineRepository`, même infra générique
 * que `fitnessCoreOffline.test.ts` (musculation) — même simulateur
 * Supabase in-memory, mêmes garanties testées ici pour `workouts` +
 * `workout_segments` : les 10 scénarios demandés par l'audit de correction
 * (numérotés ci-dessous) sont couverts un par un.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface FakeSupabaseOptions {
  failNext?: boolean;
}

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
  workout_segments: new Set([
    "id",
    "user_id",
    "workout_id",
    "position",
    "label",
    "metric_key",
    "metrics",
    "completed",
    "discipline",
    "exercise_id",
    "created_at",
    "updated_at",
  ]),
};

const FOREIGN_KEYS: Record<string, Array<{ column: string; refTable: string }>> = {
  workout_segments: [{ column: "workout_id", refTable: "workouts" }],
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
import { resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import { listAllOperations } from "./syncQueue";
import { processSyncQueue } from "./syncEngine";

const USER_A = "user-a";

function freshIndexedDb() {
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
}

beforeEach(() => {
  freshIndexedDb();
  serverStore.clear();
  fakeSupabaseOpts.failNext = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface WorkoutRow extends Row {
  user_id: string;
  name: string;
  date: string;
  gym_location: string;
  status: string;
  discipline: string;
  duration_minutes: number | null;
}

interface WorkoutSegmentRow extends Row {
  user_id: string;
  workout_id: string;
  position: number;
  label: string;
  metric_key: string | null;
  metrics: Record<string, number | string>;
  completed: boolean;
  discipline: string | null;
  exercise_id: string | null;
}

const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");
const workoutSegmentsRepo = createOfflineRepository<WorkoutSegmentRow>("workout_segments");

const activeGenericWorkoutInput = (overrides: Partial<WorkoutRow> = {}) => ({
  name: "10 km fractionné",
  date: "2026-08-28",
  gym_location: "Extérieur",
  status: "active",
  discipline: "course",
  duration_minutes: null,
  ...overrides,
});

const segmentInput = (
  workoutId: string,
  overrides: Partial<WorkoutSegmentRow> = {},
): Omit<WorkoutSegmentRow, "id" | "user_id" | "created_at" | "updated_at"> => ({
  workout_id: workoutId,
  position: 0,
  label: "1 km",
  metric_key: "duration_seconds",
  metrics: { duration_seconds: 300 },
  completed: false,
  discipline: "course",
  exercise_id: null,
  ...overrides,
});

// ─── Test 2 : séance commencée entièrement hors connexion ──────────────

describe("Séance générique (Course/Hyrox/hybride) — démarrage entièrement hors connexion", () => {
  it("crée la séance ET ses segments localement, rien envoyé au serveur", async () => {
    const workout = await workoutsRepo.create(USER_A, activeGenericWorkoutInput());
    await workoutSegmentsRepo.create(
      USER_A,
      segmentInput(workout.id, { position: 0, label: "1 km" }),
    );
    await workoutSegmentsRepo.create(
      USER_A,
      segmentInput(workout.id, { position: 1, label: "2 km" }),
    );

    expect(await workoutsRepo.list(USER_A)).toHaveLength(1);
    const segments = await workoutSegmentsRepo.list(USER_A);
    expect(segments).toHaveLength(2);
    expect(serverStore.get("workouts")?.size ?? 0).toBe(0);
    expect(serverStore.get("workout_segments")?.size ?? 0).toBe(0);
  });
});

// ─── Test 1, 3, 5(bis), 9, 10 : coupure pendant la séance + fermeture/
// réouverture + refresh — jamais de perte, jamais de mémoire-only ────────

describe("Séance générique — coupure réseau en cours de séance, refresh, fermeture/réouverture", () => {
  it("Online → Offline en cours de séance : les segments ajoutés après la coupure restent visibles", async () => {
    const workout = await workoutsRepo.create(USER_A, activeGenericWorkoutInput());
    await processSyncQueue(USER_A); // séance créée pendant qu'on était encore en ligne
    expect(serverStore.get("workouts")?.has(workout.id)).toBe(true);

    // Coupure réseau : tout le reste de la séance se fait offline.
    const seg1 = await workoutSegmentsRepo.create(
      USER_A,
      segmentInput(workout.id, { position: 0, label: "1 km" }),
    );
    await workoutSegmentsRepo.update(seg1.id, USER_A, { completed: true });

    const local = await workoutSegmentsRepo.list(USER_A);
    expect(local).toHaveLength(1);
    expect(local[0].completed).toBe(true);
    expect(serverStore.get("workout_segments")?.size ?? 0).toBe(0);
  });

  it("Refresh hors connexion (relecture depuis IndexedDB) : les données déjà écrites restent identiques", async () => {
    const workout = await workoutsRepo.create(USER_A, activeGenericWorkoutInput());
    await workoutSegmentsRepo.create(USER_A, segmentInput(workout.id));

    // Simule un refresh de page : nouvelle instance de connexion IDB
    // (`resetOfflineDbForTests`) SANS remplacer `globalThis.indexedDB` —
    // les données sous-jacentes persistent réellement, comme IndexedDB le
    // ferait à travers un rechargement de page.
    resetOfflineDbForTests();

    const workoutsAfterRefresh = await workoutsRepo.list(USER_A);
    const segmentsAfterRefresh = await workoutSegmentsRepo.list(USER_A);
    expect(workoutsAfterRefresh).toHaveLength(1);
    expect(segmentsAfterRefresh).toHaveLength(1);
    expect(segmentsAfterRefresh[0].workout_id).toBe(workout.id);
  });

  it("Fermeture brutale puis réouverture, toujours hors connexion : la séance complète est intacte, rien en mémoire uniquement", async () => {
    const workout = await workoutsRepo.create(USER_A, activeGenericWorkoutInput());
    const seg1 = await workoutSegmentsRepo.create(
      USER_A,
      segmentInput(workout.id, { position: 0, label: "1 km" }),
    );
    await workoutSegmentsRepo.update(seg1.id, USER_A, {
      completed: true,
      metrics: { duration_seconds: 280 },
    });
    const seg2 = await workoutSegmentsRepo.create(
      USER_A,
      segmentInput(workout.id, { position: 1, label: "2 km" }),
    );
    await workoutSegmentsRepo.remove(seg2.id, USER_A); // segment retiré avant fermeture

    // "Fermeture brutale" = rien de plus ne s'exécute. "Réouverture" = une
    // nouvelle instance applicative relit le même IndexedDB (persistant par
    // nature, contrairement à tout état React en mémoire).
    resetOfflineDbForTests();

    const reopenedWorkouts = await workoutsRepo.list(USER_A);
    const reopenedSegments = await workoutSegmentsRepo.list(USER_A);
    expect(reopenedWorkouts).toHaveLength(1);
    expect(reopenedWorkouts[0].status).toBe("active");
    expect(reopenedSegments).toHaveLength(1);
    expect(reopenedSegments[0].completed).toBe(true);
    expect((reopenedSegments[0].metrics as Record<string, number>).duration_seconds).toBe(280);
    // Le serveur n'a jamais reçu quoi que ce soit avant reconnexion — la
    // seule copie qui a jamais existé était locale, donc AUCUNE perte
    // possible malgré la fermeture brutale.
    expect(serverStore.get("workouts")?.size ?? 0).toBe(0);
    expect(serverStore.get("workout_segments")?.size ?? 0).toBe(0);
  });
});

// ─── Test 4 : création offline puis modification immédiate ─────────────

describe("Séance générique — création d'un segment offline puis modification immédiate", () => {
  it("la modification s'applique bien, fusionnée dans le create encore en attente (une seule opération)", async () => {
    const workout = await workoutsRepo.create(USER_A, activeGenericWorkoutInput());
    const seg = await workoutSegmentsRepo.create(USER_A, segmentInput(workout.id));
    await workoutSegmentsRepo.update(seg.id, USER_A, { completed: true });

    const local = await workoutSegmentsRepo.get(seg.id);
    expect(local?.completed).toBe(true);

    const ops = (await listAllOperations(USER_A)).filter((o) => o.table === "workout_segments");
    expect(ops).toHaveLength(1);
    expect(ops[0].opType).toBe("create");
    expect((ops[0].payload as WorkoutSegmentRow).completed).toBe(true);
  });
});

// ─── Test 5 : création offline puis suppression immédiate ──────────────

describe("Séance générique — création d'un segment offline puis suppression immédiate", () => {
  it("annule proprement la création en attente : rien n'est jamais poussé au serveur", async () => {
    const workout = await workoutsRepo.create(USER_A, activeGenericWorkoutInput());
    const seg = await workoutSegmentsRepo.create(USER_A, segmentInput(workout.id));
    await workoutSegmentsRepo.remove(seg.id, USER_A);

    expect(await workoutSegmentsRepo.list(USER_A)).toEqual([]);
    const ops = (await listAllOperations(USER_A)).filter((o) => o.table === "workout_segments");
    expect(ops).toEqual([]);

    await processSyncQueue(USER_A);
    expect(serverStore.get("workout_segments")?.has(seg.id)).toBeFalsy();
  });
});

// ─── Test 6 : retour en ligne → synchronisation automatique ────────────

describe("Séance générique — retour en ligne, synchronisation complète", () => {
  it("séance + segments créés/modifiés/clôturés hors connexion atteignent le serveur sans perte", async () => {
    const workout = await workoutsRepo.create(
      USER_A,
      activeGenericWorkoutInput({ name: "Hyrox — simulation" }),
    );
    const seg1 = await workoutSegmentsRepo.create(
      USER_A,
      segmentInput(workout.id, { position: 0, label: "Row 1000m", discipline: "hyrox" }),
    );
    const seg2 = await workoutSegmentsRepo.create(
      USER_A,
      segmentInput(workout.id, { position: 1, label: "Sled push", discipline: "hyrox" }),
    );
    await workoutSegmentsRepo.update(seg1.id, USER_A, {
      completed: true,
      metrics: { duration_seconds: 240 },
    });
    await workoutsRepo.update(workout.id, USER_A, { status: "completed", duration_minutes: 45 });

    expect(serverStore.get("workouts")?.size ?? 0).toBe(0);
    expect(serverStore.get("workout_segments")?.size ?? 0).toBe(0);

    const result = await processSyncQueue(USER_A);
    expect(result.retried).toBe(0);
    expect(result.conflicted).toBe(0);
    expect(await listAllOperations(USER_A)).toEqual([]);

    const serverWorkout = serverStore.get("workouts")!.get(workout.id)!;
    expect(serverWorkout.status).toBe("completed");
    expect(serverWorkout.duration_minutes).toBe(45);

    const serverSegments = serverStore.get("workout_segments")!;
    expect(serverSegments.size).toBe(2);
    expect(serverSegments.get(seg1.id)?.completed).toBe(true);
    expect(serverSegments.has(seg2.id)).toBe(true);
  });
});

// ─── Test 7 : coupure pendant la synchronisation → reprise automatique ─

describe("Séance générique — coupure réseau pendant la synchronisation, retry", () => {
  it("un échec réseau garde l'opération en file (failed), le retry suivant la termine", async () => {
    const workout = await workoutsRepo.create(USER_A, activeGenericWorkoutInput());

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(serverStore.get("workouts")?.has(workout.id)).toBeFalsy();

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(await listAllOperations(USER_A)).toEqual([]);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
  });
});

// ─── Test 8 : aucun doublon créé côté serveur ───────────────────────────

describe("Séance générique — idempotence, aucun doublon", () => {
  it("un create rejoué après coupure ne crée jamais deux fois la même séance/segment", async () => {
    const workout = await workoutsRepo.create(USER_A, activeGenericWorkoutInput());
    await workoutSegmentsRepo.create(USER_A, segmentInput(workout.id));

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A); // échoue sur la première opération de la file
    await processSyncQueue(USER_A); // reprend, termine tout
    const again = await processSyncQueue(USER_A); // ré-appel redondant (ex. double clic "Réessayer")

    expect(again.succeeded).toBe(0);
    expect(serverStore.get("workouts")?.size).toBe(1);
    expect(serverStore.get("workout_segments")?.size).toBe(1);
  });
});

// ─── Scénario bout-en-bout ───────────────────────────────────────────────

describe("Séance générique — scénario bout-en-bout : séance Course complète offline → reconnexion → historique correct", () => {
  it("démarrage, plusieurs segments, modifications, suppression, clôture hors connexion, puis synchronisation sans perte ni doublon", async () => {
    const workout = await workoutsRepo.create(USER_A, activeGenericWorkoutInput({ name: "10 km" }));
    const km1 = await workoutSegmentsRepo.create(
      USER_A,
      segmentInput(workout.id, { position: 0, label: "Km 1" }),
    );
    const km2 = await workoutSegmentsRepo.create(
      USER_A,
      segmentInput(workout.id, { position: 1, label: "Km 2" }),
    );
    const km3 = await workoutSegmentsRepo.create(
      USER_A,
      segmentInput(workout.id, { position: 2, label: "Km 3 — abandonné" }),
    );
    await workoutSegmentsRepo.update(km1.id, USER_A, {
      completed: true,
      metrics: { duration_seconds: 300 },
    });
    await workoutSegmentsRepo.update(km2.id, USER_A, {
      completed: true,
      metrics: { duration_seconds: 295 },
    });
    await workoutSegmentsRepo.remove(km3.id, USER_A);
    await workoutsRepo.update(workout.id, USER_A, { status: "completed", duration_minutes: 10 });

    expect(serverStore.get("workouts")?.size ?? 0).toBe(0);
    expect(serverStore.get("workout_segments")?.size ?? 0).toBe(0);

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(0);
    expect(result.retried).toBe(0);
    expect(await listAllOperations(USER_A)).toEqual([]);

    const serverWorkout = serverStore.get("workouts")!.get(workout.id)!;
    expect(serverWorkout.status).toBe("completed");

    const serverSegments = serverStore.get("workout_segments")!;
    expect(serverSegments.size).toBe(2);
    expect(serverSegments.has(km3.id)).toBe(false);
    expect(serverSegments.get(km1.id)?.completed).toBe(true);
    expect(serverSegments.get(km2.id)?.completed).toBe(true);

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(0);
    expect(serverStore.get("workout_segments")!.size).toBe(2);
  });
});
