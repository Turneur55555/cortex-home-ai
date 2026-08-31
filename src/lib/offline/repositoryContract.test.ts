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
 * Non-régression du CONTRAT entre le repository offline générique
 * (`src/lib/offline/repository.ts`) et les tables Supabase — chantier 2 de
 * l'audit du 30/08 :
 *
 *   - CRIT-02 : `shopping_list` n'avait pas de colonne `created_at` alors que
 *     `create()` en met une dans CHAQUE payload → tous ses `create`
 *     échouaient en 400 PGRST204, en boucle (migration 20260831090000) ;
 *   - MAJ-01 : `update()` envoyait `{...entity.data, ...patch}`, donc toute
 *     la ligne locale — un simple renommage de séance réécrivait
 *     `xp_before`/`xp_after`/`level_*`, colonnes calculées par les triggers
 *     RPG serveur ;
 *   - timestamps : `updated_at` doit venir du SERVEUR (trigger
 *     `set_updated_at`, migration 20260831091000), jamais de l'horloge d'un
 *     client resté hors ligne.
 *
 * Le simulateur Supabase reproduit ici les contraintes réelles de la base
 * (vérifiées en direct sur le projet `bcwfvpwxzlmkxobvbtzp` via
 * `information_schema.columns` et `pg_trigger`) : colonnes inconnues
 * refusées en `PGRST204` — sur INSERT **comme sur UPDATE** — et `updated_at`
 * réécrit par le trigger à chaque UPDATE. Voir `offlineSync.test.ts` pour la
 * version de base du simulateur.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface FakeSupabaseOptions {
  failNext?: boolean;
  /** Retire `created_at` du schéma `shopping_list` : reproduit l'état de la base AVANT la migration. */
  shoppingListWithoutCreatedAt?: boolean;
}

/**
 * Colonnes réelles des tables utilisées ici. `shopping_list` inclut
 * désormais `created_at` (migration 20260831090000) ; `workouts` porte les
 * colonnes RPG calculées côté serveur.
 */
const SHOPPING_LIST_COLUMNS = [
  "id",
  "user_id",
  "name",
  "quantity",
  "unit",
  "item_id",
  "added_at",
  "done",
  "category",
  "created_at",
  "updated_at",
];

const WORKOUTS_COLUMNS = [
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
];

/** Colonnes calculées par les triggers RPG serveur — jamais écrites par le client. */
const SERVER_COMPUTED_WORKOUT_COLUMNS = [
  "xp_before",
  "xp_after",
  "level_before",
  "level_after",
] as const;

interface FakePostgrestError {
  message: string;
  code: string;
}

/**
 * Horloge serveur strictement croissante : le trigger `set_updated_at` pose
 * `now()` à chaque UPDATE. Amorcée DEVANT l'horloge client (réinitialisée à
 * chaque test, cf. `beforeEach`) — sinon un `create()`, qui horodate avec
 * l'horloge client réelle, produirait un `updated_at` plus récent que le
 * serveur simulé et le test dépendrait de l'heure à laquelle il tourne.
 */
let serverClockMs = Date.now();
function resetServerClock(): void {
  serverClockMs = Date.now() + 60_000;
}
function serverNow(): string {
  serverClockMs += 1_000;
  return new Date(serverClockMs).toISOString();
}

/** Payloads réellement reçus par le simulateur — c'est ce que le client a envoyé sur le réseau. */
const receivedUpdates: Array<{ table: string; payload: Row }> = [];

function schemaFor(table: string, opts: FakeSupabaseOptions): Set<string> | null {
  if (table === "shopping_list") {
    return new Set(
      opts.shoppingListWithoutCreatedAt
        ? SHOPPING_LIST_COLUMNS.filter((c) => c !== "created_at")
        : SHOPPING_LIST_COLUMNS,
    );
  }
  if (table === "workouts") return new Set(WORKOUTS_COLUMNS);
  return null;
}

function unknownColumnError(table: string, column: string): FakePostgrestError {
  return {
    message: `Could not find the '${column}' column of '${table}' in the schema cache`,
    code: "PGRST204",
  };
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

        const allowed = schemaFor(table, opts);
        if (allowed && (op.type === "insert" || op.type === "upsert" || op.type === "update")) {
          const unknown = Object.keys(op.payload as Row).find((col) => !allowed.has(col));
          if (unknown) return { data: null, error: unknownColumnError(table, unknown) };
        }

        if (op.type === "insert" || op.type === "upsert") {
          const row = { ...(op.payload as Row) };
          // DEFAULT now() côté base quand le client ne fournit rien.
          row.created_at = (row.created_at as string | undefined) ?? serverNow();
          row.updated_at = (row.updated_at as string | undefined) ?? serverNow();
          store.set(row.id, row);
          return { data: { ...row }, error: null };
        }

        if (op.type === "update") {
          if (!idFilter || !store.has(idFilter)) {
            return { data: null, error: new Error("row not found") };
          }
          receivedUpdates.push({ table, payload: { ...(op.payload as Row) } });
          const existing = store.get(idFilter) as Row;
          const updated: Row = {
            ...existing,
            ...(op.payload as Row),
            // Trigger `set_updated_at` : la base impose sa propre valeur,
            // quoi qu'ait envoyé le client.
            updated_at: serverNow(),
          };
          store.set(idFilter, updated);
          return { data: { ...updated }, error: null };
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

import { clearAllOfflineDataForTests, getOfflineDb, resetOfflineDbForTests } from "./db";
import {
  createOfflineRepository,
  hydrateEntitiesFromServer,
  buildUpdatePayload,
  OFFLINE_CONTRACT_COLUMNS,
} from "./repository";
import { processSyncQueue } from "./syncEngine";
import { listAllOperations } from "./syncQueue";
import type { OfflineEntity } from "./types";

const USER_A = "11111111-1111-4111-8111-111111111111";

interface ShoppingListRow {
  id: string;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  item_id: string | null;
  category: string | null;
  done: boolean;
  added_at: string;
  created_at: string;
  updated_at: string;
}

interface WorkoutRow {
  id: string;
  user_id: string;
  name: string;
  date: string;
  gym_location: string;
  status: string;
  discipline: string;
  duration_minutes: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  level_before: number | null;
  level_after: number | null;
  xp_before: number | null;
  xp_after: number | null;
  created_at: string;
  updated_at: string;
}

const shoppingListRepo = createOfflineRepository<ShoppingListRow>("shopping_list");
const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");

type NewShoppingItem = Omit<ShoppingListRow, "id" | "user_id" | "created_at" | "updated_at">;
type NewWorkout = Omit<WorkoutRow, "id" | "user_id" | "created_at" | "updated_at">;

function shoppingItemInput(overrides: Partial<NewShoppingItem> = {}): NewShoppingItem {
  return {
    name: "Poulet",
    quantity: 500,
    unit: "g",
    item_id: null,
    category: "viande",
    done: false,
    added_at: new Date().toISOString(),
    ...overrides,
  };
}

function workoutInput(overrides: Partial<NewWorkout> = {}): NewWorkout {
  return {
    name: "Séance Pecs",
    date: "2026-08-31",
    gym_location: "maison",
    status: "active",
    discipline: "muscu",
    duration_minutes: null,
    notes: null,
    metadata: {},
    level_before: null,
    level_after: null,
    xp_before: null,
    xp_after: null,
    ...overrides,
  };
}

async function readEntity(table: string, id: string): Promise<OfflineEntity | undefined> {
  const db = await getOfflineDb();
  return (await db.get("entities", `${table}::${id}`)) as OfflineEntity | undefined;
}

beforeEach(async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.indexedDB = new IDBFactory();
  g.IDBKeyRange = IDBKeyRange;
  g.IDBCursor = IDBCursor;
  g.IDBCursorWithValue = IDBCursorWithValue;
  g.IDBDatabase = IDBDatabase;
  g.IDBIndex = IDBIndex;
  g.IDBObjectStore = IDBObjectStore;
  g.IDBOpenDBRequest = IDBOpenDBRequest;
  g.IDBRequest = IDBRequest;
  g.IDBTransaction = IDBTransaction;
  g.IDBVersionChangeEvent = IDBVersionChangeEvent;
  resetOfflineDbForTests();
  await clearAllOfflineDataForTests();
  serverStore.clear();
  resetServerClock();
  receivedUpdates.length = 0;
  fakeSupabaseOpts.failNext = false;
  fakeSupabaseOpts.shoppingListWithoutCreatedAt = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── TEST 1 : CRIT-02, shopping_list ────────────────────────────────────

describe("CRIT-02 — shopping_list respecte le contrat du repository offline", () => {
  it("un ajout hors connexion produit un payload accepté par la table réelle et se synchronise", async () => {
    const item = await shoppingListRepo.create(USER_A, shoppingItemInput());

    // Payload envoyé = ligne locale complète, colonnes du contrat comprises.
    const ops = await listAllOperations(USER_A);
    expect(ops).toHaveLength(1);
    expect(ops[0].opType).toBe("create");
    expect(Object.keys(ops[0].payload as Row)).toEqual(
      expect.arrayContaining([...OFFLINE_CONTRACT_COLUMNS]),
    );

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(result.retried).toBe(0);

    const serverRow = serverStore.get("shopping_list")?.get(item.id);
    expect(serverRow?.name).toBe("Poulet");
    expect(serverRow?.created_at).toBe(item.created_at);
    expect(await listAllOperations(USER_A)).toHaveLength(0);
  });

  it("sans la colonne created_at (état de la base AVANT migration), le même create échouait en PGRST204 — le test garde la trace du bug", async () => {
    fakeSupabaseOpts.shoppingListWithoutCreatedAt = true;
    await shoppingListRepo.create(USER_A, shoppingItemInput());

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(0);
    // Depuis le chantier 1, une erreur de schéma (PGRST204) est reconnue
    // DÉFINITIVE : l'opération est figée en `blocked` et rendue visible,
    // au lieu d'être retentée à l'infini. Avant les deux chantiers, c'était
    // exactement le symptôme prod "N actions en échec".
    expect(result.blocked).toBe(1);

    const [op] = await listAllOperations(USER_A);
    expect(op.status).toBe("blocked");
    expect(op.lastError).toContain("created_at");
    expect(op.lastErrorCode).toBe("PGRST204");
    expect(serverStore.get("shopping_list")?.size ?? 0).toBe(0);
  });

  it("cocher un article hors connexion puis synchroniser n'envoie que `done`", async () => {
    const item = await shoppingListRepo.create(USER_A, shoppingItemInput());
    await processSyncQueue(USER_A);

    await shoppingListRepo.update(item.id, USER_A, { done: true });
    await processSyncQueue(USER_A);

    expect(receivedUpdates).toEqual([{ table: "shopping_list", payload: { done: true } }]);
    expect(serverStore.get("shopping_list")?.get(item.id)?.done).toBe(true);
  });
});

// ─── TEST 2 : colonnes du contrat produites par create() ────────────────

describe("create() produit les colonnes du contrat", () => {
  it("id, user_id, created_at et updated_at sont renseignés et cohérents", async () => {
    const before = Date.now();
    const item = await shoppingListRepo.create(USER_A, shoppingItemInput());
    const after = Date.now();

    expect(item.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(item.user_id).toBe(USER_A);
    expect(Date.parse(item.created_at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(item.created_at)).toBeLessThanOrEqual(after);
    // À la création, les deux timestamps partent de la même valeur : c'est
    // l'instant de création réel (hors ligne), le serveur ne peut pas le
    // connaître.
    expect(item.updated_at).toBe(item.created_at);

    // La ligne locale est immédiatement lisible, sans réseau.
    expect(await shoppingListRepo.get(item.id)).toEqual(item);
    const entity = await readEntity("shopping_list", item.id);
    expect(entity?.userId).toBe(USER_A);
    expect(entity?.syncStatus).toBe("pending");
    expect(entity?.serverUpdatedAt).toBeNull();
  });
});

// ─── TEST 3 : MAJ-01, update partiel ────────────────────────────────────

describe("MAJ-01 — update() n'envoie que le patch demandé", () => {
  it("l'opération de sync ne contient que les colonnes réellement modifiées", async () => {
    const workout = await workoutsRepo.create(USER_A, workoutInput());
    await processSyncQueue(USER_A);

    await workoutsRepo.update(workout.id, USER_A, { name: "Nouvelle séance" });

    const [op] = await listAllOperations(USER_A);
    expect(op.opType).toBe("update");
    expect(op.payload).toEqual({ name: "Nouvelle séance" });
  });

  it("la ligne locale reste complète (l'écran continue d'afficher toute la séance)", async () => {
    const workout = await workoutsRepo.create(USER_A, workoutInput());
    await processSyncQueue(USER_A);

    const updated = await workoutsRepo.update(workout.id, USER_A, { name: "Nouvelle séance" });

    expect(updated.name).toBe("Nouvelle séance");
    expect(updated.discipline).toBe("muscu");
    expect(updated.date).toBe("2026-08-31");
    expect(await workoutsRepo.get(workout.id)).toEqual(updated);
  });

  it("les colonnes du contrat sont retirées du patch même si l'appelant les fournit", () => {
    expect(
      buildUpdatePayload({
        id: "abc",
        user_id: USER_A,
        created_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2020-01-01T00:00:00.000Z",
        name: "Nouvelle séance",
      }),
    ).toEqual({ name: "Nouvelle séance" });
  });

  it("un patch ne contenant que des colonnes du contrat n'enfile aucune opération (rien à envoyer)", async () => {
    const workout = await workoutsRepo.create(USER_A, workoutInput());
    await processSyncQueue(USER_A);

    await workoutsRepo.update(workout.id, USER_A, {
      updated_at: "2020-01-01T00:00:00.000Z",
    } as Partial<WorkoutRow>);

    expect(await listAllOperations(USER_A)).toHaveLength(0);
    // L'entité ne reste pas coincée en `pending` sans opération associée.
    expect((await readEntity("workouts", workout.id))?.syncStatus).toBe("synced");
  });
});

// ─── TEST 4 : colonnes calculées serveur préservées ─────────────────────

describe("MAJ-01 — les colonnes calculées côté serveur survivent à un update banal", () => {
  it("renommer une séance ne réécrit pas xp_before/xp_after/level_before/level_after", async () => {
    const workout = await workoutsRepo.create(USER_A, workoutInput({ status: "completed" }));
    await processSyncQueue(USER_A);

    // Les triggers RPG serveur (`award_xp_on_workout_complete`) remplissent
    // les colonnes de progression APRÈS coup, côté base. Le cache local, lui,
    // porte encore les null posés à la création hors ligne.
    // `updated_at` n'est volontairement pas touché ici : on isole MAJ-01
    // (forme du payload) du détecteur de conflit, qui a son propre chantier.
    const serverRow = serverStore.get("workouts")?.get(workout.id) as Row;
    serverRow.xp_before = 1200;
    serverRow.xp_after = 1350;
    serverRow.level_before = 12;
    serverRow.level_after = 13;

    const local = await workoutsRepo.get(workout.id);
    expect(local?.xp_after).toBeNull(); // le local est bien « en retard »

    await workoutsRepo.update(workout.id, USER_A, { name: "Séance renommée" });
    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);

    // Aucune colonne calculée serveur n'a été envoyée sur le réseau…
    expect(receivedUpdates).toHaveLength(1);
    for (const column of SERVER_COMPUTED_WORKOUT_COLUMNS) {
      expect(Object.keys(receivedUpdates[0].payload)).not.toContain(column);
    }

    // …et la progression RPG calculée serveur est intacte.
    const after = serverStore.get("workouts")?.get(workout.id);
    expect(after?.name).toBe("Séance renommée");
    expect(after?.xp_before).toBe(1200);
    expect(after?.xp_after).toBe(1350);
    expect(after?.level_before).toBe(12);
    expect(after?.level_after).toBe(13);

    // La réponse serveur réhydrate le local : il connaît maintenant l'XP.
    expect((await workoutsRepo.get(workout.id))?.xp_after).toBe(1350);
  });

  it("une valeur serveur enrichie survit aussi à un update d'une ligne hydratée depuis le serveur", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const serverRow: Row = {
      id,
      user_id: USER_A,
      ...workoutInput({ status: "completed" }),
      xp_before: 900,
      xp_after: 1100,
      level_before: 9,
      level_after: 10,
      created_at: "2026-08-20T08:00:00.000Z",
      updated_at: "2026-08-20T08:00:00.000Z",
    };
    serverStore.set("workouts", new Map([[id, { ...serverRow }]]));
    // Le client a hydraté une version ANTÉRIEURE, sans l'XP.
    await hydrateEntitiesFromServer<WorkoutRow>("workouts", USER_A, [
      {
        ...serverRow,
        xp_before: null,
        xp_after: null,
        level_before: null,
        level_after: null,
      } as unknown as WorkoutRow,
    ]);

    await workoutsRepo.update(id, USER_A, { notes: "penser au gainage" });
    await processSyncQueue(USER_A);

    const after = serverStore.get("workouts")?.get(id);
    expect(after?.notes).toBe("penser au gainage");
    expect(after?.xp_after).toBe(1100);
    expect(after?.level_after).toBe(10);
  });
});

// ─── TEST 5 : CREATE puis UPDATE avant synchronisation ──────────────────

describe("CREATE puis UPDATE hors connexion, avant toute synchronisation", () => {
  it("le patch fusionne dans le create en attente : une seule opération, état final cohérent", async () => {
    const workout = await workoutsRepo.create(USER_A, workoutInput());
    await workoutsRepo.update(workout.id, USER_A, { name: "Séance renommée" });

    const ops = await listAllOperations(USER_A);
    expect(ops).toHaveLength(1);
    expect(ops[0].opType).toBe("create");
    // Le payload d'un create reste la ligne COMPLÈTE : un INSERT a besoin de
    // toutes les colonnes, et aucune valeur serveur n'existe encore.
    const payload = ops[0].payload as unknown as WorkoutRow;
    expect(payload.name).toBe("Séance renommée");
    expect(payload.id).toBe(workout.id);
    expect(payload.user_id).toBe(USER_A);
    expect(payload.created_at).toBe(workout.created_at);

    await processSyncQueue(USER_A);
    const serverRow = serverStore.get("workouts")?.get(workout.id);
    expect(serverRow?.name).toBe("Séance renommée");
    expect(await listAllOperations(USER_A)).toHaveLength(0);
    // Aucun UPDATE réseau : la création portait déjà la bonne valeur.
    expect(receivedUpdates).toHaveLength(0);
  });

  it("create → update → update conserve l'ordre FIFO et n'envoie qu'un seul INSERT", async () => {
    const workout = await workoutsRepo.create(USER_A, workoutInput());
    await workoutsRepo.update(workout.id, USER_A, { name: "Étape 1" });
    await workoutsRepo.update(workout.id, USER_A, { status: "completed", duration_minutes: 62 });

    const ops = await listAllOperations(USER_A);
    expect(ops.map((o) => o.opType)).toEqual(["create"]);

    await processSyncQueue(USER_A);
    const serverRow = serverStore.get("workouts")?.get(workout.id);
    expect(serverRow?.name).toBe("Étape 1");
    expect(serverRow?.status).toBe("completed");
    expect(serverRow?.duration_minutes).toBe(62);
  });

  it("deux patchs enchaînés APRÈS la première synchronisation partent dans l'ordre, sans perte", async () => {
    const workout = await workoutsRepo.create(USER_A, workoutInput());
    await processSyncQueue(USER_A);

    await workoutsRepo.update(workout.id, USER_A, { name: "Renommée" });
    await workoutsRepo.update(workout.id, USER_A, { notes: "RPE 8" });

    const ops = await listAllOperations(USER_A);
    expect(ops.map((o) => o.payload)).toEqual([{ name: "Renommée" }, { notes: "RPE 8" }]);

    await processSyncQueue(USER_A);

    // Chaque patch a été appliqué, aucun n'a écrasé l'autre.
    const serverRow = serverStore.get("workouts")?.get(workout.id);
    expect(serverRow?.name).toBe("Renommée");
    expect(serverRow?.notes).toBe("RPE 8");
    // Localement aussi : la réponse partielle du premier patch n'a pas fait
    // « reculer » l'écran pendant que le second attendait son tour.
    const local = await workoutsRepo.get(workout.id);
    expect(local?.name).toBe("Renommée");
    expect(local?.notes).toBe("RPE 8");
    expect((await readEntity("workouts", workout.id))?.syncStatus).toBe("synced");
  });

  it("une création jamais synchronisée reste modifiable après un échec réseau (l'ordre create → update tient)", async () => {
    const workout = await workoutsRepo.create(USER_A, workoutInput());
    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A); // le create échoue, reste en queue

    await workoutsRepo.update(workout.id, USER_A, { name: "Modifiée hors ligne" });
    const ops = await listAllOperations(USER_A);
    expect(ops).toHaveLength(1);
    expect(ops[0].opType).toBe("create");

    await processSyncQueue(USER_A);
    expect(serverStore.get("workouts")?.get(workout.id)?.name).toBe("Modifiée hors ligne");
  });
});

// ─── TEST 8 : updated_at, propriété du serveur ──────────────────────────

describe("updated_at est produit par le serveur, jamais par l'horloge du client", () => {
  it("un update ne transporte pas updated_at et récupère la valeur posée par le trigger", async () => {
    const workout = await workoutsRepo.create(USER_A, workoutInput());
    await processSyncQueue(USER_A);

    const afterCreate = serverStore.get("workouts")?.get(workout.id)?.updated_at as string;
    const entityAfterCreate = await readEntity("workouts", workout.id);
    expect(entityAfterCreate?.serverUpdatedAt).toBe(afterCreate);

    await workoutsRepo.update(workout.id, USER_A, { name: "Séance renommée" });
    await processSyncQueue(USER_A);

    // Le client n'a pas envoyé updated_at…
    expect(Object.keys(receivedUpdates[0].payload)).not.toContain("updated_at");
    // …et la base l'a bien avancé toute seule (trigger `set_updated_at`).
    const afterUpdate = serverStore.get("workouts")?.get(workout.id)?.updated_at as string;
    expect(Date.parse(afterUpdate)).toBeGreaterThan(Date.parse(afterCreate));

    // La nouvelle base de comparaison du détecteur de conflit vient du serveur.
    const entity = await readEntity("workouts", workout.id);
    expect(entity?.serverUpdatedAt).toBe(afterUpdate);
    expect(entity?.syncStatus).toBe("synced");
  });

  it("une horloge client en avance ne peut pas polluer updated_at côté serveur", async () => {
    const workout = await workoutsRepo.create(USER_A, workoutInput());
    await processSyncQueue(USER_A);

    await workoutsRepo.update(workout.id, USER_A, {
      name: "Renommée",
      updated_at: "2099-01-01T00:00:00.000Z",
    } as Partial<WorkoutRow>);
    await processSyncQueue(USER_A);

    const serverRow = serverStore.get("workouts")?.get(workout.id);
    expect(serverRow?.updated_at).not.toBe("2099-01-01T00:00:00.000Z");
    expect(Date.parse(serverRow?.updated_at as string)).toBeLessThan(Date.parse("2030-01-01"));
  });
});
