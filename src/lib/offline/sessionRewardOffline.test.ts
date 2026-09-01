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
 * CHANTIER 4 — CRIT-03 (récompense XP) et MAJ-08 (progression/Rang hors
 * ligne), bout en bout sur l'infra offline réelle (repository + sync queue +
 * sync engine), avec un simulateur Supabase qui reproduit le SEUL élément
 * serveur qui compte ici : le trigger `award_xp_on_workout_complete`.
 *
 * Ce que le simulateur reproduit fidèlement (cf. migrations
 * `20260717120000` + `20260721130500`) :
 *   - il ne se déclenche QUE lorsque `workouts.status` atteint `'completed'`
 *     EN BASE (INSERT direct en 'completed', ou UPDATE depuis un autre statut) ;
 *   - il insère des lignes `xp_events` rattachées au workout ;
 *   - puis il écrit `xp_before/xp_after/level_before/level_after` sur la
 *     séance elle-même — écriture postérieure au RETURNING de l'UPDATE
 *     client (trigger AFTER), donc invisible dans la réponse de l'opération
 *     de sync : c'est exactement ce qui impose une relecture côté écran.
 *
 * Les MONTANTS d'XP et les seuils de Rang ne sont pas testés ici (ils sont
 * arbitrés par le serveur et couverts par `titleConfig.sql-parity.test.ts` /
 * `characterLevel.sql-parity.test.ts`) : on teste l'HONNÊTETÉ de l'affichage
 * et la propagation, jamais les règles RPG.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface FakeSupabaseOptions {
  /** Coupe la prochaine requête (simulateur de coupure réseau). */
  failNext?: boolean;
  /** Compteur de lectures par table — sert au test de performance (MAJ-04). */
  reads?: Record<string, number>;
}

/** XP versée par le trigger simulé pour une séance muscu terminée. */
const XP_PER_MUSCU_SESSION = 150;

/**
 * Nombre d'exercices VISIBLES CÔTÉ SERVEUR au moment où le trigger s'exécute,
 * relevé à chaque déclenchement. Le vrai trigger parcourt les exercices de la
 * séance pour accorder l'XP de record / de progression : ce compteur est donc
 * la mesure directe de ce que le serveur peut récompenser (voir DISC-01).
 */
const exercisesSeenByTrigger: number[] = [];

/** Idem pour les SÉRIES rattachées aux exercices de la séance (le trigger les
 *  agrège pour détecter un record : `MAX(weight)`, `MAX(reps)`, volume, 1RM). */
const setsSeenByTrigger: number[] = [];

function computeLevelFromXp(xp: number): number {
  // Simple monotone croissante — la vraie courbe est testée ailleurs ; ici on
  // a seulement besoin d'un niveau cohérent avec l'XP.
  return Math.max(1, Math.floor(xp / 200) + 1);
}

/**
 * Trigger serveur simulé : appelé après toute écriture sur `workouts`.
 * Idempotent sur la transition (comme le vrai : `OLD.status IS DISTINCT FROM
 * 'completed'`).
 */
function runAwardXpTrigger(
  server: Map<string, Map<string, Row>>,
  workout: Row,
  previousStatus: string | undefined,
) {
  if (workout.status !== "completed") return;
  if (previousStatus === "completed") return;

  const userId = workout.user_id as string;
  const workoutExercises = Array.from(server.get("exercises")?.values() ?? []).filter(
    (e) => e.workout_id === workout.id,
  );
  const exerciseIds = new Set(workoutExercises.map((e) => e.id));
  exercisesSeenByTrigger.push(workoutExercises.length);
  setsSeenByTrigger.push(
    Array.from(server.get("exercise_sets")?.values() ?? []).filter((st) =>
      exerciseIds.has(st.exercise_id as string),
    ).length,
  );
  const statsStore = server.get("user_stats") ?? new Map<string, Row>();
  server.set("user_stats", statsStore);
  const stats = statsStore.get(userId) ?? { id: userId, user_id: userId, xp: 0, level: 1 };

  const xpBefore = stats.xp as number;
  const levelBefore = computeLevelFromXp(xpBefore);
  const xpAfter = xpBefore + XP_PER_MUSCU_SESSION;
  const levelAfter = computeLevelFromXp(xpAfter);

  statsStore.set(userId, { ...stats, xp: xpAfter, level: levelAfter });

  const eventsStore = server.get("xp_events") ?? new Map<string, Row>();
  server.set("xp_events", eventsStore);
  const eventId = `xpe-${workout.id}`;
  eventsStore.set(eventId, {
    id: eventId,
    user_id: userId,
    workout_id: workout.id,
    source: "workout_muscu",
    amount: XP_PER_MUSCU_SESSION,
  });

  // Écriture SÉPARÉE sur la séance (trigger AFTER) : elle n'apparaît pas dans
  // le RETURNING de l'opération cliente qui vient de passer le statut.
  const workoutsStore = server.get("workouts") as Map<string, Row>;
  workoutsStore.set(workout.id, {
    ...workout,
    xp_before: xpBefore,
    xp_after: xpAfter,
    level_before: levelBefore,
    level_after: levelAfter,
  });
}

function createFakeSupabase(server: Map<string, Map<string, Row>>, opts: FakeSupabaseOptions) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "upsert" | "update" | "delete"; payload?: Row } | null = null;
      const filters: Record<string, string> = {};

      const exec = async (): Promise<{ data: unknown; error: Error | null }> => {
        if (opts.failNext) {
          opts.failNext = false;
          return { data: null, error: new Error("network down") };
        }
        if (!op) {
          if (opts.reads) opts.reads[table] = (opts.reads[table] ?? 0) + 1;
          const rows = Array.from(store.values()).filter((row) =>
            Object.entries(filters).every(([col, val]) => row[col] === val),
          );
          if (filters.id) return { data: rows[0] ?? null, error: null };
          return { data: rows, error: null };
        }
        if (op.type === "upsert") {
          const row = { ...(op.payload as Row), updated_at: new Date().toISOString() };
          const previousStatus = store.get(row.id)?.status as string | undefined;
          store.set(row.id, row);
          // RETURNING : l'état de la ligne AVANT l'écriture du trigger AFTER.
          const returned = { ...row };
          if (table === "workouts") runAwardXpTrigger(server, row, previousStatus);
          return { data: returned, error: null };
        }
        if (op.type === "update") {
          const id = filters.id;
          if (!id || !store.has(id)) return { data: null, error: new Error("row not found") };
          const existing = store.get(id) as Row;
          const updated: Row = {
            ...existing,
            ...(op.payload as Row),
            updated_at: new Date().toISOString(),
          };
          store.set(id, updated);
          const returned = { ...updated };
          if (table === "workouts")
            runAwardXpTrigger(server, updated, existing.status as string | undefined);
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
const fakeSupabaseOpts: FakeSupabaseOptions = {};
let online = true;

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase(serverStore, fakeSupabaseOpts);
  },
}));

vi.mock("./networkStatus", async () => {
  const actual = await vi.importActual<typeof import("./networkStatus")>("./networkStatus");
  return { ...actual, getIsOnline: () => online };
});

// Imports après les mocks (obligatoire avec vi.mock hoisté).
import { resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import { hasQueuedOperationsForRecord, listAllOperations } from "./syncQueue";
import { processSyncQueue } from "./syncEngine";
import { resolveRewardConfirmation } from "@/lib/fitness/rpg/rewardConfirmation";
import {
  buildLevelTransitionFromServer,
  totalSessionXp,
  type SessionXpEvent,
} from "@/lib/fitness/rpg/sessionReward";

const USER = "user-reward";

interface WorkoutRow extends Row {
  user_id: string;
  name: string;
  date: string;
  gym_location: string;
  status: string;
  discipline: string;
  duration_minutes: number | null;
  xp_before: number | null;
  xp_after: number | null;
  level_before: number | null;
  level_after: number | null;
}

const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");
const exercisesRepo = createOfflineRepository<Row & { user_id: string; workout_id: string }>(
  "exercises",
);
const exerciseSetsRepo = createOfflineRepository<Row & { user_id: string; exercise_id: string }>(
  "exercise_sets",
);

/** Clôture d'une séance, telle que `useFinishWorkout` l'écrit réellement. */
function finishWorkoutLocally(workoutId: string, durationMinutes = 45) {
  return workoutsRepo.update(
    workoutId,
    USER,
    { status: "completed", duration_minutes: durationMinutes },
    { neverMergeIntoPendingCreate: true },
  );
}

/** Séance muscu complète écrite localement : séance + 1 exercice + 2 séries. */
async function createFullSessionLocally() {
  const workout = await workoutsRepo.create(USER, activeWorkout());
  const exercise = await exercisesRepo.create(USER, {
    workout_id: workout.id,
    name: "Développé couché",
    sets: null,
    reps: null,
    weight: null,
    position: 0,
  } as never);
  const setA = await exerciseSetsRepo.create(USER, {
    exercise_id: exercise.id,
    set_number: 1,
    reps: 8,
    weight: 80,
    completed: true,
  } as never);
  const setB = await exerciseSetsRepo.create(USER, {
    exercise_id: exercise.id,
    set_number: 2,
    reps: 6,
    weight: 90,
    completed: true,
  } as never);
  return { workout, exercise, sets: [setA, setB] };
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
  fakeSupabaseOpts.failNext = false;
  fakeSupabaseOpts.reads = undefined;
  exercisesSeenByTrigger.length = 0;
  setsSeenByTrigger.length = 0;
  online = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const activeWorkout = (): Omit<WorkoutRow, "id" | "user_id" | "created_at" | "updated_at"> => ({
  name: "Push Day",
  date: "2026-09-01",
  gym_location: "Salle Neptune",
  status: "active",
  discipline: "muscu",
  duration_minutes: null,
  xp_before: null,
  xp_after: null,
  level_before: null,
  level_after: null,
});

/** Ce que l'écran de récompense lit réellement du serveur, pour un workout. */
async function readRewardFromServer(workoutId: string) {
  const workoutsStore = serverStore.get("workouts");
  const row = workoutsStore?.get(workoutId) ?? null;
  const snapshot = row
    ? {
        xp_before: (row.xp_before ?? null) as number | null,
        xp_after: (row.xp_after ?? null) as number | null,
        level_before: (row.level_before ?? null) as number | null,
        level_after: (row.level_after ?? null) as number | null,
      }
    : null;
  const events: SessionXpEvent[] = Array.from(serverStore.get("xp_events")?.values() ?? [])
    .filter((e) => e.workout_id === workoutId)
    .map((e) => ({ source: e.source as string, amount: e.amount as number }));
  return { snapshot, events };
}

// ─── CRIT-03 — fin de séance ONLINE ────────────────────────────────────

describe("CRIT-03 — récompense d'une séance terminée EN LIGNE", () => {
  it("aucune récompense confirmée tant que la clôture n'a pas atteint le serveur", async () => {
    const w = await workoutsRepo.create(USER, activeWorkout());
    await processSyncQueue(USER); // la séance active part normalement
    await workoutsRepo.update(w.id, USER, { status: "completed", duration_minutes: 45 });

    // État exact au moment où l'écran de récompense s'affiche : l'écriture est
    // locale, l'opération est en file, le serveur n'a RIEN calculé.
    const { snapshot, events } = await readRewardFromServer(w.id);
    expect(snapshot).toEqual({
      xp_before: null,
      xp_after: null,
      level_before: null,
      level_after: null,
    });
    expect(events).toHaveLength(0);
    expect(
      resolveRewardConfirmation({
        snapshot,
        hasQueuedWorkoutOps: await hasQueuedOperationsForRecord(USER, "workouts", w.id),
        isOnline: true,
      }),
    ).toBe("syncing");
  });

  it("après synchronisation : XP confirmée, valeurs serveur, file vide", async () => {
    const w = await workoutsRepo.create(USER, activeWorkout());
    await processSyncQueue(USER);
    await workoutsRepo.update(w.id, USER, { status: "completed", duration_minutes: 45 });
    await processSyncQueue(USER);

    const { snapshot, events } = await readRewardFromServer(w.id);
    expect(
      resolveRewardConfirmation({
        snapshot,
        hasQueuedWorkoutOps: await hasQueuedOperationsForRecord(USER, "workouts", w.id),
        isOnline: true,
      }),
    ).toBe("confirmed");

    expect(totalSessionXp(events)).toBe(XP_PER_MUSCU_SESSION);
    const level = buildLevelTransitionFromServer(
      snapshot!.xp_before!,
      snapshot!.xp_after!,
      snapshot!.level_before!,
      snapshot!.level_after!,
    );
    expect(level.xpBefore).toBe(0);
    expect(level.xpAfter).toBe(XP_PER_MUSCU_SESSION);
    expect(await hasQueuedOperationsForRecord(USER, "workouts", w.id)).toBe(false);
  });

  it("la réponse de l'opération de sync ne suffit PAS : les compteurs sont écrits par un trigger AFTER", async () => {
    // Régression de la cause racine : avant ce chantier l'écran se contentait
    // de ce que la mutation avait sous la main. Le RETURNING de l'UPDATE ne
    // contient pas encore xp_after — seule une RELECTURE l'apporte.
    const w = await workoutsRepo.create(USER, activeWorkout());
    await processSyncQueue(USER);
    await workoutsRepo.update(w.id, USER, { status: "completed" });
    await processSyncQueue(USER);

    const localAfterSync = await workoutsRepo.get(w.id);
    expect(localAfterSync?.xp_after ?? null).toBeNull();

    const { snapshot } = await readRewardFromServer(w.id);
    expect(snapshot!.xp_after).toBe(XP_PER_MUSCU_SESSION);
  });

  it("l'XP de la séance PRÉCÉDENTE n'est jamais présentée comme celle de la nouvelle", async () => {
    const first = await workoutsRepo.create(USER, activeWorkout());
    await processSyncQueue(USER);
    await workoutsRepo.update(first.id, USER, { status: "completed" });
    await processSyncQueue(USER);

    const second = await workoutsRepo.create(USER, activeWorkout());
    await processSyncQueue(USER);
    await workoutsRepo.update(second.id, USER, { status: "completed" });

    // Avant sync de la 2e : rien de confirmé pour ELLE, et surtout pas la
    // transition de la première (xp 0 → 150).
    const pending = await readRewardFromServer(second.id);
    expect(
      resolveRewardConfirmation({
        snapshot: pending.snapshot,
        hasQueuedWorkoutOps: true,
        isOnline: true,
      }),
    ).toBe("syncing");
    expect(totalSessionXp(pending.events)).toBe(0);

    await processSyncQueue(USER);
    const done = await readRewardFromServer(second.id);
    const level = buildLevelTransitionFromServer(
      done.snapshot!.xp_before!,
      done.snapshot!.xp_after!,
      done.snapshot!.level_before!,
      done.snapshot!.level_after!,
    );
    expect(level.xpBefore).toBe(XP_PER_MUSCU_SESSION);
    expect(level.xpAfter).toBe(XP_PER_MUSCU_SESSION * 2);
  });
});

// ─── CRIT-03 / MAJ-08 — fin de séance OFFLINE ──────────────────────────

describe("CRIT-03 — fin de séance HORS LIGNE : aucune fausse confirmation", () => {
  it("la séance est terminée localement, rien n'est prétendu côté serveur", async () => {
    const w = await workoutsRepo.create(USER, activeWorkout());
    await processSyncQueue(USER);

    online = false;
    await workoutsRepo.update(w.id, USER, { status: "completed", duration_minutes: 52 });

    // Vérité locale : la séance EST terminée sur l'appareil.
    expect((await workoutsRepo.get(w.id))?.status).toBe("completed");
    // Vérité serveur : rien n'a bougé.
    expect(serverStore.get("workouts")?.get(w.id)?.status).toBe("active");
    expect(serverStore.get("xp_events")?.size ?? 0).toBe(0);

    const { snapshot } = await readRewardFromServer(w.id);
    expect(
      resolveRewardConfirmation({
        snapshot,
        hasQueuedWorkoutOps: await hasQueuedOperationsForRecord(USER, "workouts", w.id),
        isOnline: false,
      }),
    ).toBe("syncing");
  });

  it("une séance entièrement vécue hors ligne reste en attente, jamais confirmée à tort", async () => {
    online = false;
    const w = await workoutsRepo.create(USER, activeWorkout());
    await workoutsRepo.update(w.id, USER, { status: "completed" });

    expect(serverStore.get("workouts")?.size ?? 0).toBe(0);
    expect(
      resolveRewardConfirmation({
        snapshot: null,
        hasQueuedWorkoutOps: await hasQueuedOperationsForRecord(USER, "workouts", w.id),
        isOnline: false,
      }),
    ).toBe("syncing");
  });

  it("retour du réseau → synchronisation → récompense confirmée et actualisée", async () => {
    const w = await workoutsRepo.create(USER, activeWorkout());
    await processSyncQueue(USER);

    online = false;
    await workoutsRepo.update(w.id, USER, { status: "completed", duration_minutes: 40 });
    expect(await hasQueuedOperationsForRecord(USER, "workouts", w.id)).toBe(true);

    online = true;
    const result = await processSyncQueue(USER);
    expect(result.succeeded).toBeGreaterThan(0);

    const { snapshot, events } = await readRewardFromServer(w.id);
    expect(
      resolveRewardConfirmation({
        snapshot,
        hasQueuedWorkoutOps: await hasQueuedOperationsForRecord(USER, "workouts", w.id),
        isOnline: true,
      }),
    ).toBe("confirmed");
    expect(totalSessionXp(events)).toBe(XP_PER_MUSCU_SESSION);
  });

  it("une coupure PENDANT la synchronisation laisse l'état honnête, puis converge au retry", async () => {
    const w = await workoutsRepo.create(USER, activeWorkout());
    await processSyncQueue(USER);
    await workoutsRepo.update(w.id, USER, { status: "completed" });

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER);
    const afterFailure = await readRewardFromServer(w.id);
    expect(
      resolveRewardConfirmation({
        snapshot: afterFailure.snapshot,
        hasQueuedWorkoutOps: await hasQueuedOperationsForRecord(USER, "workouts", w.id),
        isOnline: true,
      }),
    ).toBe("syncing");

    await processSyncQueue(USER);
    const afterRetry = await readRewardFromServer(w.id);
    expect(
      resolveRewardConfirmation({
        snapshot: afterRetry.snapshot,
        hasQueuedWorkoutOps: await hasQueuedOperationsForRecord(USER, "workouts", w.id),
        isOnline: true,
      }),
    ).toBe("confirmed");
    // Aucun doublon d'XP malgré le retry (idempotence de la file).
    expect(totalSessionXp(afterRetry.events)).toBe(XP_PER_MUSCU_SESSION);
  });
});

// ─── MAJ-08 — progression / Rang ───────────────────────────────────────

describe("MAJ-08 — XP et Rang au retour du réseau", () => {
  it("l'XP serveur ne bouge pas tant que la clôture n'est pas synchronisée", async () => {
    const w = await workoutsRepo.create(USER, activeWorkout());
    await processSyncQueue(USER);

    online = false;
    await workoutsRepo.update(w.id, USER, { status: "completed" });
    expect(serverStore.get("user_stats")?.get(USER)?.xp ?? 0).toBe(0);

    online = true;
    await processSyncQueue(USER);
    expect(serverStore.get("user_stats")?.get(USER)?.xp).toBe(XP_PER_MUSCU_SESSION);
  });

  it("deux séances terminées hors ligne versent leur XP une seule fois chacune", async () => {
    online = false;
    const a = await workoutsRepo.create(USER, activeWorkout());
    await workoutsRepo.update(a.id, USER, { status: "completed" });
    const b = await workoutsRepo.create(USER, activeWorkout());
    await workoutsRepo.update(b.id, USER, { status: "completed" });

    online = true;
    await processSyncQueue(USER);
    await processSyncQueue(USER); // second passage : rien de plus ne doit être versé

    expect(serverStore.get("user_stats")?.get(USER)?.xp).toBe(XP_PER_MUSCU_SESSION * 2);
    expect(await listAllOperations(USER)).toHaveLength(0);
  });
});

// ─── MAJ-04 — coût réseau ──────────────────────────────────────────────

describe("MAJ-04 — la validation d'une série n'entraîne aucune écriture réseau directe", () => {
  it("chaque écriture locale reste locale : une seule opération enfilée, aucune lecture", async () => {
    const w = await workoutsRepo.create(USER, activeWorkout());
    await processSyncQueue(USER);

    fakeSupabaseOpts.reads = {};
    await workoutsRepo.update(w.id, USER, { duration_minutes: 10 });
    await workoutsRepo.update(w.id, USER, { duration_minutes: 20 });
    await workoutsRepo.update(w.id, USER, { duration_minutes: 30 });

    // Aucun aller-retour tant que la queue n'est pas passée.
    expect(fakeSupabaseOpts.reads).toEqual({});
    expect((await listAllOperations(USER)).length).toBe(3);
  });
});

// ─── DISC-01 — CORRIGÉ : ordre d'arrivée serveur d'une séance offline ───

describe("DISC-01 — séance vécue ENTIÈREMENT hors ligne", () => {
  /**
   * REPRODUCTION EXACTE DU BUG (mesurée avant/après).
   *
   * Avant le correctif : la clôture d'une séance jamais synchronisée était
   * FUSIONNÉE dans son `create` encore en attente (`repository.update` →
   * `findPendingCreateForRecord`). La séance arrivait donc en INSERT avec
   * `status='completed'` AVANT ses exercices et ses séries (file FIFO), et
   * `award_xp_on_workout_complete` s'exécutait sur une séance VIDE :
   * `exercisesSeenByTrigger === [0]`, aucune XP de record ni de progression
   * possible.
   *
   * Après : la clôture part comme une opération SÉPARÉE
   * (`neverMergeIntoPendingCreate`), enfilée après les enfants — le serveur
   * observe exactement la même chose qu'en ligne.
   */
  it("le trigger voit les exercices ET les séries de la séance", async () => {
    online = false;
    const { workout } = await createFullSessionLocally();
    await finishWorkoutLocally(workout.id);

    online = true;
    await processSyncQueue(USER);

    expect(exercisesSeenByTrigger).toEqual([1]);
    expect(setsSeenByTrigger).toEqual([2]);
  });

  it("le trigger ne se déclenche QU'UNE fois, à l'UPDATE — jamais à l'INSERT", async () => {
    online = false;
    const { workout } = await createFullSessionLocally();
    await finishWorkoutLocally(workout.id);

    online = true;
    await processSyncQueue(USER);

    // Un seul déclenchement : l'INSERT arrive en 'active' (donc sous le
    // garde `NEW.status = 'completed'`), seul l'UPDATE final déclenche.
    expect(exercisesSeenByTrigger).toHaveLength(1);
    expect(serverStore.get("user_stats")?.get(USER)?.xp).toBe(XP_PER_MUSCU_SESSION);
  });

  it("la séance arrive bien en 'active' puis passe à 'completed' (ordre FIFO respecté)", async () => {
    online = false;
    const { workout, exercise, sets } = await createFullSessionLocally();
    await finishWorkoutLocally(workout.id);

    const ops = await listAllOperations(USER);
    expect(ops.map((op) => `${op.opType}:${op.table}`)).toEqual([
      "create:workouts",
      "create:exercises",
      "create:exercise_sets",
      "create:exercise_sets",
      "update:workouts",
    ]);
    // Le `create` de la séance n'emporte PAS la clôture...
    expect((ops[0].payload as Row).status).toBe("active");
    // ...mais l'état LOCAL, lui, est bien terminé (l'écran ne recule jamais).
    expect((await workoutsRepo.get(workout.id))?.status).toBe("completed");

    online = true;
    await processSyncQueue(USER);

    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
    expect(serverStore.get("exercises")?.get(exercise.id)).toBeDefined();
    for (const st of sets) expect(serverStore.get("exercise_sets")?.get(st.id)).toBeDefined();
    expect(await listAllOperations(USER)).toHaveLength(0);
  });

  it("la clôture locale n'est jamais écrasée par la réponse serveur du `create`", async () => {
    // `applyServerRowToEntity` ne réécrit l'entité que s'il ne reste AUCUNE
    // opération en attente pour elle (chantier 1). Le `create` répondant
    // `status='active'`, sans ce garde-fou l'écran repasserait la séance en
    // « active » entre les deux opérations.
    online = false;
    const { workout } = await createFullSessionLocally();
    await finishWorkoutLocally(workout.id);

    online = true;
    fakeSupabaseOpts.failNext = true; // le `create` passe, la suite trébuche
    await processSyncQueue(USER);
    expect((await workoutsRepo.get(workout.id))?.status).toBe("completed");

    await processSyncQueue(USER);
    expect((await workoutsRepo.get(workout.id))?.status).toBe("completed");
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
  });

  it("la récompense reste honnête pendant tout le trajet, puis se confirme", async () => {
    online = false;
    const { workout } = await createFullSessionLocally();
    await finishWorkoutLocally(workout.id);

    expect(
      resolveRewardConfirmation({
        snapshot: null,
        hasQueuedWorkoutOps: await hasQueuedOperationsForRecord(USER, "workouts", workout.id),
        isOnline: false,
      }),
    ).toBe("syncing");

    online = true;
    await processSyncQueue(USER);
    const { snapshot, events } = await readRewardFromServer(workout.id);
    expect(
      resolveRewardConfirmation({
        snapshot,
        hasQueuedWorkoutOps: await hasQueuedOperationsForRecord(USER, "workouts", workout.id),
        isOnline: true,
      }),
    ).toBe("confirmed");
    expect(totalSessionXp(events)).toBe(XP_PER_MUSCU_SESSION);
  });

  it("un retry après coupure ne verse pas l'XP deux fois", async () => {
    online = false;
    const { workout } = await createFullSessionLocally();
    await finishWorkoutLocally(workout.id);

    online = true;
    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER);
    await processSyncQueue(USER);
    await processSyncQueue(USER);

    expect(serverStore.get("user_stats")?.get(USER)?.xp).toBe(XP_PER_MUSCU_SESSION);
    expect(exercisesSeenByTrigger).toEqual([1]);
    expect(await listAllOperations(USER)).toHaveLength(0);
  });

  it("supprimer une séance offline terminée ne laisse AUCUNE opération orpheline", async () => {
    // Sans l'annulation complète dans `repository.remove`, l'`update` séparé
    // survivrait au `create` annulé et tenterait de modifier une ligne que le
    // serveur n'a jamais vue — échec en boucle.
    online = false;
    const { workout } = await createFullSessionLocally();
    await finishWorkoutLocally(workout.id);
    await workoutsRepo.remove(workout.id, USER);

    const remaining = await listAllOperations(USER);
    expect(remaining.filter((op) => op.recordLocalId === workout.id)).toHaveLength(0);
    expect(await workoutsRepo.get(workout.id)).toBeUndefined();

    online = true;
    const result = await processSyncQueue(USER);
    expect(result.retried).toBe(0);
    expect(result.blocked).toBe(0);
    expect(serverStore.get("workouts")?.get(workout.id)).toBeUndefined();
  });
});

// ─── Non-régressions demandées ─────────────────────────────────────────

describe("DISC-01 — non-régressions", () => {
  it("clôture ONLINE : comportement inchangé (opération update séparée, trigger complet)", async () => {
    const { workout } = await createFullSessionLocally();
    await processSyncQueue(USER); // séance + enfants déjà synchronisés

    await finishWorkoutLocally(workout.id);
    const ops = await listAllOperations(USER);
    expect(ops).toHaveLength(1);
    expect(ops[0].opType).toBe("update");

    await processSyncQueue(USER);
    expect(exercisesSeenByTrigger).toEqual([1]);
    expect(setsSeenByTrigger).toEqual([2]);
    expect(serverStore.get("user_stats")?.get(USER)?.xp).toBe(XP_PER_MUSCU_SESSION);
  });

  it("une modification ORDINAIRE reste fusionnée dans le create en attente (comportement par défaut)", async () => {
    online = false;
    const w = await workoutsRepo.create(USER, activeWorkout());
    await workoutsRepo.update(w.id, USER, { name: "Séance renommée" });

    const ops = await listAllOperations(USER);
    expect(ops).toHaveLength(1);
    expect(ops[0].opType).toBe("create");
    expect((ops[0].payload as Row).name).toBe("Séance renommée");
  });

  it("les créations offline (séance, exercices, séries) partent toutes, sans doublon", async () => {
    online = false;
    const { workout, exercise, sets } = await createFullSessionLocally();

    online = true;
    await processSyncQueue(USER);

    expect(serverStore.get("workouts")?.size).toBe(1);
    expect(serverStore.get("exercises")?.size).toBe(1);
    expect(serverStore.get("exercise_sets")?.size).toBe(2);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("active");
    expect(serverStore.get("exercises")?.get(exercise.id)?.name).toBe("Développé couché");
    expect(serverStore.get("exercise_sets")?.get(sets[1].id)?.weight).toBe(90);
    // Aucune XP tant que la séance n'est pas clôturée.
    expect(exercisesSeenByTrigger).toEqual([]);
    expect(serverStore.get("user_stats")?.get(USER)?.xp ?? 0).toBe(0);
  });

  it("des séries ajoutées APRÈS la clôture locale ne rendent pas la file incohérente", async () => {
    // Cas limite : l'écran de récompense est ouvert, une opération tardive
    // arrive (resynchro du résumé d'exercice par `useFinishWorkout`).
    online = false;
    const { workout, exercise } = await createFullSessionLocally();
    await finishWorkoutLocally(workout.id);
    await exercisesRepo.update(exercise.id, USER, { sets: 2, reps: 6, weight: 90 } as never);

    online = true;
    await processSyncQueue(USER);

    expect(serverStore.get("exercises")?.get(exercise.id)?.weight).toBe(90);
    expect(exercisesSeenByTrigger).toEqual([1]);
    expect(await listAllOperations(USER)).toHaveLength(0);
  });

  it("l'XP déjà acquise n'est pas rejouée par la synchronisation d'une nouvelle séance", async () => {
    const first = await createFullSessionLocally();
    await processSyncQueue(USER);
    await finishWorkoutLocally(first.workout.id);
    await processSyncQueue(USER);
    expect(serverStore.get("user_stats")?.get(USER)?.xp).toBe(XP_PER_MUSCU_SESSION);

    online = false;
    const second = await createFullSessionLocally();
    await finishWorkoutLocally(second.workout.id);
    online = true;
    await processSyncQueue(USER);

    expect(serverStore.get("user_stats")?.get(USER)?.xp).toBe(XP_PER_MUSCU_SESSION * 2);
    expect(exercisesSeenByTrigger).toEqual([1, 1]);
  });
});
