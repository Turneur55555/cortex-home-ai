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
 * Couverture offline-first de la vague V3 : Meal Plans (`src/hooks/useMealPlan.ts`,
 * table `meal_plans`), lecture/suppression de Saved Meals
 * (`src/hooks/use-saved-meals.ts`, table `saved_meals`) et Custom Foods
 * (`src/hooks/useCustomFoods.ts`/`NutritionSheet.tsx`, table
 * `food_custom_foods`) — même infra générique que
 * `nutritionOffline.test.ts`/`shoppingListOffline.test.ts`, mêmes primitives
 * (`createOfflineRepository`, `processSyncQueue`, `resolveConflict`,
 * `purgeUserOfflineData`). Voir `offlineSync.test.ts` pour le détail du
 * simulateur Supabase in-memory réutilisé ici.
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

// ─── Meal Plans (table `meal_plans`) ───────────────────────────────────────

interface MealPlanRow extends Row {
  user_id: string;
  date: string;
  meal: string;
  recipe_id: string | null;
  custom_name: string | null;
  servings: number;
  sort_order: number;
  created_at: string;
}

const mealPlanRow = (overrides: Partial<MealPlanRow> = {}) => ({
  date: "2026-08-08",
  meal: "dejeuner",
  recipe_id: null,
  custom_name: "Poulet riz",
  servings: 1,
  sort_order: 0,
  ...overrides,
});

describe("Meal Plans — lecture/écriture hors connexion", () => {
  it("lecture hors connexion : planning déjà synchronisé reste visible", async () => {
    const repo = createOfflineRepository<MealPlanRow>("meal_plans");
    const created = await repo.create(USER_A, mealPlanRow());
    await processSyncQueue(USER_A);

    const all = await repo.list(USER_A);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].custom_name).toBe("Poulet riz");
  });

  it("création hors connexion : visible immédiatement en local, rien envoyé au serveur", async () => {
    const repo = createOfflineRepository<MealPlanRow>("meal_plans");
    const created = await repo.create(USER_A, mealPlanRow({ custom_name: "Salade" }));
    expect(created.id).toBeTruthy();
    const list = await repo.list(USER_A);
    expect(list).toHaveLength(1);
    expect(list[0].custom_name).toBe("Salade");
    expect(serverStore.get("meal_plans")?.size ?? 0).toBe(0);
  });

  it("suppression hors connexion : disparaît de list() (tombstone local)", async () => {
    const repo = createOfflineRepository<MealPlanRow>("meal_plans");
    const created = await repo.create(USER_A, mealPlanRow({ custom_name: "Omelette" }));
    await repo.remove(created.id, USER_A);
    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.get(created.id)).toBeUndefined();
  });

  it("plusieurs opérations enchaînées avant reconnexion : toutes reflétées en local", async () => {
    const repo = createOfflineRepository<MealPlanRow>("meal_plans");
    const a = await repo.create(USER_A, mealPlanRow({ custom_name: "A", date: "2026-08-08" }));
    const b = await repo.create(USER_A, mealPlanRow({ custom_name: "B", date: "2026-08-09" }));
    await repo.remove(b.id, USER_A);
    await repo.create(USER_A, mealPlanRow({ custom_name: "C", date: "2026-08-10" }));

    const list = await repo.list(USER_A);
    expect(list.map((r) => r.custom_name).sort()).toEqual(["A", "C"]);
  });
});

describe("Meal Plans — synchronisation au retour réseau", () => {
  it("une création locale est poussée vers le serveur (mock) au processSyncQueue", async () => {
    const repo = createOfflineRepository<MealPlanRow>("meal_plans");
    const created = await repo.create(USER_A, mealPlanRow({ custom_name: "Tacos" }));

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("meal_plans")?.has(created.id)).toBe(true);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });

  it("plusieurs opérations enchaînées avant retour réseau sont toutes rejouées en ordre", async () => {
    const repo = createOfflineRepository<MealPlanRow>("meal_plans");
    const a = await repo.create(USER_A, mealPlanRow({ custom_name: "A" }));
    const b = await repo.create(USER_A, mealPlanRow({ custom_name: "B" }));
    await repo.remove(b.id, USER_A);

    const opsBefore = await listAllOperations(USER_A);
    // create(b) + remove(b) s'annulent avant tout envoi => seule la création de a reste.
    expect(opsBefore).toHaveLength(1);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    const server = serverStore.get("meal_plans");
    expect(server?.has(a.id)).toBe(true);
    expect(server?.has(b.id)).toBe(false);
  });
});

describe("Meal Plans — coupure réseau pendant la synchronisation + retry", () => {
  it("un échec réseau garde l'opération (status failed), et le retry suivant la termine", async () => {
    const repo = createOfflineRepository<MealPlanRow>("meal_plans");
    const created = await repo.create(USER_A, mealPlanRow({ custom_name: "Riz sauté" }));

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(first.succeeded).toBe(0);

    const opsAfterFailure = await listAllOperations(USER_A);
    expect(opsAfterFailure).toHaveLength(1);
    expect(opsAfterFailure[0].status).toBe("failed");
    expect(serverStore.get("meal_plans")?.has(created.id)).toBeFalsy();

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(await listAllOperations(USER_A)).toEqual([]);
    expect(serverStore.get("meal_plans")?.get(created.id)?.custom_name).toBe("Riz sauté");
  });

  it("idempotence : un create rejoué après coupure ne crée pas de doublon (upsert par id)", async () => {
    const repo = createOfflineRepository<MealPlanRow>("meal_plans");
    const created = await repo.create(USER_A, mealPlanRow({ custom_name: "Curry" }));

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A);
    await processSyncQueue(USER_A);

    const server = serverStore.get("meal_plans");
    expect(server?.size).toBe(1);
    expect(server?.get(created.id)?.custom_name).toBe("Curry");
  });
});

describe("Meal Plans — conflit local/serveur", () => {
  async function seedSyncedEntry(userId: string) {
    const repo = createOfflineRepository<MealPlanRow>("meal_plans");
    const created = await repo.create(userId, mealPlanRow({ custom_name: "Pâtes", servings: 1 }));
    await processSyncQueue(userId);
    return { repo, created };
  }

  it("détecte un conflit quand le serveur a changé ET la donnée locale aussi, sans écraser silencieusement", async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);

    const serverRow = serverStore.get("meal_plans")!.get(created.id)!;
    serverStore.get("meal_plans")!.set(created.id, {
      ...serverRow,
      servings: 4,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    await repo.update(created.id, USER_A, { servings: 2 });

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(1);
    expect(result.succeeded).toBe(0);

    const conflicts = await listConflicts(USER_A);
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].localData as MealPlanRow).servings).toBe(2);
    expect((conflicts[0].serverData as MealPlanRow).servings).toBe(4);
    expect(serverStore.get("meal_plans")!.get(created.id)!.servings).toBe(4);
  });

  it('résolution "Garder ma version" : ré-envoie la version locale et écrase le serveur', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("meal_plans")!.get(created.id)!;
    serverStore.get("meal_plans")!.set(created.id, {
      ...serverRow,
      servings: 4,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { servings: 2 });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-local");
    expect(await listConflicts(USER_A)).toEqual([]);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("meal_plans")!.get(created.id)!.servings).toBe(2);
  });

  it('résolution "Garder la version serveur" : applique la version serveur en local, rien à renvoyer', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("meal_plans")!.get(created.id)!;
    serverStore.get("meal_plans")!.set(created.id, {
      ...serverRow,
      servings: 4,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { servings: 2 });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-server");
    expect(await listConflicts(USER_A)).toEqual([]);

    const local = await repo.get(created.id);
    expect(local?.servings).toBe(4);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("Meal Plans — changement de compte", () => {
  it("purge le store offline par userId : aucune fuite de planning entre comptes", async () => {
    const repo = createOfflineRepository<MealPlanRow>("meal_plans");
    await repo.create(USER_A, mealPlanRow({ custom_name: "Repas compte A" }));
    await repo.create(USER_B, mealPlanRow({ custom_name: "Repas compte B" }));

    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(await repo.list(USER_B)).toHaveLength(1);

    await purgeUserOfflineData(USER_A);

    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.list(USER_B)).toHaveLength(1);

    const db = await getOfflineDb();
    const remainingOpsA = await db.getAllFromIndex("syncQueue", "by-user", USER_A);
    expect(remainingOpsA).toEqual([]);
  });
});

// ─── Saved Meals lecture/suppression (table `saved_meals`) ────────────────

interface SavedMealRow extends Row {
  user_id: string;
  name: string;
  meal: string | null;
  sort_order: number;
  created_at: string;
}

const savedMealRow = (overrides: Partial<SavedMealRow> = {}) => ({
  name: "Petit-déj protéiné",
  meal: "petit-dej",
  sort_order: 0,
  ...overrides,
});

describe("Saved Meals — lecture/suppression hors connexion", () => {
  it("lecture hors connexion : repas enregistré déjà synchronisé reste visible", async () => {
    const repo = createOfflineRepository<SavedMealRow>("saved_meals");
    const created = await repo.create(USER_A, savedMealRow());
    await processSyncQueue(USER_A);

    const all = await repo.list(USER_A);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].name).toBe("Petit-déj protéiné");
  });

  it("création hors connexion : visible immédiatement en local, rien envoyé au serveur", async () => {
    const repo = createOfflineRepository<SavedMealRow>("saved_meals");
    const created = await repo.create(USER_A, savedMealRow({ name: "Snack" }));
    expect(created.id).toBeTruthy();
    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(serverStore.get("saved_meals")?.size ?? 0).toBe(0);
  });

  it("suppression hors connexion : disparaît de list() (tombstone local)", async () => {
    const repo = createOfflineRepository<SavedMealRow>("saved_meals");
    const created = await repo.create(USER_A, savedMealRow({ name: "Bol de riz" }));
    await repo.remove(created.id, USER_A);
    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.get(created.id)).toBeUndefined();
  });

  it("plusieurs opérations enchaînées avant reconnexion : toutes reflétées en local", async () => {
    const repo = createOfflineRepository<SavedMealRow>("saved_meals");
    const a = await repo.create(USER_A, savedMealRow({ name: "A" }));
    const b = await repo.create(USER_A, savedMealRow({ name: "B" }));
    await repo.remove(b.id, USER_A);
    await repo.create(USER_A, savedMealRow({ name: "C" }));

    const list = await repo.list(USER_A);
    expect(list.map((r) => r.name).sort()).toEqual(["A", "C"]);
  });
});

describe("Saved Meals — synchronisation au retour réseau", () => {
  it("une suppression locale est poussée vers le serveur (mock) au processSyncQueue", async () => {
    const repo = createOfflineRepository<SavedMealRow>("saved_meals");
    const created = await repo.create(USER_A, savedMealRow({ name: "Wrap" }));
    await processSyncQueue(USER_A); // synchronisé une première fois

    await repo.remove(created.id, USER_A);
    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("saved_meals")?.has(created.id)).toBe(false);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("Saved Meals — coupure réseau pendant la synchronisation + retry", () => {
  it("un échec réseau garde l'opération (status failed), et le retry suivant la termine", async () => {
    const repo = createOfflineRepository<SavedMealRow>("saved_meals");
    const created = await repo.create(USER_A, savedMealRow({ name: "Buddha bowl" }));

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(first.succeeded).toBe(0);
    expect(serverStore.get("saved_meals")?.has(created.id)).toBeFalsy();

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(serverStore.get("saved_meals")?.get(created.id)?.name).toBe("Buddha bowl");
  });

  it("idempotence : un create rejoué après coupure ne crée pas de doublon (upsert par id)", async () => {
    const repo = createOfflineRepository<SavedMealRow>("saved_meals");
    const created = await repo.create(USER_A, savedMealRow({ name: "Poke bowl" }));

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A);
    await processSyncQueue(USER_A);

    const server = serverStore.get("saved_meals");
    expect(server?.size).toBe(1);
    expect(server?.get(created.id)?.name).toBe("Poke bowl");
  });
});

describe("Saved Meals — conflit local/serveur", () => {
  it("détecte un conflit quand le serveur a changé ET la donnée locale aussi (suppression locale vs modification serveur)", async () => {
    const repo = createOfflineRepository<SavedMealRow>("saved_meals");
    const created = await repo.create(USER_A, savedMealRow({ name: "Original" }));
    await processSyncQueue(USER_A);

    const serverRow = serverStore.get("saved_meals")!.get(created.id)!;
    serverStore.get("saved_meals")!.set(created.id, {
      ...serverRow,
      name: "Renommé ailleurs",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    await repo.update(created.id, USER_A, { name: "Renommé en local" });

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(1);

    const [conflict] = await listConflicts(USER_A);
    expect((conflict.localData as SavedMealRow).name).toBe("Renommé en local");
    expect((conflict.serverData as SavedMealRow).name).toBe("Renommé ailleurs");

    await resolveConflict(conflict.id, "keep-server");
    const local = await repo.get(created.id);
    expect(local?.name).toBe("Renommé ailleurs");
  });
});

describe("Saved Meals — changement de compte", () => {
  it("purge le store offline par userId : aucune fuite de repas enregistré entre comptes", async () => {
    const repo = createOfflineRepository<SavedMealRow>("saved_meals");
    await repo.create(USER_A, savedMealRow({ name: "Repas compte A" }));
    await repo.create(USER_B, savedMealRow({ name: "Repas compte B" }));

    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(await repo.list(USER_B)).toHaveLength(1);

    await purgeUserOfflineData(USER_A);

    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.list(USER_B)).toHaveLength(1);
  });
});

// ─── Custom Foods (table `food_custom_foods`) ──────────────────────────────

interface CustomFoodRow extends Row {
  user_id: string;
  food_id: string | null;
  name: string;
  brand: string | null;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  default_serving_grams: number | null;
  created_at: string;
}

const customFoodRow = (overrides: Partial<CustomFoodRow> = {}) => ({
  food_id: null,
  name: "Yaourt maison",
  brand: null,
  calories: 60,
  proteins: 5,
  carbs: 4,
  fats: 2,
  default_serving_grams: null,
  ...overrides,
});

describe("Custom Foods — lecture/écriture hors connexion", () => {
  it("lecture hors connexion : aliment perso déjà synchronisé reste visible", async () => {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    const created = await repo.create(USER_A, customFoodRow());
    await processSyncQueue(USER_A);

    const all = await repo.list(USER_A);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].name).toBe("Yaourt maison");
  });

  it("création hors connexion : visible immédiatement en local, rien envoyé au serveur", async () => {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    const created = await repo.create(USER_A, customFoodRow({ name: "Barre maison" }));
    expect(created.id).toBeTruthy();
    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(serverStore.get("food_custom_foods")?.size ?? 0).toBe(0);
  });

  it("mise à jour hors connexion (upsert applicatif : trouver par nom puis update)", async () => {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    const created = await repo.create(USER_A, customFoodRow({ name: "Smoothie", calories: 100 }));

    // Reproduit la logique de `NutritionSheet.saveCustomFood` : recherche par
    // nom normalisé avant update plutôt que création d'un doublon.
    const existing = await repo.list(USER_A);
    const match = existing.find((r) => r.name === "Smoothie");
    expect(match).toBeDefined();
    const updated = await repo.update(match!.id, USER_A, { calories: 120 });

    expect(updated.calories).toBe(120);
    expect(await repo.list(USER_A)).toHaveLength(1);
  });

  it("suppression hors connexion : disparaît de list() (tombstone local)", async () => {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    const created = await repo.create(USER_A, customFoodRow({ name: "Compote" }));
    await repo.remove(created.id, USER_A);
    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.get(created.id)).toBeUndefined();
  });

  it("plusieurs opérations enchaînées avant reconnexion : toutes reflétées en local", async () => {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    const a = await repo.create(USER_A, customFoodRow({ name: "A" }));
    const b = await repo.create(USER_A, customFoodRow({ name: "B" }));
    await repo.update(a.id, USER_A, { calories: 200 });
    await repo.remove(b.id, USER_A);
    await repo.create(USER_A, customFoodRow({ name: "C" }));

    const list = await repo.list(USER_A);
    expect(list.map((r) => r.name).sort()).toEqual(["A", "C"]);
    expect(list.find((r) => r.id === a.id)?.calories).toBe(200);
  });
});

describe("Custom Foods — synchronisation au retour réseau", () => {
  it("une création locale est poussée vers le serveur (mock) au processSyncQueue", async () => {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    const created = await repo.create(USER_A, customFoodRow({ name: "Muesli maison" }));

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("food_custom_foods")?.has(created.id)).toBe(true);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });

  it("plusieurs opérations enchaînées avant retour réseau sont toutes rejouées en ordre", async () => {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    const a = await repo.create(USER_A, customFoodRow({ name: "A", calories: 1 }));
    const b = await repo.create(USER_A, customFoodRow({ name: "B", calories: 2 }));
    await repo.update(a.id, USER_A, { calories: 10 });
    await repo.remove(b.id, USER_A);

    const opsBefore = await listAllOperations(USER_A);
    expect(opsBefore).toHaveLength(1);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    const server = serverStore.get("food_custom_foods");
    expect(server?.get(a.id)?.calories).toBe(10);
    expect(server?.has(b.id)).toBe(false);
  });
});

describe("Custom Foods — coupure réseau pendant la synchronisation + retry", () => {
  it("un échec réseau garde l'opération (status failed), et le retry suivant la termine", async () => {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    const created = await repo.create(USER_A, customFoodRow({ name: "Granola" }));

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(first.succeeded).toBe(0);

    const opsAfterFailure = await listAllOperations(USER_A);
    expect(opsAfterFailure).toHaveLength(1);
    expect(opsAfterFailure[0].status).toBe("failed");
    expect(serverStore.get("food_custom_foods")?.has(created.id)).toBeFalsy();

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(await listAllOperations(USER_A)).toEqual([]);
    expect(serverStore.get("food_custom_foods")?.get(created.id)?.name).toBe("Granola");
  });

  it("idempotence : un create rejoué après coupure ne crée pas de doublon (upsert par id)", async () => {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    const created = await repo.create(USER_A, customFoodRow({ name: "Pancakes" }));

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A);
    await processSyncQueue(USER_A);

    const server = serverStore.get("food_custom_foods");
    expect(server?.size).toBe(1);
    expect(server?.get(created.id)?.name).toBe("Pancakes");
  });
});

describe("Custom Foods — conflit local/serveur", () => {
  async function seedSyncedEntry(userId: string) {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    const created = await repo.create(userId, customFoodRow({ name: "Houmous", calories: 150 }));
    await processSyncQueue(userId);
    return { repo, created };
  }

  it("détecte un conflit quand le serveur a changé ET la donnée locale aussi, sans écraser silencieusement", async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);

    const serverRow = serverStore.get("food_custom_foods")!.get(created.id)!;
    serverStore.get("food_custom_foods")!.set(created.id, {
      ...serverRow,
      calories: 999,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    await repo.update(created.id, USER_A, { calories: 160 });

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(1);
    expect(result.succeeded).toBe(0);

    const conflicts = await listConflicts(USER_A);
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].localData as CustomFoodRow).calories).toBe(160);
    expect((conflicts[0].serverData as CustomFoodRow).calories).toBe(999);
    expect(serverStore.get("food_custom_foods")!.get(created.id)!.calories).toBe(999);
  });

  it('résolution "Garder ma version" : ré-envoie la version locale et écrase le serveur', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("food_custom_foods")!.get(created.id)!;
    serverStore.get("food_custom_foods")!.set(created.id, {
      ...serverRow,
      calories: 999,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { calories: 160 });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-local");
    expect(await listConflicts(USER_A)).toEqual([]);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("food_custom_foods")!.get(created.id)!.calories).toBe(160);
  });

  it('résolution "Garder la version serveur" : applique la version serveur en local, rien à renvoyer', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("food_custom_foods")!.get(created.id)!;
    serverStore.get("food_custom_foods")!.set(created.id, {
      ...serverRow,
      calories: 999,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { calories: 160 });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-server");
    expect(await listConflicts(USER_A)).toEqual([]);

    const local = await repo.get(created.id);
    expect(local?.calories).toBe(999);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("Custom Foods — changement de compte", () => {
  it("purge le store offline par userId : aucune fuite d'aliment perso entre comptes", async () => {
    const repo = createOfflineRepository<CustomFoodRow>("food_custom_foods");
    await repo.create(USER_A, customFoodRow({ name: "Aliment compte A" }));
    await repo.create(USER_B, customFoodRow({ name: "Aliment compte B" }));

    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(await repo.list(USER_B)).toHaveLength(1);

    await purgeUserOfflineData(USER_A);

    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.list(USER_B)).toHaveLength(1);

    const db = await getOfflineDb();
    const remainingOpsA = await db.getAllFromIndex("syncQueue", "by-user", USER_A);
    expect(remainingOpsA).toEqual([]);
  });
});
