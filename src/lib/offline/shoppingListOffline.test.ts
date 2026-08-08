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
 * Couverture offline-first de la Liste de courses (`src/hooks/useShoppingList.ts`,
 * table `shopping_list`) — même infra générique que
 * `src/lib/offline/offlineSync.test.ts`/`nutritionOffline.test.ts`, mêmes
 * primitives (`createOfflineRepository`, `processSyncQueue`,
 * `resolveConflict`, `purgeUserOfflineData`). Voir `offlineSync.test.ts` pour
 * le détail du simulateur Supabase in-memory réutilisé ici.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface FakeSupabaseOptions {
  /** Si vrai, la PROCHAINE requête échoue avec une erreur réseau (simulateur de coupure). */
  failNext?: boolean;
}

function createFakeSupabase(server: Map<string, Map<string, Row>>, opts: FakeSupabaseOptions) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "insert" | "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: Error | null }> => {
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

interface ShoppingListRow extends Row {
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  done: boolean;
  added_at: string;
}

const USER_A = "user-a";
const USER_B = "user-b";

const shoppingRow = (overrides: Partial<ShoppingListRow> = {}) => ({
  name: "Pommes",
  quantity: 6,
  unit: "pièce(s)",
  category: "Fruits & Légumes",
  done: false,
  added_at: new Date().toISOString(),
  ...overrides,
});

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

describe("Liste de courses — lecture/écriture hors connexion", () => {
  it("lecture hors connexion : liste déjà synchronisée reste visible", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const created = await repo.create(USER_A, shoppingRow());
    await processSyncQueue(USER_A); // simule une liste déjà synchronisée lors d'une session précédente

    const all = await repo.list(USER_A);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].name).toBe("Pommes");
  });

  it("création hors connexion : visible immédiatement en local, rien envoyé au serveur", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const created = await repo.create(USER_A, shoppingRow({ name: "Lait" }));
    expect(created.id).toBeTruthy();
    const list = await repo.list(USER_A);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Lait");
    expect(serverStore.get("shopping_list")?.size ?? 0).toBe(0);
  });

  it("toggle `done` hors connexion : mis à jour immédiatement en local", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const created = await repo.create(USER_A, shoppingRow({ done: false }));
    const updated = await repo.update(created.id, USER_A, { done: true });
    expect(updated.done).toBe(true);
    const fetched = await repo.get(created.id);
    expect(fetched?.done).toBe(true);
  });

  it("suppression hors connexion : disparaît de list() (tombstone local)", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const created = await repo.create(USER_A, shoppingRow({ name: "Beurre" }));
    await repo.remove(created.id, USER_A);
    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.get(created.id)).toBeUndefined();
  });

  it("suppression en masse des articles achetés hors connexion : ne retire que done=true", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const bought1 = await repo.create(USER_A, shoppingRow({ name: "Pain", done: true }));
    const bought2 = await repo.create(USER_A, shoppingRow({ name: "Oeufs", done: true }));
    const pending = await repo.create(USER_A, shoppingRow({ name: "Riz", done: false }));

    const local = await repo.list(USER_A);
    const toClear = local.filter((r) => r.done);
    for (const r of toClear) {
      await repo.remove(r.id, USER_A);
    }

    const remaining = await repo.list(USER_A);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(pending.id);
    expect(await repo.get(bought1.id)).toBeUndefined();
    expect(await repo.get(bought2.id)).toBeUndefined();
  });

  it("plusieurs opérations enchaînées avant reconnexion : toutes reflétées en local", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const a = await repo.create(USER_A, shoppingRow({ name: "A" }));
    const b = await repo.create(USER_A, shoppingRow({ name: "B" }));
    await repo.update(a.id, USER_A, { done: true });
    await repo.remove(b.id, USER_A);
    await repo.create(USER_A, shoppingRow({ name: "C" }));

    const list = await repo.list(USER_A);
    expect(list.map((r) => r.name).sort()).toEqual(["A", "C"]);
    expect(list.find((r) => r.id === a.id)?.done).toBe(true);
  });
});

describe("Liste de courses — synchronisation au retour réseau", () => {
  it("une création locale est poussée vers le serveur (mock) au processSyncQueue", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const created = await repo.create(USER_A, shoppingRow({ name: "Tomates" }));

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("shopping_list")?.has(created.id)).toBe(true);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });

  it("plusieurs opérations enchaînées avant retour réseau sont toutes rejouées en ordre", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const a = await repo.create(USER_A, shoppingRow({ name: "A" }));
    const b = await repo.create(USER_A, shoppingRow({ name: "B" }));
    await repo.update(a.id, USER_A, { done: true });
    await repo.remove(b.id, USER_A);

    const opsBefore = await listAllOperations(USER_A);
    // create(a) fusionné avec l'update(a) => 1 op pour a ; create(b) +
    // remove(b) s'annulent avant tout envoi => 0 op pour b.
    expect(opsBefore).toHaveLength(1);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    const server = serverStore.get("shopping_list");
    expect(server?.get(a.id)?.done).toBe(true);
    expect(server?.has(b.id)).toBe(false);
  });
});

describe("Liste de courses — coupure réseau pendant la synchronisation + retry", () => {
  it("un échec réseau garde l'opération (status failed), et le retry suivant la termine", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const created = await repo.create(USER_A, shoppingRow({ name: "Riz" }));

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(first.succeeded).toBe(0);

    const opsAfterFailure = await listAllOperations(USER_A);
    expect(opsAfterFailure).toHaveLength(1);
    expect(opsAfterFailure[0].status).toBe("failed");
    expect(opsAfterFailure[0].retryCount).toBe(1);
    expect(serverStore.get("shopping_list")?.has(created.id)).toBeFalsy();

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(await listAllOperations(USER_A)).toEqual([]);
    expect(serverStore.get("shopping_list")?.get(created.id)?.name).toBe("Riz");
  });

  it("idempotence : un create rejoué après coupure ne crée pas de doublon (upsert par id)", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const created = await repo.create(USER_A, shoppingRow({ name: "Pommes" }));

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A); // échoue, laisse l'opération en attente
    await processSyncQueue(USER_A); // retry, réussit

    const server = serverStore.get("shopping_list");
    expect(server?.size).toBe(1);
    expect(server?.get(created.id)?.name).toBe("Pommes");
  });
});

describe("Liste de courses — conflit local/serveur", () => {
  async function seedSyncedEntry(userId: string) {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    const created = await repo.create(userId, shoppingRow({ name: "Fromage", done: false }));
    await processSyncQueue(userId); // synchronisé, entité locale "synced"
    return { repo, created };
  }

  it("détecte un conflit quand le serveur a changé ET la donnée locale aussi, sans écraser silencieusement", async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);

    // Modification "ailleurs" (autre appareil) directement côté serveur simulé.
    const serverRow = serverStore.get("shopping_list")!.get(created.id)!;
    serverStore.get("shopping_list")!.set(created.id, {
      ...serverRow,
      done: true,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    // Modification locale concurrente (ex: changement de quantité).
    await repo.update(created.id, USER_A, { quantity: 3 });

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(1);
    expect(result.succeeded).toBe(0);

    const conflicts = await listConflicts(USER_A);
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].localData as ShoppingListRow).quantity).toBe(3);
    expect((conflicts[0].serverData as ShoppingListRow).done).toBe(true);

    // Le serveur n'a pas été écrasé par erreur.
    expect(serverStore.get("shopping_list")!.get(created.id)!.done).toBe(true);
  });

  it('résolution "Garder ma version" : ré-envoie la version locale et écrase le serveur', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("shopping_list")!.get(created.id)!;
    serverStore.get("shopping_list")!.set(created.id, {
      ...serverRow,
      done: true,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { quantity: 3 });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-local");
    expect(await listConflicts(USER_A)).toEqual([]);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("shopping_list")!.get(created.id)!.quantity).toBe(3);
  });

  it('résolution "Garder la version serveur" : applique la version serveur en local, rien à renvoyer', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("shopping_list")!.get(created.id)!;
    serverStore.get("shopping_list")!.set(created.id, {
      ...serverRow,
      done: true,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { quantity: 3 });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-server");
    expect(await listConflicts(USER_A)).toEqual([]);

    const local = await repo.get(created.id);
    expect(local?.done).toBe(true);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("Liste de courses — changement de compte", () => {
  it("purge le store offline par userId : aucune fuite de liste entre comptes", async () => {
    const repo = createOfflineRepository<ShoppingListRow>("shopping_list");
    await repo.create(USER_A, shoppingRow({ name: "Article compte A" }));
    await repo.create(USER_B, shoppingRow({ name: "Article compte B" }));

    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(await repo.list(USER_B)).toHaveLength(1);

    await purgeUserOfflineData(USER_A);

    expect(await repo.list(USER_A)).toEqual([]);
    // Le compte B n'est jamais affecté par la purge du compte A.
    expect(await repo.list(USER_B)).toHaveLength(1);

    const db = await getOfflineDb();
    const remainingOpsA = await db.getAllFromIndex("syncQueue", "by-user", USER_A);
    expect(remainingOpsA).toEqual([]);
  });
});
