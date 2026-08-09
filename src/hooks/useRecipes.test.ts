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
 * Régression du bug production : "Offline update (recipes/<id>)" — une
 * recette importée Instagram (créée CÔTÉ SERVEUR par l'edge function
 * `recipe-import`, jamais passée par `recipesRepo.create()` ni par une
 * lecture qui l'aurait hydratée localement) faisait échouer le premier
 * `useUpdateRecipe()` (`RecipeImportSheet.saveToRecipes`) avec "entité
 * introuvable", alors que la donnée existe bien côté serveur et que
 * l'appareil est en ligne. `ensureRecipeHydrated` (src/hooks/useRecipes.ts)
 * comble ce trou avant tout `update()`.
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
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: Error | null }> => {
        if (opts.failNext) {
          opts.failNext = false;
          return { data: null, error: new Error("network down") };
        }
        if (idFilter) return { data: store.get(idFilter) ?? null, error: null };
        return { data: Array.from(store.values()), error: null };
      };

      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: string) {
          if (col === "id") idFilter = val;
          return builder;
        },
        maybeSingle: () => exec(),
        single: () => exec(),
      };
      return builder;
    },
  };
}

// `useRecipes.ts` accède à `supabase` dès son évaluation (`const supabase =
// supabaseTyped as any`) — comme les imports sont évalués avant le corps de
// CE fichier de test (sémantique ESM standard), un simple `const serverStore
// = new Map()` plus bas serait encore en zone morte temporelle au moment où
// le getter mocké se déclenche. `vi.hoisted` garantit une initialisation
// avant tout import, mock compris.
const { serverStore, fakeSupabaseOpts, networkState } = vi.hoisted(() => ({
  serverStore: new Map<string, Map<string, Row>>(),
  fakeSupabaseOpts: { failNext: false } as FakeSupabaseOptions,
  networkState: { online: true },
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase(serverStore, fakeSupabaseOpts);
  },
}));

vi.mock("@/lib/offline/networkStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/networkStatus")>();
  return { ...actual, getIsOnline: () => networkState.online };
});

// Imports après les mocks (obligatoire avec vi.mock hoisté).
import { resetOfflineDbForTests } from "@/lib/offline/db";
import { createOfflineRepository } from "@/lib/offline/repository";
import { listAllOperations } from "@/lib/offline/syncQueue";
import { ensureRecipeHydrated, type Recipe } from "./useRecipes";

const USER_A = "user-a";

function makeServerRecipe(id: string): Recipe {
  return {
    id,
    user_id: USER_A,
    name: "Bowl importé Instagram",
    servings: 2,
    prep_minutes: null,
    cook_minutes: null,
    instructions: null,
    image_path: null,
    tags: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source_kind: "instagram",
    source_url: "https://instagram.com/p/xyz",
    source_image_url: null,
    source_description: "légende originale",
    ai_summary: "résumé IA",
    source_author: "@chef",
    last_reanalyzed_at: null,
    reanalysis_count: 0,
    confidence: 0.9,
    notes: null,
    is_favorite: false,
    per_serving_calories: 450,
    per_serving_proteins: 30,
    per_serving_carbs: 40,
    per_serving_fats: 15,
    per_serving_fiber: 5,
  };
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
  networkState.online = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ensureRecipeHydrated — bug 'Offline update' sur une recette importée Instagram", () => {
  it("hydrate depuis Supabase une recette créée côté serveur, jamais vue localement (en ligne)", async () => {
    const id = "d8dd92a4-cd4a-480f-b578-6dc0f2349af2";
    serverStore.set("recipes", new Map([[id, makeServerRecipe(id) as unknown as Row]]));

    const repo = createOfflineRepository<Recipe>("recipes");
    expect(await repo.get(id)).toBeUndefined(); // reproduit l'état initial du bug

    await ensureRecipeHydrated(id, USER_A);

    const local = await repo.get(id);
    expect(local).toBeDefined();
    expect(local?.name).toBe("Bowl importé Instagram");
    expect(local?.source_kind).toBe("instagram");
  });

  it("plus aucune 'entité introuvable' : update() réussit juste après hydratation, comme dans RecipeImportSheet.saveToRecipes", async () => {
    const id = "d8dd92a4-cd4a-480f-b578-6dc0f2349af2";
    serverStore.set("recipes", new Map([[id, makeServerRecipe(id) as unknown as Row]]));
    const repo = createOfflineRepository<Recipe>("recipes");

    await ensureRecipeHydrated(id, USER_A);
    const updated = await repo.update(id, USER_A, { name: "Bowl retouché" });

    expect(updated.name).toBe("Bowl retouché");
    // L'opération de sync a bien été enfilée (rien perdu, comportement offline-first intact).
    expect(await listAllOperations(USER_A)).toHaveLength(1);
  });

  it("ne fait rien si la recette est déjà connue localement (cas normal, pas de lecture réseau superflue)", async () => {
    const repo = createOfflineRepository<Recipe>("recipes");
    const created = await repo.create(USER_A, {
      name: "Recette locale",
      servings: 1,
      is_favorite: false,
    } as never);
    const localId = created.id;

    // Aucune ligne serveur pour ce id : si ensureRecipeHydrated tentait une
    // lecture réseau, elle ne trouverait rien — la présence locale doit
    // suffire à l'éviter.
    await expect(ensureRecipeHydrated(localId, USER_A)).resolves.toBeUndefined();
    expect(await repo.get(localId)).toBeDefined();
  });

  it("hors connexion et jamais synchronisée : ne tente aucune lecture réseau, laisse update() échouer avec son message clair (comportement inchangé, pas un bug)", async () => {
    networkState.online = false;
    const id = "never-seen-offline";
    const repo = createOfflineRepository<Recipe>("recipes");

    await ensureRecipeHydrated(id, USER_A); // no-op : hors ligne, ne doit pas planter
    await expect(repo.update(id, USER_A, { name: "x" })).rejects.toThrow(/entité introuvable/);
  });

  it("erreur serveur pendant l'hydratation : ne plante pas, laisse update() échouer normalement ensuite", async () => {
    const id = "server-error-id";
    serverStore.set("recipes", new Map([[id, makeServerRecipe(id) as unknown as Row]]));
    fakeSupabaseOpts.failNext = true;

    await expect(ensureRecipeHydrated(id, USER_A)).resolves.toBeUndefined();
    const repo = createOfflineRepository<Recipe>("recipes");
    await expect(repo.update(id, USER_A, { name: "x" })).rejects.toThrow(/entité introuvable/);
  });
});
