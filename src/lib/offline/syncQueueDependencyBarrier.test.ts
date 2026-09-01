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
 * CHANTIER 1 BIS — BARRIÈRE DE DÉPENDANCE DE LA SYNC QUEUE (DISC-01b).
 *
 * PROBLÈME (reproduit et mesuré avant ce chantier) : le FIFO du moteur est un
 * ordre TEMPOREL, pas une dépendance. `processSyncQueue` traite chaque
 * opération indépendamment et POURSUIT la boucle après un échec. La clôture
 * d'une séance (`workouts.status='completed'`) pouvait donc être envoyée alors
 * que le `create` de ses exercices et de ses séries avait échoué — et le
 * trigger serveur `award_xp_on_workout_complete`, qui parcourt ces lignes,
 * s'exécutait sur une séance vide. Irréversible : son garde
 * (`OLD.status IS DISTINCT FROM 'completed'`) l'empêche de se redéclencher
 * quand les enfants finissent par arriver. En `blocked`, la perte était
 * définitive (une opération `blocked` n'est jamais reprise automatiquement).
 *
 * CORRECTIF : une barrière STRICTEMENT OPT-IN et EXPLICITE portée par
 * l'opération (`SyncOperation.dependsOnRecords`) — elle n'attend que les
 * ENREGISTREMENTS déclarés. Une écriture Nutrition, Recette ou Liste de
 * courses sans rapport ne retient JAMAIS la clôture. La file n'est par
 * ailleurs JAMAIS transformée en stop-on-error : une opération qui ne déclare
 * aucune dépendance garde son comportement exact, y compris lorsqu'elle suit
 * une opération en échec (tests dédiés plus bas + `fitnessCoreOffline.test.ts`,
 * inchangé).
 *
 * Même harnais que `syncQueueResilience.test.ts` : `fake-indexeddb` + faux
 * client Supabase en mémoire, avec ici la possibilité de faire échouer les
 * écritures d'une TABLE précise (c'est ce qui distingue un enfant d'une
 * opération indépendante dans les scénarios).
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface PgLikeError {
  message: string;
  code?: string;
}

interface FakeSupabaseOptions {
  /** Tables dont TOUTE écriture échoue, avec l'erreur donnée. */
  failWrites: Map<string, PgLikeError>;
}

function createFakeSupabase(server: Map<string, Map<string, Row>>, opts: FakeSupabaseOptions) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: PgLikeError | null }> => {
        // Seules les ÉCRITURES échouent : une lecture (détection de conflit)
        // n'est jamais l'objet du scénario.
        if (op && opts.failWrites.has(table)) {
          return { data: null, error: opts.failWrites.get(table) as PgLikeError };
        }
        if (!op) {
          if (idFilter) return { data: store.get(idFilter) ?? null, error: null };
          return { data: Array.from(store.values()), error: null };
        }
        if (op.type === "upsert") {
          const row: Row = { ...(op.payload as Row), updated_at: new Date().toISOString() };
          const previousStatus = store.get(row.id)?.status as string | undefined;
          store.set(row.id, row);
          if (table === "workouts" && row.status === "completed") {
            witnessCompletion(row.id, previousStatus);
          }
          return { data: row, error: null };
        }
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
const fakeSupabaseOpts: FakeSupabaseOptions = { failWrites: new Map() };

/**
 * TÉMOIN DU TRIGGER — enregistre, à chaque fois qu'une séance atteint
 * `status='completed'` EN BASE, ce que le serveur voit alors de ses enfants.
 * C'est la mesure directe de DISC-01b : le vrai trigger
 * `award_xp_on_workout_complete` parcourt exactement ces lignes, une seule
 * fois, sans jamais se redéclencher ensuite.
 */
const completionWitness: Array<{ exercises: number; sets: number }> = [];

function witnessCompletion(workoutId: string, previousStatus: string | undefined) {
  if (previousStatus === "completed") return;
  completionWitness.push({
    exercises: Array.from(serverStore.get("exercises")?.values() ?? []).filter(
      (e) => e.workout_id === workoutId,
    ).length,
    sets: (() => {
      const exerciseIds = new Set(
        Array.from(serverStore.get("exercises")?.values() ?? [])
          .filter((e) => e.workout_id === workoutId)
          .map((e) => e.id),
      );
      return Array.from(serverStore.get("exercise_sets")?.values() ?? []).filter((st) =>
        exerciseIds.has(st.exercise_id as string),
      ).length;
    })(),
  });
}

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase(serverStore, fakeSupabaseOpts);
  },
}));

// Imports après le mock (obligatoire avec vi.mock hoisté).
import { getOfflineDb, resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import { hasLiveDependencies, listAllOperations } from "./syncQueue";
import {
  discardBlockedOperation,
  listConflicts,
  processSyncQueue,
  resolveConflict,
} from "./syncEngine";
import type { SyncDependencyRef, SyncOperation } from "./types";
import { collectWorkoutSyncDependencies } from "@/lib/fitness/workoutSyncDependencies";

const USER = "user-barrier";

/** Erreur réseau ordinaire → l'opération reste `failed` (retryable). */
const NETWORK_ERROR: PgLikeError = { message: "network down" };
/** Erreur Postgres non retryable → l'opération passe `blocked`. */
const SCHEMA_ERROR: PgLikeError = {
  message: "Could not find the 'foo' column of 'exercises' in the schema cache",
  code: "PGRST204",
};

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
/** Reproduit le schéma RÉEL : `exercise_sets` ne porte pas de `workout_id`. */
interface ExerciseSetRow extends Row {
  user_id: string;
  exercise_id: string;
  created_at: string;
}
interface SegmentRow extends Row {
  user_id: string;
  workout_id: string;
  created_at: string;
}

const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");
const exercisesRepo = createOfflineRepository<ExerciseRow>("exercises");
const setsRepo = createOfflineRepository<ExerciseSetRow>("exercise_sets");
const segmentsRepo = createOfflineRepository<SegmentRow>("workout_segments");

/** Options exactes posées par les deux chemins de clôture Fitness. */
function closureOptions(dependsOnRecords: SyncDependencyRef[]) {
  return { neverMergeIntoPendingCreate: true, dependsOnRecords } as const;
}

async function readOp(opId: string): Promise<SyncOperation> {
  const db = await getOfflineDb();
  return (await db.get("syncQueue", opId)) as SyncOperation;
}

/** Force un statut donné sur une opération (simule une autre instance / un état persisté). */
async function forceStatus(
  opId: string,
  status: SyncOperation["status"],
  lastAttemptMsAgo = 1_000,
): Promise<void> {
  const db = await getOfflineDb();
  const op = (await db.get("syncQueue", opId)) as SyncOperation;
  await db.put("syncQueue", {
    ...op,
    status,
    lastAttemptAt: new Date(Date.now() - lastAttemptMsAgo).toISOString(),
  });
}

function opsByTable(ops: SyncOperation[]) {
  return ops.map((op) => `${op.opType}:${op.table}:${op.status}`);
}

/**
 * Séance vécue hors ligne : séance + N exercices (chacun avec ses séries) +
 * segments éventuels + clôture protégée par ses dépendances RÉELLES.
 * Reproduit exactement ce que font `useFinishWorkout` /
 * `useFinishGenericActiveWorkout` : les dépendances sont calculées depuis le
 * STORE LOCAL par le helper du domaine Fitness, jamais à la main.
 */
async function queueOfflineSession(exerciseCount = 1, setsPerExercise = 1, segmentCount = 0) {
  const workout = await workoutsRepo.create(USER, {
    name: "Push Day",
    status: "active",
  } as never);
  const exercises: ExerciseRow[] = [];
  const sets: ExerciseSetRow[] = [];
  const segments: SegmentRow[] = [];
  for (let i = 0; i < exerciseCount; i += 1) {
    const exercise = await exercisesRepo.create(USER, {
      workout_id: workout.id,
      name: `Exercice ${i}`,
    } as never);
    exercises.push(exercise);
    for (let k = 0; k < setsPerExercise; k += 1) {
      sets.push(await setsRepo.create(USER, { exercise_id: exercise.id } as never));
    }
  }
  for (let i = 0; i < segmentCount; i += 1) {
    segments.push(await segmentsRepo.create(USER, { workout_id: workout.id } as never));
  }

  // ── Ce que fait la clôture réelle : lecture du STORE LOCAL puis helper ──
  const dependsOnRecords = collectWorkoutSyncDependencies(workout.id, {
    exercises: await exercisesRepo.list(USER),
    exerciseSets: await setsRepo.list(USER),
    workoutSegments: await segmentsRepo.list(USER),
  });
  await workoutsRepo.update(
    workout.id,
    USER,
    { status: "completed" },
    closureOptions(dependsOnRecords),
  );

  const ops = await listAllOperations(USER);
  const closureOp = ops.find(
    (op) => op.opType === "update" && op.recordLocalId === workout.id,
  ) as SyncOperation;
  return { workout, exercises, sets, segments, closureOp, dependsOnRecords };
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
  fakeSupabaseOpts.failWrites = new Map();
});

// ─── Reproduction explicite de DISC-01b ────────────────────────────────

describe("DISC-01b — scénario complet, avant/après résolution des enfants", () => {
  it("enfants en échec → la clôture N'EST PAS envoyée ; enfants réparés → elle part et le serveur voit la séance complète", async () => {
    const { workout, closureOp, exercises, sets } = await queueOfflineSession(1, 1);
    // La clôture déclare exactement ses enfants réels — rien de plus.
    expect(closureOp.dependsOnRecords).toEqual([
      { table: "exercises", recordLocalId: exercises[0].id },
      { table: "exercise_sets", recordLocalId: sets[0].id },
    ]);

    // ── Passage 1 : les deux enfants échouent (coupure ciblée) ──────────
    fakeSupabaseOpts.failWrites.set("exercises", NETWORK_ERROR);
    fakeSupabaseOpts.failWrites.set("exercise_sets", NETWORK_ERROR);
    const first = await processSyncQueue(USER);

    // workout CREATE réussi, les deux enfants `failed`, la clôture SKIPPÉE.
    expect(first.succeeded).toBe(1);
    expect(first.retried).toBe(2);
    expect(first.skipped).toBe(1);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
    expect(opsByTable(await listAllOperations(USER))).toEqual([
      "create:exercises:failed",
      "create:exercise_sets:failed",
      "update:workouts:pending",
    ]);
    // La clôture n'a consommé aucune tentative : son backoff n'a pas avancé.
    const skipped = await readOp(closureOp.id);
    expect(skipped.status).toBe("pending");
    expect(skipped.retryCount).toBe(0);
    expect(skipped.lastAttemptAt).toBeNull();

    // ── Passage 2 : le réseau revient, les enfants passent ──────────────
    fakeSupabaseOpts.failWrites.clear();
    const second = await processSyncQueue(USER);

    expect(second.succeeded).toBe(3); // 2 enfants + la clôture, MÊME passage
    expect(second.skipped).toBe(0);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
    expect(serverStore.get("exercises")?.size).toBe(1);
    expect(serverStore.get("exercise_sets")?.size).toBe(1);
    expect(await listAllOperations(USER)).toHaveLength(0);

    // PREUVE : la séance n'a atteint `completed` qu'UNE fois, et à ce
    // moment-là le serveur voyait bien l'exercice ET la série. Avant ce
    // chantier, ce témoin valait [{ exercises: 0, sets: 0 }].
    expect(completionWitness).toEqual([{ exercises: 1, sets: 1 }]);
  });
});

// ─── Les quatre statuts « vivants » retiennent la barrière ─────────────

describe("Statuts qui retiennent la clôture", () => {
  it("enfant `failed` → clôture non envoyée", async () => {
    const { workout } = await queueOfflineSession();
    fakeSupabaseOpts.failWrites.set("exercises", NETWORK_ERROR);
    fakeSupabaseOpts.failWrites.set("exercise_sets", NETWORK_ERROR);

    const result = await processSyncQueue(USER);
    expect(result.skipped).toBe(1);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
  });

  it("enfant `blocked` → clôture non envoyée (et pas davantage aux passages suivants)", async () => {
    const { workout } = await queueOfflineSession();
    fakeSupabaseOpts.failWrites.set("exercises", SCHEMA_ERROR);
    fakeSupabaseOpts.failWrites.set("exercise_sets", SCHEMA_ERROR);

    const first = await processSyncQueue(USER);
    expect(first.blocked).toBe(2);
    expect(first.skipped).toBe(1);

    // Une opération `blocked` n'est jamais reprise seule : la clôture reste
    // retenue indéfiniment — état honnête plutôt qu'XP amputée à jamais.
    const second = await processSyncQueue(USER);
    expect(second.skipped).toBe(1);
    expect(second.succeeded).toBe(0);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
  });

  it("enfant `pending` (jamais tenté, laissé par le backoff) → clôture non envoyée", async () => {
    const { workout, closureOp } = await queueOfflineSession();
    const ops = await listAllOperations(USER);
    const childOp = ops.find((op) => op.table === "exercises") as SyncOperation;
    expect(childOp.status).toBe("pending");

    expect(await hasLiveDependencies(USER, closureOp)).toBe(true);
    expect(serverStore.get("workouts")?.get(workout.id)).toBeUndefined();
  });

  it("enfant `syncing` dans un AUTRE onglet → clôture non envoyée", async () => {
    const { workout, closureOp } = await queueOfflineSession();
    const ops = await listAllOperations(USER);
    const childOp = ops.find((op) => op.table === "exercises") as SyncOperation;
    // Prise en charge récente par une autre instance : absente de
    // `listPendingOperations`, mais bel et bien VIVANTE.
    await forceStatus(childOp.id, "syncing", 1_000);

    const result = await processSyncQueue(USER);
    expect(result.skipped).toBe(1);
    expect(await readOp(closureOp.id)).toMatchObject({ status: "pending" });
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
  });

  it("tous les enfants réussissent → la clôture part dans le MÊME passage", async () => {
    const { workout } = await queueOfflineSession(2, 2);
    const result = await processSyncQueue(USER);

    expect(result.skipped).toBe(0);
    expect(result.succeeded).toBe(8); // 1 séance + 2 exercices + 4 séries + 1 clôture
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
    expect(await listAllOperations(USER)).toHaveLength(0);
  });
});

// ─── La file n'est PAS un stop-on-error ────────────────────────────────

describe("Aucun blocage global : les opérations indépendantes continuent", () => {
  it("une opération SANS barrière placée après un échec part normalement", async () => {
    fakeSupabaseOpts.failWrites.set("exercises", NETWORK_ERROR);
    await exercisesRepo.create(USER, { workout_id: "w-x", name: "Échoue" } as never);
    const independent = await workoutsRepo.create(USER, {
      name: "Séance indépendante",
      status: "active",
    } as never);

    const result = await processSyncQueue(USER);
    expect(result.retried).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.skipped).toBe(0);
    expect(serverStore.get("workouts")?.has(independent.id)).toBe(true);
  });

  it("une opération indépendante n'est pas retenue par une opération BLOQUÉE plus ancienne", async () => {
    fakeSupabaseOpts.failWrites.set("exercises", SCHEMA_ERROR);
    await exercisesRepo.create(USER, { workout_id: "w-x", name: "Bloquée" } as never);
    const independent = await workoutsRepo.create(USER, {
      name: "Toujours envoyée",
      status: "active",
    } as never);

    const result = await processSyncQueue(USER);
    expect(result.blocked).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("workouts")?.has(independent.id)).toBe(true);
  });

  it("la barrière ne retient QUE l'opération qui la porte, pas celles qui la suivent", async () => {
    const { workout } = await queueOfflineSession();
    fakeSupabaseOpts.failWrites.set("exercises", NETWORK_ERROR);
    fakeSupabaseOpts.failWrites.set("exercise_sets", NETWORK_ERROR);
    // Enfilée APRÈS la clôture, sans barrière : elle doit passer quand même.
    const later = await workoutsRepo.create(USER, {
      name: "Séance suivante",
      status: "active",
    } as never);

    const result = await processSyncQueue(USER);
    expect(result.skipped).toBe(1); // uniquement la clôture
    expect(serverStore.get("workouts")?.has(later.id)).toBe(true);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
  });
});

// ─── Interactions avec les mécanismes du chantier 1 ────────────────────

describe("Barrière et mécanismes existants", () => {
  it("plusieurs enfants : la clôture attend le DERNIER, pas seulement le premier", async () => {
    const { workout } = await queueOfflineSession(3, 2);
    // Seules les séries échouent : les 3 exercices passent.
    fakeSupabaseOpts.failWrites.set("exercise_sets", NETWORK_ERROR);

    const first = await processSyncQueue(USER);
    expect(first.succeeded).toBe(4); // séance + 3 exercices
    expect(first.retried).toBe(6); // 6 séries
    expect(first.skipped).toBe(1);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");

    fakeSupabaseOpts.failWrites.clear();
    const second = await processSyncQueue(USER);
    expect(second.succeeded).toBe(7); // 6 séries + la clôture
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
  });

  it("après récupération d'une opération ORPHELINE, la barrière tient toujours", async () => {
    const { workout, closureOp } = await queueOfflineSession();
    const ops = await listAllOperations(USER);
    const childOp = ops.find((op) => op.table === "exercises") as SyncOperation;
    // Instance tuée pendant l'envoi de l'enfant, il y a longtemps.
    await forceStatus(childOp.id, "syncing", 120_000);

    fakeSupabaseOpts.failWrites.set("exercises", NETWORK_ERROR);
    const result = await processSyncQueue(USER);

    expect(result.reclaimed).toBe(1); // l'orpheline a bien été reprise…
    expect(result.retried).toBeGreaterThan(0); // …retentée, et elle échoue encore
    expect(result.skipped).toBe(1); // la clôture reste retenue
    expect(await readOp(closureOp.id)).toMatchObject({ status: "pending" });
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
  });

  it("la barrière survit à un conflit arbitré « garder ma version »", async () => {
    // Séance déjà synchronisée, puis clôturée pendant qu'un autre appareil
    // modifie la même ligne → conflit sur l'opération de clôture.
    const workout = await workoutsRepo.create(USER, {
      name: "Push Day",
      status: "active",
    } as never);
    await processSyncQueue(USER);
    const serverRow = serverStore.get("workouts")?.get(workout.id) as Row;
    serverStore.get("workouts")?.set(workout.id, {
      ...serverRow,
      name: "Renommée ailleurs",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    const child = await exercisesRepo.create(USER, {
      workout_id: workout.id,
      name: "Développé",
    } as never);
    await processSyncQueue(USER);
    await workoutsRepo.update(
      workout.id,
      USER,
      { status: "completed" },
      closureOptions([{ table: "exercises", recordLocalId: child.id }]),
    );
    const conflicted = await processSyncQueue(USER);
    expect(conflicted.conflicted).toBe(1);

    const [conflict] = await listConflicts(USER);
    expect(conflict.dependsOnRecords).toEqual([{ table: "exercises", recordLocalId: child.id }]);

    await resolveConflict(conflict.id, "keep-local");
    const [replayed] = await listAllOperations(USER);
    // L'intention locale est rejouée TELLE QUELLE, barrière comprise.
    expect(replayed.opType).toBe("update");
    expect(replayed.dependsOnRecords).toEqual([{ table: "exercises", recordLocalId: child.id }]);

    await processSyncQueue(USER);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
  });

  it("deux instances en parallèle : la clôture n'est jamais envoyée deux fois", async () => {
    const { workout } = await queueOfflineSession(1, 1);

    const [a, b] = await Promise.all([processSyncQueue(USER), processSyncQueue(USER)]);
    // Un dernier passage : selon l'entrelacement, la clôture est partie
    // pendant l'un des deux passages parallèles (ses enfants avaient alors
    // réellement réussi) ou a été retenue et part ici.
    const final = await processSyncQueue(USER);

    // `claimOperation` reste l'unique protection atomique : la barrière ne la
    // remplace pas, elle décide seulement s'il y a lieu de TENTER l'envoi.
    // Les 4 opérations partent donc exactement une fois chacune.
    expect(a.succeeded + b.succeeded + final.succeeded).toBe(4);
    expect(serverStore.get("workouts")?.size).toBe(1);
    expect(serverStore.get("exercises")?.size).toBe(1);
    expect(serverStore.get("exercise_sets")?.size).toBe(1);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
    expect(await listAllOperations(USER)).toHaveLength(0);

    // L'INVARIANT qui compte, quel que soit l'entrelacement : la séance n'a
    // atteint `completed` qu'une seule fois, et jamais avant ses enfants.
    expect(completionWitness).toEqual([{ exercises: 1, sets: 1 }]);
  });

  it("comptage `skipped` : une clôture retenue est comptée une fois par passage", async () => {
    await queueOfflineSession(1, 1);
    fakeSupabaseOpts.failWrites.set("exercises", NETWORK_ERROR);
    fakeSupabaseOpts.failWrites.set("exercise_sets", NETWORK_ERROR);

    const first = await processSyncQueue(USER);
    const second = await processSyncQueue(USER);
    expect(first.skipped).toBe(1);
    expect(second.skipped).toBe(1);
  });
});

// ─── RESSERREMENT : la portée est celle des enregistrements déclarés ───

describe("Portée par enregistrement — les opérations sans rapport ne bloquent plus", () => {
  it("une écriture Nutrition BLOQUÉE et antérieure ne retient PAS la clôture", async () => {
    // LE scénario du resserrement. Avant, la barrière regardait toute la file
    // de l'utilisateur : cette opération sans le moindre rapport retenait la
    // clôture — et, `blocked` ne repartant jamais seul, indéfiniment.
    fakeSupabaseOpts.failWrites.set("nutrition_favorites", SCHEMA_ERROR);
    const nutrition = createOfflineRepository<Row & { user_id: string; name: string }>(
      "nutrition_favorites",
    );
    await nutrition.create(USER, { name: "Sans rapport" } as never);

    const { workout } = await queueOfflineSession(1, 1);
    const result = await processSyncQueue(USER);

    expect(result.blocked).toBe(1); // l'écriture Nutrition, bloquée
    expect(result.skipped).toBe(0); // la clôture n'est PAS retenue
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
    expect(completionWitness).toEqual([{ exercises: 1, sets: 1 }]);
  });

  it("une écriture Recette / Liste de courses en échec ne retient pas non plus", async () => {
    fakeSupabaseOpts.failWrites.set("recipes", NETWORK_ERROR);
    fakeSupabaseOpts.failWrites.set("shopping_list", NETWORK_ERROR);
    const recipes = createOfflineRepository<Row & { user_id: string }>("recipes");
    const shopping = createOfflineRepository<Row & { user_id: string }>("shopping_list");
    await recipes.create(USER, {} as never);
    await shopping.create(USER, {} as never);

    const { workout } = await queueOfflineSession(1, 1);
    const result = await processSyncQueue(USER);

    expect(result.retried).toBe(2);
    expect(result.skipped).toBe(0);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
  });

  it("un enfant d'une AUTRE séance ne retient pas cette clôture", async () => {
    // Séance A, avec un exercice qu'on fige en `blocked` : il reste VIVANT
    // dans la file (donc visible du prédicat) et antérieur à tout le reste,
    // mais il n'appartient pas à la séance B.
    const other = await workoutsRepo.create(USER, { name: "Autre", status: "active" } as never);
    const otherChild = await exercisesRepo.create(USER, {
      workout_id: other.id,
      name: "Ex de la séance A",
    } as never);
    const otherChildOp = (await listAllOperations(USER)).find(
      (op) => op.recordLocalId === otherChild.id,
    ) as SyncOperation;
    await forceStatus(otherChildOp.id, "blocked");

    // Séance B : ses propres enfants passent.
    const { workout, closureOp } = await queueOfflineSession(1, 1);
    expect(closureOp.dependsOnRecords?.map((r) => r.recordLocalId)).not.toContain(otherChild.id);

    const result = await processSyncQueue(USER);

    // La clôture de B part malgré l'enfant bloqué de A.
    expect(result.skipped).toBe(0);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
    expect(completionWitness).toEqual([{ exercises: 1, sets: 1 }]);
    // L'opération bloquée de A est toujours là, intacte.
    expect((await readOp(otherChildOp.id)).status).toBe("blocked");
  });

  it("un `exercise` de la BONNE séance retient bien la clôture", async () => {
    const { workout } = await queueOfflineSession(1, 0);
    fakeSupabaseOpts.failWrites.set("exercises", NETWORK_ERROR);

    const result = await processSyncQueue(USER);
    expect(result.skipped).toBe(1);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
  });

  it("un `exercise_set` de la BONNE séance retient la clôture (jointure par exercise_id)", async () => {
    const { workout } = await queueOfflineSession(1, 2);
    // Seules les SÉRIES échouent : l'exercice passe. `exercise_sets` ne porte
    // aucun `workout_id` — seule la jointure du helper les rattache.
    fakeSupabaseOpts.failWrites.set("exercise_sets", NETWORK_ERROR);

    const result = await processSyncQueue(USER);
    expect(result.succeeded).toBe(2); // séance + exercice
    expect(result.retried).toBe(2); // les 2 séries
    expect(result.skipped).toBe(1); // la clôture
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
  });

  it("un `workout_segment` de la BONNE séance retient la clôture", async () => {
    const { workout } = await queueOfflineSession(0, 0, 1);
    fakeSupabaseOpts.failWrites.set("workout_segments", NETWORK_ERROR);

    const result = await processSyncQueue(USER);
    expect(result.skipped).toBe(1);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
  });

  it("une séance SANS aucun enfant ne déclare aucune dépendance et part immédiatement", async () => {
    const { workout, closureOp } = await queueOfflineSession(0, 0, 0);
    expect(closureOp.dependsOnRecords).toBeUndefined();

    const result = await processSyncQueue(USER);
    expect(result.skipped).toBe(0);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
  });

  it("les dépendances déclarées ne contiennent JAMAIS d'id optimiste `tmp-*`", async () => {
    const { closureOp, dependsOnRecords } = await queueOfflineSession(2, 2, 1);
    const declared = closureOp.dependsOnRecords ?? [];
    expect(declared).toEqual(dependsOnRecords);
    expect(declared.length).toBe(2 + 4 + 1);
    expect(declared.some((ref) => ref.recordLocalId.startsWith("tmp-"))).toBe(false);
    // Et toutes les tables enfants sont bien couvertes.
    expect(new Set(declared.map((ref) => ref.table))).toEqual(
      new Set(["exercises", "exercise_sets", "workout_segments"]),
    );
  });

  it("un enfant RETIRÉ de la file par l'utilisateur libère la barrière", async () => {
    // Sémantique voulue : l'utilisateur a explicitement renoncé à cette
    // écriture (« Retirer de la file ») — elle n'est plus une dépendance
    // vivante, la clôture peut continuer.
    const { workout } = await queueOfflineSession(1, 0);
    fakeSupabaseOpts.failWrites.set("exercises", SCHEMA_ERROR);

    const blockedPass = await processSyncQueue(USER);
    expect(blockedPass.blocked).toBe(1);
    expect(blockedPass.skipped).toBe(1);

    const childOp = (await listAllOperations(USER)).find(
      (op) => op.table === "exercises",
    ) as SyncOperation;
    await discardBlockedOperation(childOp.id);

    fakeSupabaseOpts.failWrites.clear();
    const after = await processSyncQueue(USER);
    expect(after.skipped).toBe(0);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
    // Le serveur voit une séance sans cet exercice — conséquence assumée du
    // choix explicite de l'utilisateur, jamais d'une décision automatique.
    expect(completionWitness).toEqual([{ exercises: 0, sets: 0 }]);
  });
});

// ─── Le prédicat lui-même ──────────────────────────────────────────────

describe("hasLiveDependencies", () => {
  it("faux quand aucune dépendance n'est déclarée", async () => {
    await workoutsRepo.create(USER, { name: "A", status: "active" } as never);
    const later = await workoutsRepo.create(USER, { name: "B", status: "active" } as never);
    const op = (await listAllOperations(USER)).find(
      (o) => o.recordLocalId === later.id,
    ) as SyncOperation;
    expect(op.dependsOnRecords).toBeUndefined();
    expect(await hasLiveDependencies(USER, op)).toBe(false);
  });

  it("ignore une opération vivante sur un enregistrement NON déclaré", async () => {
    const untracked = await exercisesRepo.create(USER, {
      workout_id: "w-x",
      name: "Non déclaré",
    } as never);
    const target = await workoutsRepo.create(USER, { name: "B", status: "active" } as never);
    const op = (await listAllOperations(USER)).find(
      (o) => o.recordLocalId === target.id,
    ) as SyncOperation;
    expect(
      await hasLiveDependencies(USER, {
        ...op,
        dependsOnRecords: [{ table: "exercises", recordLocalId: "autre-id" }],
      }),
    ).toBe(false);
    // …mais le voit dès qu'il est déclaré.
    expect(
      await hasLiveDependencies(USER, {
        ...op,
        dependsOnRecords: [{ table: "exercises", recordLocalId: untracked.id }],
      }),
    ).toBe(true);
  });

  it("la table fait partie de l'identité : même id, autre table → pas de dépendance", async () => {
    const exercise = await exercisesRepo.create(USER, {
      workout_id: "w-x",
      name: "Ex",
    } as never);
    const target = await workoutsRepo.create(USER, { name: "B", status: "active" } as never);
    const op = (await listAllOperations(USER)).find(
      (o) => o.recordLocalId === target.id,
    ) as SyncOperation;
    expect(
      await hasLiveDependencies(USER, {
        ...op,
        dependsOnRecords: [{ table: "exercise_sets", recordLocalId: exercise.id }],
      }),
    ).toBe(false);
  });

  it("ignore une opération POSTÉRIEURE sur un enregistrement déclaré", async () => {
    const target = await workoutsRepo.create(USER, { name: "A", status: "active" } as never);
    const op = (await listAllOperations(USER)).find(
      (o) => o.recordLocalId === target.id,
    ) as SyncOperation;
    // Enfilé APRÈS l'opération protégée.
    const later = await exercisesRepo.create(USER, {
      workout_id: target.id,
      name: "Après",
    } as never);
    expect(
      await hasLiveDependencies(USER, {
        ...op,
        dependsOnRecords: [{ table: "exercises", recordLocalId: later.id }],
      }),
    ).toBe(false);
  });

  it("ne se compte jamais elle-même", async () => {
    const created = await workoutsRepo.create(USER, { name: "Seule", status: "active" } as never);
    const [only] = await listAllOperations(USER);
    expect(
      await hasLiveDependencies(USER, {
        ...only,
        dependsOnRecords: [{ table: "workouts", recordLocalId: created.id }],
      }),
    ).toBe(false);
  });

  it("ne voit pas la file d'un AUTRE utilisateur", async () => {
    const elsewhere = await exercisesRepo.create("autre-user", {
      workout_id: "w-x",
      name: "Ailleurs",
    } as never);
    const target = await workoutsRepo.create(USER, { name: "Ici", status: "active" } as never);
    const op = (await listAllOperations(USER)).find(
      (o) => o.recordLocalId === target.id,
    ) as SyncOperation;
    expect(
      await hasLiveDependencies(USER, {
        ...op,
        dependsOnRecords: [{ table: "exercises", recordLocalId: elsewhere.id }],
      }),
    ).toBe(false);
  });

  it("une file vidée rouvre la barrière", async () => {
    const { closureOp } = await queueOfflineSession(1, 1);
    expect(await hasLiveDependencies(USER, closureOp)).toBe(true);
    await processSyncQueue(USER);
    expect(await listAllOperations(USER)).toHaveLength(0);
  });
});
