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
 * Couverture offline-first des Collections de recettes
 * (`src/hooks/useCollections.ts`, table `recipe_collections`) — même infra
 * générique que les autres vagues (`createOfflineRepository`,
 * `processSyncQueue`, `resolveConflict`, `purgeUserOfflineData`). Voir
 * `offlineSync.test.ts` pour le détail du simulateur Supabase in-memory
 * réutilisé ici.
 *
 * `recipe_collection_recipes` (table de jointure, PAS de colonne `id`
 * propre) reste online-only par choix documenté dans `useCollections.ts` —
 * elle n'est donc pas couverte ici par les mêmes primitives offline (rien à
 * tester côté repository générique, elle n'y transite jamais).
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface FakeSupabaseOptions {
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

const USER_A = "user-a";
const USER_B = "user-b";

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
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── recipe_collections ─────────────────────────────────────────────────────

interface CollectionRow extends Row {
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
}

const DEFAULT_NAMES = ["Meal Prep", "Sèche", "Prise de masse", "Rapide", "À tester"];

const collectionRow = (overrides: Partial<CollectionRow> = {}) => ({
  name: "Ma collection",
  is_default: false,
  ...overrides,
});

/** Réplique la logique de seed idempotente de `useCollections.ts` (vérifie le LOCAL avant de semer). */
async function seedDefaultCollectionsIfEmpty(
  repo: ReturnType<typeof createOfflineRepository<CollectionRow>>,
  userId: string,
): Promise<void> {
  const local = await repo.list(userId);
  if (local.length > 0) return;
  for (const name of DEFAULT_NAMES) {
    await repo.create(userId, collectionRow({ name, is_default: true }));
  }
}

describe("Collections de recettes — lecture/écriture hors connexion", () => {
  it("lecture hors connexion : collection déjà synchronisée reste visible", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    const created = await repo.create(USER_A, collectionRow({ name: "Meal Prep" }));
    await processSyncQueue(USER_A);

    const all = await repo.list(USER_A);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].name).toBe("Meal Prep");
  });

  it("création hors connexion : visible immédiatement en local, rien envoyé au serveur", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    const created = await repo.create(USER_A, collectionRow({ name: "Batch cooking" }));
    expect(created.id).toBeTruthy();
    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(serverStore.get("recipe_collections")?.size ?? 0).toBe(0);
  });

  it("renommage hors connexion : reflété immédiatement en local", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    const created = await repo.create(USER_A, collectionRow({ name: "Brouillon" }));
    const updated = await repo.update(created.id, USER_A, { name: "Sèche" });
    expect(updated.name).toBe("Sèche");
    expect((await repo.get(created.id))?.name).toBe("Sèche");
  });

  it("suppression hors connexion : disparaît de list() (tombstone local)", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    const created = await repo.create(USER_A, collectionRow({ name: "À supprimer" }));
    await repo.remove(created.id, USER_A);
    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.get(created.id)).toBeUndefined();
  });
});

describe("Collections de recettes — seed des collections par défaut", () => {
  it("sème les 5 collections par défaut si aucune n'existe en local", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    await seedDefaultCollectionsIfEmpty(repo, USER_A);

    const all = await repo.list(USER_A);
    expect(all).toHaveLength(5);
    expect(all.map((c) => c.name).sort()).toEqual([...DEFAULT_NAMES].sort());
    expect(all.every((c) => c.is_default)).toBe(true);
  });

  it("idempotence : un second appel (ex. hors connexion) ne duplique pas les collections par défaut", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    await seedDefaultCollectionsIfEmpty(repo, USER_A);
    await seedDefaultCollectionsIfEmpty(repo, USER_A);
    await seedDefaultCollectionsIfEmpty(repo, USER_A);

    expect(await repo.list(USER_A)).toHaveLength(5);
  });

  it("ne sème rien si l'utilisateur a déjà au moins une collection locale (créée par l'utilisateur)", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    await repo.create(USER_A, collectionRow({ name: "Perso" }));
    await seedDefaultCollectionsIfEmpty(repo, USER_A);

    const all = await repo.list(USER_A);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Perso");
  });
});

describe("Collections de recettes — synchronisation au retour réseau", () => {
  it("une création locale est poussée vers le serveur (mock) au processSyncQueue", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    const created = await repo.create(USER_A, collectionRow({ name: "Prise de masse" }));

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("recipe_collections")?.has(created.id)).toBe(true);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });

  it("un renommage local est poussé vers le serveur au processSyncQueue", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    const created = await repo.create(USER_A, collectionRow({ name: "Avant" }));
    await processSyncQueue(USER_A);

    await repo.update(created.id, USER_A, { name: "Après" });
    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("recipe_collections")?.get(created.id)?.name).toBe("Après");
  });

  it("une suppression locale est poussée vers le serveur au processSyncQueue", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    const created = await repo.create(USER_A, collectionRow({ name: "Rapide" }));
    await processSyncQueue(USER_A);

    await repo.remove(created.id, USER_A);
    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("recipe_collections")?.has(created.id)).toBe(false);
  });
});

describe("Collections de recettes — coupure réseau pendant la synchronisation + retry", () => {
  it("un échec réseau garde l'opération (status failed), et le retry suivant la termine", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    const created = await repo.create(USER_A, collectionRow({ name: "À tester" }));

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(first.succeeded).toBe(0);

    const opsAfterFailure = await listAllOperations(USER_A);
    expect(opsAfterFailure).toHaveLength(1);
    expect(opsAfterFailure[0].status).toBe("failed");
    expect(serverStore.get("recipe_collections")?.has(created.id)).toBeFalsy();

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(await listAllOperations(USER_A)).toEqual([]);
    expect(serverStore.get("recipe_collections")?.get(created.id)?.name).toBe("À tester");
  });

  it("idempotence : un create rejoué après coupure ne crée pas de doublon (upsert par id)", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    const created = await repo.create(USER_A, collectionRow({ name: "Meal Prep" }));

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A);
    await processSyncQueue(USER_A);

    const server = serverStore.get("recipe_collections");
    expect(server?.size).toBe(1);
    expect(server?.get(created.id)?.name).toBe("Meal Prep");
  });
});

describe("Collections de recettes — conflit local/serveur", () => {
  async function seedSyncedEntry(userId: string) {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    const created = await repo.create(userId, collectionRow({ name: "Sèche" }));
    await processSyncQueue(userId);
    return { repo, created };
  }

  it("détecte un conflit quand le serveur a changé ET la donnée locale aussi, sans écraser silencieusement", async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);

    const serverRow = serverStore.get("recipe_collections")!.get(created.id)!;
    serverStore.get("recipe_collections")!.set(created.id, {
      ...serverRow,
      name: "Sèche (renommée serveur)",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    await repo.update(created.id, USER_A, { name: "Sèche (renommée local)" });

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(1);
    expect(result.succeeded).toBe(0);

    const conflicts = await listConflicts(USER_A);
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].localData as CollectionRow).name).toBe("Sèche (renommée local)");
    expect((conflicts[0].serverData as CollectionRow).name).toBe("Sèche (renommée serveur)");
  });

  it('résolution "Garder ma version" : ré-envoie la version locale et écrase le serveur', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("recipe_collections")!.get(created.id)!;
    serverStore.get("recipe_collections")!.set(created.id, {
      ...serverRow,
      name: "Version serveur",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { name: "Version locale" });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-local");
    expect(await listConflicts(USER_A)).toEqual([]);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("recipe_collections")!.get(created.id)!.name).toBe("Version locale");
  });

  it('résolution "Garder la version serveur" : applique la version serveur en local, rien à renvoyer', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("recipe_collections")!.get(created.id)!;
    serverStore.get("recipe_collections")!.set(created.id, {
      ...serverRow,
      name: "Version serveur",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { name: "Version locale" });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-server");
    expect(await listConflicts(USER_A)).toEqual([]);

    const local = await repo.get(created.id);
    expect(local?.name).toBe("Version serveur");
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("Collections de recettes — changement de compte", () => {
  it("purge le store offline par userId : aucune fuite de collection entre comptes", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    await repo.create(USER_A, collectionRow({ name: "Collection compte A" }));
    await repo.create(USER_B, collectionRow({ name: "Collection compte B" }));

    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(await repo.list(USER_B)).toHaveLength(1);

    await purgeUserOfflineData(USER_A);

    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.list(USER_B)).toHaveLength(1);

    const db = await getOfflineDb();
    const remainingOpsA = await db.getAllFromIndex("syncQueue", "by-user", USER_A);
    expect(remainingOpsA).toEqual([]);
  });

  it("le seed par défaut ne fuite pas entre comptes : chaque compte sème ses propres collections", async () => {
    const repo = createOfflineRepository<CollectionRow>("recipe_collections");
    await seedDefaultCollectionsIfEmpty(repo, USER_A);
    await seedDefaultCollectionsIfEmpty(repo, USER_B);

    expect(await repo.list(USER_A)).toHaveLength(5);
    expect(await repo.list(USER_B)).toHaveLength(5);
  });
});
