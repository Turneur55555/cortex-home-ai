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
 * CHANTIER 3 — VÉRITÉ DES TIMESTAMPS.
 *
 * MAJ-02 : un trigger AFTER qui réécrit la ligne rend le `updated_at` du
 * `RETURNING` périmé À L'INSTANT MÊME où le client le reçoit — mémoriser
 * cette valeur fabrique un faux conflit `updated_at_mismatch` à la
 * modification suivante.
 *
 * MIN-16 : une modification locale SANS contenu réellement synchronisable ne
 * doit avancer aucun horodatage local.
 *
 * Le simulateur Supabase ci-dessous reproduit le comportement RÉEL de la base
 * (vérifié en direct sur le projet `bcwfvpwxzlmkxobvbtzp` via `pg_trigger` /
 * `pg_get_functiondef`) :
 *
 *   - `trg_workouts_updated_at` — `BEFORE UPDATE ON public.workouts`
 *     → `public.set_updated_at()` → `NEW.updated_at = now()` ;
 *   - `trg_award_xp_on_workout_complete` —
 *     `AFTER INSERT OR UPDATE OF status ON public.workouts`
 *     → `public.award_xp_on_workout_complete()`, qui termine par
 *       `UPDATE public.workouts SET xp_before = …, xp_after = …,
 *        level_before = …, level_after = … WHERE id = NEW.id;`
 *     Cet UPDATE imbriqué redéclenche le trigger BEFORE ci-dessus : il
 *     AVANCE `updated_at` une seconde fois, APRÈS que PostgreSQL a calculé
 *     le `RETURNING` de l'instruction cliente.
 *
 * `exercises` sert de témoin : même table offline, aucun trigger AFTER, donc
 * aucun surcoût ni changement de comportement attendu.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

/** Horloge serveur strictement croissante (`now()` du trigger). */
let serverClockMs = 0;
function serverNow(): string {
  serverClockMs += 1_000;
  return new Date(serverClockMs).toISOString();
}

interface SimulatorOptions {
  /**
   * Rang de la lecture (`select`) à faire échouer, compté depuis
   * `resetReadCounter()`. Sert à faire tomber PRÉCISÉMENT la relecture
   * post-écriture de MAJ-02 (la 2e lecture d'un `update` : la 1re est la
   * garde PGRST116 qui existait déjà), pour prouver qu'un succès reste un
   * succès même quand la relecture échoue.
   */
  failReadAt?: number;
}

let readCounter = 0;
function resetReadCounter(): void {
  readCounter = 0;
}

/** Ce que le serveur a réellement RENVOYÉ au client (RETURNING), par id. */
const returnedUpdatedAt = new Map<string, string>();
/** Nombre de lectures (`select`) par table — mesure le coût de la relecture. */
const readsByTable: Record<string, number> = {};

const server = new Map<string, Map<string, Row>>();
const simulator: SimulatorOptions = {};

function storeFor(table: string): Map<string, Row> {
  if (!server.has(table)) server.set(table, new Map());
  return server.get(table) as Map<string, Row>;
}

/**
 * `award_xp_on_workout_complete()` simulé — uniquement ce qui compte ici :
 * l'écriture imbriquée sur la ligne, et donc le second passage du trigger
 * BEFORE qui avance `updated_at`.
 */
function runAfterTriggerOnWorkouts(row: Row, previousStatus: string | undefined): void {
  if (row.status !== "completed") return;
  if (previousStatus === "completed") return;
  storeFor("workouts").set(row.id, {
    ...row,
    xp_before: 0,
    xp_after: 150,
    level_before: 1,
    level_after: 2,
    // UPDATE imbriqué → `trg_workouts_updated_at` → `now()`.
    updated_at: serverNow(),
  });
}

function createFakeSupabase() {
  return {
    from(table: string) {
      const store = storeFor(table);
      let op: { type: "upsert" | "update" | "delete"; payload?: Row } | null = null;
      const filters: Record<string, string> = {};

      const exec = async (): Promise<{ data: unknown; error: unknown }> => {
        if (!op) {
          readsByTable[table] = (readsByTable[table] ?? 0) + 1;
          readCounter += 1;
          if (simulator.failReadAt === readCounter) {
            return { data: null, error: new Error("lecture impossible (réseau)") };
          }
          const rows = Array.from(store.values()).filter((row) =>
            Object.entries(filters).every(([col, val]) => row[col] === val),
          );
          if (filters.id) return { data: rows[0] ?? null, error: null };
          return { data: rows, error: null };
        }

        if (op.type === "upsert") {
          const previous = store.get((op.payload as Row).id);
          const row: Row = { ...(op.payload as Row), updated_at: serverNow() };
          store.set(row.id, row);
          // RETURNING : figé AVANT l'exécution des triggers AFTER.
          const returned = { ...row };
          if (table === "workouts") {
            runAfterTriggerOnWorkouts(row, previous?.status as string | undefined);
          }
          returnedUpdatedAt.set(row.id, returned.updated_at as string);
          return { data: returned, error: null };
        }

        if (op.type === "update") {
          const id = filters.id;
          if (!id || !store.has(id)) {
            return { data: null, error: { message: "0 rows", code: "PGRST116" } };
          }
          const existing = store.get(id) as Row;
          const updated: Row = {
            ...existing,
            ...(op.payload as Row),
            // `set_updated_at()` : la base impose sa valeur, quoi qu'envoie le client.
            updated_at: serverNow(),
          };
          store.set(id, updated);
          const returned = { ...updated };
          if (table === "workouts") {
            runAfterTriggerOnWorkouts(updated, existing.status as string | undefined);
          }
          returnedUpdatedAt.set(id, returned.updated_at as string);
          return { data: returned, error: null };
        }

        if (filters.id) store.delete(filters.id);
        return { data: null, error: null };
      };

      const builder = {
        select: () => builder,
        eq(col: string, val: string) {
          filters[col] = val;
          return builder;
        },
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        range: () => exec(),
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

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase();
  },
}));

import { clearAllOfflineDataForTests, entityKey, getOfflineDb, resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import { listConflicts, processSyncQueue } from "./syncEngine";
import { listAllOperations } from "./syncQueue";
import { SERVER_REWRITTEN_TABLES, serverRewritesRowAfterReturning } from "./serverRewrittenRows";
import type { OfflineEntity } from "./types";

const USER = "22222222-2222-4222-8222-222222222222";

interface WorkoutRow {
  id: string;
  user_id: string;
  name: string;
  date: string;
  status: string;
  notes: string | null;
  xp_before: number | null;
  xp_after: number | null;
  level_before: number | null;
  level_after: number | null;
  created_at: string;
  updated_at: string;
}

interface ExerciseRow {
  id: string;
  user_id: string;
  workout_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");
const exercisesRepo = createOfflineRepository<ExerciseRow>("exercises");

function newWorkout(): Omit<WorkoutRow, "id" | "user_id" | "created_at" | "updated_at"> {
  return {
    name: "Push",
    date: "2026-09-03",
    status: "active",
    notes: null,
    xp_before: null,
    xp_after: null,
    level_before: null,
    level_after: null,
  };
}

function newExercise(
  workoutId: string,
): Omit<ExerciseRow, "id" | "user_id" | "created_at" | "updated_at"> {
  return { workout_id: workoutId, name: "Développé couché", position: 0 };
}

async function readEntity(table: string, id: string): Promise<OfflineEntity | undefined> {
  const db = await getOfflineDb();
  return (await db.get("entities", entityKey(table, id))) as OfflineEntity | undefined;
}

function persistedUpdatedAt(table: string, id: string): string {
  return storeFor(table).get(id)?.updated_at as string;
}

beforeEach(async () => {
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
  await clearAllOfflineDataForTests();
  server.clear();
  returnedUpdatedAt.clear();
  for (const key of Object.keys(readsByTable)) delete readsByTable[key];
  simulator.failReadAt = undefined;
  resetReadCounter();
  serverClockMs = Date.parse("2026-09-03T08:00:00.000Z");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── MAJ-02 ────────────────────────────────────────────────────────────────

describe("MAJ-02 — `updated_at` réécrit par un trigger AFTER après le RETURNING", () => {
  it("le scénario est RÉEL : le RETURNING d'une clôture de séance est déjà périmé", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);

    await workoutsRepo.update(workout.id, USER, { status: "completed" });
    await processSyncQueue(USER);

    // C'est toute la cause racine : ce que le serveur a RENVOYÉ n'est pas ce
    // qu'il a PERSISTÉ. Si cette assertion tombe, le simulateur ne reproduit
    // plus le trigger et les tests suivants ne prouvent plus rien.
    expect(returnedUpdatedAt.get(workout.id)).not.toBe(persistedUpdatedAt("workouts", workout.id));
  });

  it("le moteur mémorise le `updated_at` RÉELLEMENT persisté, pas celui du RETURNING", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);
    await workoutsRepo.update(workout.id, USER, { status: "completed" });
    await processSyncQueue(USER);

    const entity = await readEntity("workouts", workout.id);
    expect(entity?.serverUpdatedAt).toBe(persistedUpdatedAt("workouts", workout.id));
    expect(entity?.serverUpdatedAt).not.toBe(returnedUpdatedAt.get(workout.id));
  });

  it("la relecture ramène aussi les colonnes calculées par le trigger (xp_before/xp_after)", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);
    await workoutsRepo.update(workout.id, USER, { status: "completed" });
    await processSyncQueue(USER);

    const local = await workoutsRepo.get(workout.id);
    expect(local?.xp_after).toBe(150);
    expect(local?.level_after).toBe(2);
  });

  it("la modification locale SUIVANTE ne produit AUCUN faux conflit", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);
    await workoutsRepo.update(workout.id, USER, { status: "completed" });
    await processSyncQueue(USER);

    // Renommage/annotation juste après la clôture — le cas exact remonté par
    // l'audit : personne d'autre n'a touché la séance.
    await workoutsRepo.update(workout.id, USER, { notes: "super séance" });
    const result = await processSyncQueue(USER);

    expect(result.conflicted).toBe(0);
    expect(result.succeeded).toBe(1);
    expect(await listConflicts(USER)).toHaveLength(0);
    expect(await listAllOperations(USER)).toHaveLength(0);
    expect(storeFor("workouts").get(workout.id)?.notes).toBe("super séance");
  });

  it("CONTRE-ÉPREUVE : avec le `updated_at` du RETURNING, le même scénario lève bien un faux conflit", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);
    await workoutsRepo.update(workout.id, USER, { status: "completed" });
    await processSyncQueue(USER);

    // On remet à la main l'état d'AVANT le correctif : l'entité croit que le
    // serveur en est resté au `updated_at` du RETURNING.
    const db = await getOfflineDb();
    const key = entityKey("workouts", workout.id);
    const entity = (await db.get("entities", key)) as OfflineEntity;
    await db.put("entities", {
      ...entity,
      serverUpdatedAt: returnedUpdatedAt.get(workout.id) as string,
    } as OfflineEntity);

    await workoutsRepo.update(workout.id, USER, { notes: "super séance" });
    const result = await processSyncQueue(USER);

    expect(result.conflicted).toBe(1);
    const conflicts = await listConflicts(USER);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe("updated_at_mismatch");
  });

  it("une table SANS trigger AFTER ne paie aucune relecture supplémentaire", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);
    const exercise = await exercisesRepo.create(USER, newExercise(workout.id));
    await processSyncQueue(USER);

    const readsBefore = readsByTable.exercises ?? 0;
    await exercisesRepo.update(exercise.id, USER, { name: "Développé incliné" });
    await processSyncQueue(USER);

    // Une seule lecture : la garde PGRST116 qui existait déjà avant ce
    // chantier. Aucune relecture post-écriture pour une table non déclarée.
    expect((readsByTable.exercises ?? 0) - readsBefore).toBe(1);
    expect(serverRewritesRowAfterReturning("exercises")).toBe(false);
    expect([...SERVER_REWRITTEN_TABLES]).toEqual(["workouts"]);
  });

  it("un échec de la relecture ne transforme JAMAIS un succès en échec", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);

    await workoutsRepo.update(workout.id, USER, { status: "completed" });

    // Sur un `update`, le moteur lit deux fois : 1) la garde PGRST116 avant
    // d'écrire, 2) la relecture post-écriture de MAJ-02. On fait tomber la
    // SECONDE : l'écriture, elle, a déjà réussi côté serveur.
    resetReadCounter();
    simulator.failReadAt = 2;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await processSyncQueue(USER);
    errorSpy.mockRestore();

    expect(result.succeeded).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.blocked).toBe(0);
    expect(await listAllOperations(USER)).toHaveLength(0);
    expect(storeFor("workouts").get(workout.id)?.status).toBe("completed");

    // Repli documenté : faute de relecture, on garde la valeur du RETURNING —
    // exactement le comportement d'avant le correctif, jamais une perte.
    const entity = await readEntity("workouts", workout.id);
    expect(entity?.serverUpdatedAt).toBe(returnedUpdatedAt.get(workout.id));
  });
});

// ─── MIN-16 ────────────────────────────────────────────────────────────────

describe("MIN-16 — une modification sans contenu synchronisable n'avance rien", () => {
  it("un patch vide est un NO-OP strict : aucun horodatage local avancé, aucune opération enfilée", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);

    const before = await readEntity("workouts", workout.id);
    const returned = await workoutsRepo.update(workout.id, USER, {});
    const after = await readEntity("workouts", workout.id);

    expect(await listAllOperations(USER)).toHaveLength(0);
    expect(after?.localUpdatedAt).toBe(before?.localUpdatedAt);
    expect(after?.syncStatus).toBe("synced");
    expect((after?.data as unknown as WorkoutRow).updated_at).toBe(
      (before?.data as unknown as WorkoutRow).updated_at,
    );
    expect(returned.updated_at).toBe((before?.data as unknown as WorkoutRow).updated_at);
  });

  it("un patch qui ne porte que des colonnes du contrat n'avance rien non plus", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);
    const before = await readEntity("workouts", workout.id);

    await workoutsRepo.update(workout.id, USER, {
      updated_at: "2099-01-01T00:00:00.000Z",
      created_at: "2099-01-01T00:00:00.000Z",
      id: "id-pirate",
    } as Partial<WorkoutRow>);

    const after = await readEntity("workouts", workout.id);
    expect(await listAllOperations(USER)).toHaveLength(0);
    expect(after?.localUpdatedAt).toBe(before?.localUpdatedAt);
    expect(after?.serverUpdatedAt).toBe(before?.serverUpdatedAt);
    // L'identité de la ligne n'est jamais réécrite en local non plus.
    expect((after?.data as unknown as WorkoutRow).id).toBe(workout.id);
    expect((after?.data as unknown as WorkoutRow).updated_at).toBe(
      (before?.data as unknown as WorkoutRow).updated_at,
    );
  });

  it("une modification RÉELLEMENT synchronisable avance bien le timestamp local et part en file", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);
    const before = await readEntity("workouts", workout.id);

    await workoutsRepo.update(workout.id, USER, { notes: "à refaire" });

    const after = await readEntity("workouts", workout.id);
    expect(
      after?.localUpdatedAt.localeCompare(before?.localUpdatedAt ?? ""),
    ).toBeGreaterThanOrEqual(0);
    expect(after?.syncStatus).toBe("pending");
    expect(await listAllOperations(USER)).toHaveLength(1);
  });

  it("un no-op ne peut donc PAS fabriquer de conflit : la synchronisation suivante reste propre", async () => {
    const workout = await workoutsRepo.create(USER, newWorkout());
    await processSyncQueue(USER);

    await workoutsRepo.update(workout.id, USER, {});
    await workoutsRepo.update(workout.id, USER, { notes: "ok" });
    const result = await processSyncQueue(USER);

    expect(result.conflicted).toBe(0);
    expect(result.succeeded).toBe(1);
    expect(await listConflicts(USER)).toHaveLength(0);
  });
});
