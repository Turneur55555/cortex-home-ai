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
 * La « journée bouclée », HORS LIGNE puis synchronisée.
 *
 * Même infrastructure que `useWeeklyPlan.test.ts` : fausse IndexedDB et
 * simulateur Supabase en mémoire. On teste `writeNutritionDayClosure` (le
 * chemin réel de la mutation de l'écran) : ce qui part réellement vers le
 * serveur, et ce qui ne doit pas y partir.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

function createFakeSupabase(server: Map<string, Map<string, Row>>) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "insert" | "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: Error | null }> => {
        if (!op) {
          if (idFilter) return { data: store.get(idFilter) ?? null, error: null };
          return { data: Array.from(store.values()), error: null };
        }
        if (op.type === "insert" || op.type === "upsert") {
          const row = { ...(op.payload as Row) };
          store.set(row.id, row);
          return { data: row, error: null };
        }
        if (op.type === "update") {
          if (!idFilter || !store.has(idFilter)) {
            return { data: null, error: new Error("row not found") };
          }
          const updated: Row = {
            ...(store.get(idFilter) as Row),
            ...(op.payload as Row),
            updated_at: new Date().toISOString(),
          };
          store.set(idFilter, updated);
          return { data: updated, error: null };
        }
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

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase(serverStore);
  },
}));

// Imports après le mock (obligatoire avec vi.mock hoisté).
import { resetOfflineDbForTests } from "@/lib/offline/db";
import { createOfflineRepository } from "@/lib/offline/repository";
import { listAllOperations } from "@/lib/offline/syncQueue";
import { processSyncQueue } from "@/lib/offline/syncEngine";
import { writeNutritionDayClosure, type NutritionDayClosureRow } from "./useNutritionDayClosures";

const USER_A = "user-a";
const USER_B = "user-b";
const TABLE = "nutrition_day_closures";
const DAY = "2026-11-01";

// Même table, même store : le repository générique est sans état.
const repo = createOfflineRepository<NutritionDayClosureRow>(TABLE);

function serverRows(): Row[] {
  return Array.from(serverStore.get(TABLE)?.values() ?? []);
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writeNutritionDayClosure — locale d'abord, hors ligne", () => {
  it("boucler crée une ligne en local, la synchronisation l'envoie ensuite", async () => {
    await expect(writeNutritionDayClosure(USER_A, DAY, true)).resolves.toBe("created");

    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(serverRows()).toHaveLength(0);
    expect(await listAllOperations(USER_A)).toHaveLength(1);

    await processSyncQueue(USER_A);

    expect(serverRows()).toHaveLength(1);
    expect(serverRows()[0]).toMatchObject({ user_id: USER_A, date: DAY });
    expect(await listAllOperations(USER_A)).toHaveLength(0);
  });

  it("boucler une journée déjà bouclée : rien à faire, rien dans la file", async () => {
    await writeNutritionDayClosure(USER_A, DAY, true);
    await processSyncQueue(USER_A);

    await expect(writeNutritionDayClosure(USER_A, DAY, true)).resolves.toBe("noop");
    expect(await listAllOperations(USER_A)).toHaveLength(0);
    expect(await repo.list(USER_A)).toHaveLength(1);
  });

  it("deux appuis simultanés ne fabriquent pas de doublon (écriture sérialisée)", async () => {
    const results = await Promise.all([
      writeNutritionDayClosure(USER_A, DAY, true),
      writeNutritionDayClosure(USER_A, DAY, true),
    ]);
    expect(results.sort()).toEqual(["created", "noop"]);
    expect(await repo.list(USER_A)).toHaveLength(1);
  });

  it("rouvrir supprime la ligne, localement puis sur le serveur", async () => {
    await writeNutritionDayClosure(USER_A, DAY, true);
    await processSyncQueue(USER_A);

    await expect(writeNutritionDayClosure(USER_A, DAY, false)).resolves.toBe("removed");
    expect(await repo.list(USER_A)).toHaveLength(0);

    await processSyncQueue(USER_A);
    expect(serverRows()).toHaveLength(0);
  });

  it("rouvrir supprime AUSSI un doublon venu d'un second appareil", async () => {
    // Deux appareils ont bouclé la même journée hors ligne : deux lignes (aucun UNIQUE en base).
    await repo.create(USER_A, { date: DAY });
    await repo.create(USER_A, { date: DAY });
    await processSyncQueue(USER_A);
    expect(serverRows()).toHaveLength(2);

    await writeNutritionDayClosure(USER_A, DAY, false);
    await processSyncQueue(USER_A);
    expect(serverRows()).toHaveLength(0);
  });

  it("rouvrir une journée non bouclée : rien à faire", async () => {
    await expect(writeNutritionDayClosure(USER_A, DAY, false)).resolves.toBe("noop");
    expect(await listAllOperations(USER_A)).toHaveLength(0);
  });

  it("chaque joueur ne voit que ses journées", async () => {
    await writeNutritionDayClosure(USER_A, DAY, true);
    expect(await repo.list(USER_B)).toHaveLength(0);
    await expect(writeNutritionDayClosure(USER_B, DAY, true)).resolves.toBe("created");
    expect(await repo.list(USER_A)).toHaveLength(1);
  });
});
