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
  exercisesSeenByTrigger.push(
    Array.from(server.get("exercises")?.values() ?? []).filter((e) => e.workout_id === workout.id)
      .length,
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

// ─── DISC-01 — comportement DOCUMENTÉ, non corrigé (décision produit) ───

describe("DISC-01 — séance vécue ENTIÈREMENT hors ligne : ordre d'arrivée serveur", () => {
  /**
   * CONSTAT (mesuré, pas supposé) — hors périmètre du chantier 4, documenté
   * ici pour qu'il soit visible et qu'une régression future soit détectée.
   *
   * Quand la séance N'A JAMAIS été synchronisée, la clôture est FUSIONNÉE dans
   * le `create` encore en attente (`repository.update` →
   * `findPendingCreateForRecord`) : la séance part donc en INSERT avec
   * `status='completed'`. La file étant FIFO, cet INSERT précède celui de ses
   * exercices — le trigger `award_xp_on_workout_complete` s'exécute donc sur
   * une séance encore VIDE côté serveur. Le forfait `workout_muscu` est bien
   * versé, mais l'XP de record / de progression d'exercice, elle, ne peut pas
   * l'être.
   *
   * Corriger cela touche l'ordonnancement de la sync queue (chantier 1) ou
   * l'économie XP serveur : décision produit requise, PAS un patch à l'aveugle.
   * Ce test fige donc l'état ACTUEL — il devra être mis à jour le jour où la
   * décision est prise.
   */
  it("le trigger s'exécute avant l'arrivée des exercices (XP de record impossible)", async () => {
    online = false;
    const w = await workoutsRepo.create(USER, activeWorkout());
    await exercisesRepo.create(USER, {
      workout_id: w.id,
      name: "Développé couché",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    } as never);
    await workoutsRepo.update(w.id, USER, { status: "completed" });

    online = true;
    await processSyncQueue(USER);

    expect(exercisesSeenByTrigger).toEqual([0]);
    // Le forfait de base est bien versé : la récompense n'est pas nulle, elle
    // est INCOMPLÈTE — et elle est affichée telle que le serveur l'a calculée.
    expect(serverStore.get("user_stats")?.get(USER)?.xp).toBe(XP_PER_MUSCU_SESSION);
  });

  it("à l'inverse, une séance déjà synchronisée expose ses exercices au trigger", async () => {
    const w = await workoutsRepo.create(USER, activeWorkout());
    await exercisesRepo.create(USER, {
      workout_id: w.id,
      name: "Développé couché",
      sets: null,
      reps: null,
      weight: null,
      position: 0,
    } as never);
    await processSyncQueue(USER); // la séance ET son exercice partent d'abord

    await workoutsRepo.update(w.id, USER, { status: "completed" });
    await processSyncQueue(USER);

    expect(exercisesSeenByTrigger).toEqual([1]);
  });
});
