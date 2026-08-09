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
 * `resolveCustomExerciseMuscles` (analyse IA des muscles pour un exercice
 * personnalisé) doit écrire `exercises.muscle_groups` via le repository
 * offline (`exercisesRepo`, même instance que `use-fitness.ts`) — jamais un
 * appel Supabase direct sur `exercises`, table déjà migrée vers
 * `createOfflineRepository`. Ce test vérifie que la mutation atterrit bien
 * en local (IndexedDB) ET dans la sync queue, et qu'aucun appel Supabase
 * direct n'est fait pour cette écriture précise.
 */

const AUTH_USER = { id: "user-exo-photos" };

const fromSpy = vi.fn((table: string) => {
  throw new Error(`Appel Supabase direct inattendu sur la table "${table}"`);
});

const functionsInvokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: AUTH_USER } })),
    },
    functions: {
      invoke: (...args: unknown[]) => functionsInvokeMock(...args),
    },
    from: (table: string) => fromSpy(table),
  },
}));

// Imports après le mock (obligatoire avec vi.mock hoisté).
import { resetOfflineDbForTests } from "@/lib/offline/db";
import { listAllOperations } from "@/lib/offline/syncQueue";
import { exercisesRepo } from "@/hooks/use-fitness";
import { resolveCustomExerciseMuscles } from "./useUserExercisePhotos";

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
  fromSpy.mockClear();
  functionsInvokeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveCustomExerciseMuscles — passe par le repository offline", () => {
  it("écrit muscle_groups en local et enfile une opération de sync, sans appel Supabase direct sur exercises", async () => {
    const exercise = await exercisesRepo.create(AUTH_USER.id, {
      workout_id: "workout-1",
      name: "Mouvement inventé maison",
      sets: null,
      reps: null,
      weight: null,
      image_path: null,
      exercise_reference_id: null,
      position: 0,
      notes: null,
      superset_group: null,
      muscle_groups: null,
    });
    // Une seule opération (le create) doit exister avant l'appel testé.
    expect(await listAllOperations(AUTH_USER.id)).toHaveLength(1);

    functionsInvokeMock.mockResolvedValue({
      data: {
        results: [{ name: exercise.name, muscles: ["biceps", "dos"] }],
      },
      error: null,
    });

    await resolveCustomExerciseMuscles([
      { id: exercise.id, name: exercise.name, muscle_groups: null },
    ]);

    // Aucun appel Supabase direct (`.from(...)`) n'a été fait pour cette écriture.
    expect(fromSpy).not.toHaveBeenCalled();

    const updated = await exercisesRepo.get(exercise.id);
    expect(updated?.muscle_groups).toEqual(["biceps", "dos"]);

    const ops = await listAllOperations(AUTH_USER.id);
    expect(ops).toHaveLength(1);
    expect(ops[0].table).toBe("exercises");
    expect(ops[0].recordLocalId).toBe(exercise.id);
  });

  it("n'écrit rien si l'exercice a déjà un mapping regex (rien à analyser)", async () => {
    await resolveCustomExerciseMuscles([
      { id: "some-id", name: "Développé couché", muscle_groups: null },
    ]);
    expect(functionsInvokeMock).not.toHaveBeenCalled();
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
