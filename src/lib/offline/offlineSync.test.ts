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
 * Couverture de l'infra offline-first générique (src/lib/offline/) et de
 * son premier module migré, `nutrition_favorites` — mêmes primitives
 * génériques, donc ces scénarios couvrent aussi bien la couche générique
 * que le repository nutrition_favorites (cf. CLAUDE.md exigence de tests).
 *
 * `fake-indexeddb` simule IndexedDB en environnement Node (vitest
 * `environment: "node"`, cf. vitest.config.ts).
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

interface FavoriteRow extends Row {
  user_id: string;
  name: string;
  meal: string | null;
  calories: number | null;
  created_at: string;
}

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

describe("repository offline (nutrition_favorites)", () => {
  it("lecture hors connexion : liste vide puis reflète les écritures locales", async () => {
    const repo = createOfflineRepository<FavoriteRow>("nutrition_favorites");
    expect(await repo.list(USER_A)).toEqual([]);
  });

  it("création hors connexion : visible immédiatement en local", async () => {
    const repo = createOfflineRepository<FavoriteRow>("nutrition_favorites");
    const created = await repo.create(USER_A, {
      name: "Poulet riz",
      meal: "dejeuner",
      calories: 500,
    });
    expect(created.id).toBeTruthy();
    const list = await repo.list(USER_A);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Poulet riz");
    // Rien envoyé au serveur tant que la sync n'a pas tourné.
    expect(serverStore.get("nutrition_favorites")?.size ?? 0).toBe(0);
  });

  it("modification hors connexion : patch appliqué localement", async () => {
    const repo = createOfflineRepository<FavoriteRow>("nutrition_favorites");
    const created = await repo.create(USER_A, { name: "Salade", meal: "dejeuner", calories: 200 });
    const updated = await repo.update(created.id, USER_A, { calories: 250 });
    expect(updated.calories).toBe(250);
    const fetched = await repo.get(created.id);
    expect(fetched?.calories).toBe(250);
  });

  it("suppression hors connexion : disparaît de list() (tombstone local)", async () => {
    const repo = createOfflineRepository<FavoriteRow>("nutrition_favorites");
    const created = await repo.create(USER_A, { name: "Yaourt", meal: "collation", calories: 100 });
    await repo.remove(created.id, USER_A);
    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.get(created.id)).toBeUndefined();
  });
});

describe("synchronisation au retour réseau", () => {
  it("une création locale est poussée vers le serveur (mock) au processSyncQueue", async () => {
    const repo = createOfflineRepository<FavoriteRow>("nutrition_favorites");
    const created = await repo.create(USER_A, { name: "Oeufs", meal: "petit-dej", calories: 150 });

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("nutrition_favorites")?.has(created.id)).toBe(true);

    // La queue est vide et l'entité locale marquée synced.
    expect(await listAllOperations(USER_A)).toEqual([]);
  });

  it("plusieurs opérations locales enchaînées avant retour réseau sont toutes rejouées en ordre", async () => {
    const repo = createOfflineRepository<FavoriteRow>("nutrition_favorites");
    const a = await repo.create(USER_A, { name: "A", meal: null, calories: 1 });
    const b = await repo.create(USER_A, { name: "B", meal: null, calories: 2 });
    await repo.update(a.id, USER_A, { calories: 10 });
    await repo.remove(b.id, USER_A);

    const opsBefore = await listAllOperations(USER_A);
    // create(a) fusionné avec l'update(a) => toujours 1 op pour a ; create(b)
    // + remove(b) s'annulent avant tout envoi => 0 op pour b.
    expect(opsBefore).toHaveLength(1);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    const serverFavorites = serverStore.get("nutrition_favorites");
    expect(serverFavorites?.get(a.id)?.calories).toBe(10);
    expect(serverFavorites?.has(b.id)).toBe(false);
  });
});

describe("coupure réseau pendant la synchronisation + retry", () => {
  it("un échec réseau garde l'opération (status failed), et le retry suivant la termine", async () => {
    const repo = createOfflineRepository<FavoriteRow>("nutrition_favorites");
    const created = await repo.create(USER_A, { name: "Riz", meal: "dejeuner", calories: 300 });

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(first.succeeded).toBe(0);

    const opsAfterFailure = await listAllOperations(USER_A);
    expect(opsAfterFailure).toHaveLength(1);
    expect(opsAfterFailure[0].status).toBe("failed");
    expect(opsAfterFailure[0].retryCount).toBe(1);
    // Rien n'a été perdu côté serveur (jamais écrit).
    expect(serverStore.get("nutrition_favorites")?.has(created.id)).toBeFalsy();

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(await listAllOperations(USER_A)).toEqual([]);
    expect(serverStore.get("nutrition_favorites")?.get(created.id)?.name).toBe("Riz");
  });

  it("idempotence : un create rejoué après coupure ne crée pas de doublon (upsert par id)", async () => {
    const repo = createOfflineRepository<FavoriteRow>("nutrition_favorites");
    const created = await repo.create(USER_A, { name: "Pomme", meal: "collation", calories: 80 });

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A); // échoue, laisse l'opération en attente
    await processSyncQueue(USER_A); // retry, réussit

    const serverFavorites = serverStore.get("nutrition_favorites");
    expect(serverFavorites?.size).toBe(1);
    expect(serverFavorites?.get(created.id)?.name).toBe("Pomme");
  });
});

describe("conflit local/serveur", () => {
  async function seedSyncedFavorite(userId: string) {
    const repo = createOfflineRepository<FavoriteRow>("nutrition_favorites");
    const created = await repo.create(userId, { name: "Pâtes", meal: "diner", calories: 400 });
    await processSyncQueue(userId); // synchronisé, entité locale "synced"
    return { repo, created };
  }

  it("détecte un conflit quand le serveur a changé ET la donnée locale aussi, sans écraser silencieusement", async () => {
    const { repo, created } = await seedSyncedFavorite(USER_A);

    // Modification "ailleurs" (autre appareil) directement côté serveur simulé.
    const serverRow = serverStore.get("nutrition_favorites")!.get(created.id)!;
    serverStore.get("nutrition_favorites")!.set(created.id, {
      ...serverRow,
      calories: 999,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    // Modification locale concurrente.
    await repo.update(created.id, USER_A, { calories: 450 });

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(1);
    expect(result.succeeded).toBe(0);

    const conflicts = await listConflicts(USER_A);
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].localData as FavoriteRow).calories).toBe(450);
    expect((conflicts[0].serverData as FavoriteRow).calories).toBe(999);

    // Le serveur n'a pas été écrasé par erreur.
    expect(serverStore.get("nutrition_favorites")!.get(created.id)!.calories).toBe(999);
  });

  it('résolution "Garder ma version" : ré-envoie la version locale et écrase le serveur', async () => {
    const { repo, created } = await seedSyncedFavorite(USER_A);
    const serverRow = serverStore.get("nutrition_favorites")!.get(created.id)!;
    serverStore.get("nutrition_favorites")!.set(created.id, {
      ...serverRow,
      calories: 999,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { calories: 450 });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-local");
    expect(await listConflicts(USER_A)).toEqual([]);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("nutrition_favorites")!.get(created.id)!.calories).toBe(450);
  });

  it('résolution "Garder la version serveur" : applique la version serveur en local, rien à renvoyer', async () => {
    const { repo, created } = await seedSyncedFavorite(USER_A);
    const serverRow = serverStore.get("nutrition_favorites")!.get(created.id)!;
    serverStore.get("nutrition_favorites")!.set(created.id, {
      ...serverRow,
      calories: 999,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { calories: 450 });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-server");
    expect(await listConflicts(USER_A)).toEqual([]);

    const local = await repo.get(created.id);
    expect(local?.calories).toBe(999);
    // Pas de nouvelle opération à synchroniser.
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("changement de compte", () => {
  it("purge le store offline par userId : aucune fuite de données entre comptes", async () => {
    const repo = createOfflineRepository<FavoriteRow>("nutrition_favorites");
    await repo.create(USER_A, { name: "Compte A", meal: null, calories: 1 });
    await repo.create(USER_B, { name: "Compte B", meal: null, calories: 2 });

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

describe("généricité de la couche repository (autre table, ex. recettes)", () => {
  interface RecipeRow extends Row {
    user_id: string;
    name: string;
  }

  it("fonctionne pour n'importe quelle table sans dépendance spécifique", async () => {
    const repo = createOfflineRepository<RecipeRow>("recipes_test_table", "recipes_test_table");
    const created = await repo.create(USER_A, { name: "Curry" });
    expect(await repo.list(USER_A)).toHaveLength(1);
    await processSyncQueue(USER_A);
    expect(serverStore.get("recipes_test_table")?.get(created.id)?.name).toBe("Curry");
  });
});
