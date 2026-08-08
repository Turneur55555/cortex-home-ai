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
 * Couverture offline-first du Journal Nutrition (`src/hooks/useNutritionData.ts`,
 * table `nutrition`) — même infra générique que
 * `src/lib/offline/offlineSync.test.ts` (nutrition_favorites), mêmes
 * primitives (`createOfflineRepository`, `processSyncQueue`,
 * `resolveConflict`, `purgeUserOfflineData`). Voir ce fichier pour le détail
 * du simulateur Supabase in-memory réutilisé ici.
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

interface NutritionRow extends Row {
  user_id: string;
  date: string;
  meal: string | null;
  name: string;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  recipe_id: string | null;
  created_at: string;
}

const USER_A = "user-a";
const USER_B = "user-b";

const nutritionRow = (overrides: Partial<NutritionRow> = {}) => ({
  date: "2026-08-08",
  meal: "dejeuner",
  name: "Poulet riz",
  calories: 500,
  proteins: 40,
  carbs: 60,
  fats: 10,
  recipe_id: null,
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

describe("Journal Nutrition — lecture/écriture hors connexion", () => {
  it("lecture hors connexion : journal déjà synchronisé reste visible", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const created = await repo.create(USER_A, nutritionRow());
    await processSyncQueue(USER_A); // simule un journal déjà synchronisé lors d'une session précédente

    const all = await repo.list(USER_A);
    const forDate = all.filter((r) => r.date === "2026-08-08");
    expect(forDate).toHaveLength(1);
    expect(forDate[0].id).toBe(created.id);
    expect(forDate[0].name).toBe("Poulet riz");
  });

  it("création hors connexion : visible immédiatement en local, rien envoyé au serveur", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const created = await repo.create(USER_A, nutritionRow({ name: "Yaourt", meal: "collation" }));
    expect(created.id).toBeTruthy();
    const list = await repo.list(USER_A);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Yaourt");
    expect(serverStore.get("nutrition")?.size ?? 0).toBe(0);
  });

  it("création hors connexion référençant une recette pas encore synchronisée : recipe_id local conservé sans résolution FK bloquante", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const localRecipeId = crypto.randomUUID(); // jamais synchronisée côté serveur
    const created = await repo.create(
      USER_A,
      nutritionRow({ name: "Curry (depuis recette)", recipe_id: localRecipeId }),
    );
    expect(created.recipe_id).toBe(localRecipeId);
    const fetched = await repo.get(created.id);
    expect(fetched?.recipe_id).toBe(localRecipeId);
  });

  it("modification hors connexion : quantités/macros patchées localement", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const created = await repo.create(USER_A, nutritionRow({ calories: 500, proteins: 40 }));
    const updated = await repo.update(created.id, USER_A, { calories: 620, proteins: 48 });
    expect(updated.calories).toBe(620);
    expect(updated.proteins).toBe(48);
    const fetched = await repo.get(created.id);
    expect(fetched?.calories).toBe(620);
  });

  it("suppression hors connexion : disparaît de list() (tombstone local)", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const created = await repo.create(USER_A, nutritionRow({ name: "Barre céréale" }));
    await repo.remove(created.id, USER_A);
    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.get(created.id)).toBeUndefined();
  });

  it("plusieurs opérations enchaînées avant reconnexion : toutes reflétées en local", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const a = await repo.create(USER_A, nutritionRow({ name: "A", meal: "petit-dej" }));
    const b = await repo.create(USER_A, nutritionRow({ name: "B", meal: "dejeuner" }));
    await repo.update(a.id, USER_A, { calories: 300 });
    await repo.remove(b.id, USER_A);
    await repo.create(USER_A, nutritionRow({ name: "C", meal: "diner" }));

    const list = await repo.list(USER_A);
    expect(list.map((r) => r.name).sort()).toEqual(["A", "C"]);
    expect(list.find((r) => r.id === a.id)?.calories).toBe(300);
  });
});

describe("Journal Nutrition — synchronisation au retour réseau", () => {
  it("une création locale est poussée vers le serveur (mock) au processSyncQueue", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const created = await repo.create(USER_A, nutritionRow({ name: "Oeufs" }));

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("nutrition")?.has(created.id)).toBe(true);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });

  it("plusieurs opérations enchaînées avant retour réseau sont toutes rejouées en ordre", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const a = await repo.create(USER_A, nutritionRow({ name: "A", calories: 1 }));
    const b = await repo.create(USER_A, nutritionRow({ name: "B", calories: 2 }));
    await repo.update(a.id, USER_A, { calories: 10 });
    await repo.remove(b.id, USER_A);

    const opsBefore = await listAllOperations(USER_A);
    // create(a) fusionné avec l'update(a) => 1 op pour a ; create(b) +
    // remove(b) s'annulent avant tout envoi => 0 op pour b.
    expect(opsBefore).toHaveLength(1);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    const server = serverStore.get("nutrition");
    expect(server?.get(a.id)?.calories).toBe(10);
    expect(server?.has(b.id)).toBe(false);
  });
});

describe("Journal Nutrition — coupure réseau pendant la synchronisation + retry", () => {
  it("un échec réseau garde l'opération (status failed), et le retry suivant la termine", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const created = await repo.create(USER_A, nutritionRow({ name: "Riz", calories: 300 }));

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(first.succeeded).toBe(0);

    const opsAfterFailure = await listAllOperations(USER_A);
    expect(opsAfterFailure).toHaveLength(1);
    expect(opsAfterFailure[0].status).toBe("failed");
    expect(opsAfterFailure[0].retryCount).toBe(1);
    expect(serverStore.get("nutrition")?.has(created.id)).toBeFalsy();

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(await listAllOperations(USER_A)).toEqual([]);
    expect(serverStore.get("nutrition")?.get(created.id)?.name).toBe("Riz");
  });

  it("idempotence : un create rejoué après coupure ne crée pas de doublon (upsert par id)", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const created = await repo.create(USER_A, nutritionRow({ name: "Pomme", calories: 80 }));

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A); // échoue, laisse l'opération en attente
    await processSyncQueue(USER_A); // retry, réussit

    const server = serverStore.get("nutrition");
    expect(server?.size).toBe(1);
    expect(server?.get(created.id)?.name).toBe("Pomme");
  });
});

describe("Journal Nutrition — conflit local/serveur", () => {
  async function seedSyncedEntry(userId: string) {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    const created = await repo.create(userId, nutritionRow({ name: "Pâtes", calories: 400 }));
    await processSyncQueue(userId); // synchronisé, entité locale "synced"
    return { repo, created };
  }

  it("détecte un conflit quand le serveur a changé ET la donnée locale aussi, sans écraser silencieusement", async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);

    // Modification "ailleurs" (autre appareil) directement côté serveur simulé.
    const serverRow = serverStore.get("nutrition")!.get(created.id)!;
    serverStore.get("nutrition")!.set(created.id, {
      ...serverRow,
      calories: 999,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    // Modification locale concurrente (ex: ajustement de quantité).
    await repo.update(created.id, USER_A, { calories: 450 });

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(1);
    expect(result.succeeded).toBe(0);

    const conflicts = await listConflicts(USER_A);
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].localData as NutritionRow).calories).toBe(450);
    expect((conflicts[0].serverData as NutritionRow).calories).toBe(999);

    // Le serveur n'a pas été écrasé par erreur.
    expect(serverStore.get("nutrition")!.get(created.id)!.calories).toBe(999);
  });

  it('résolution "Garder ma version" : ré-envoie la version locale et écrase le serveur', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("nutrition")!.get(created.id)!;
    serverStore.get("nutrition")!.set(created.id, {
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
    expect(serverStore.get("nutrition")!.get(created.id)!.calories).toBe(450);
  });

  it('résolution "Garder la version serveur" : applique la version serveur en local, rien à renvoyer', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("nutrition")!.get(created.id)!;
    serverStore.get("nutrition")!.set(created.id, {
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
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("Journal Nutrition — changement de compte", () => {
  it("purge le store offline par userId : aucune fuite de journal entre comptes", async () => {
    const repo = createOfflineRepository<NutritionRow>("nutrition");
    await repo.create(USER_A, nutritionRow({ name: "Repas compte A" }));
    await repo.create(USER_B, nutritionRow({ name: "Repas compte B" }));

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
