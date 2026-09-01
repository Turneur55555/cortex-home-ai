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
 * CHANTIER 4 — MAJ-04. Compte les LECTURES SERVEUR réellement déclenchées par
 * `refreshWorkoutsFromServer` dans les scénarios de séance, et fixe le
 * comportement attendu après ce chantier.
 *
 * Mesure AVANT ce chantier (même scénarios, code de `main`) :
 *   - montage d'une séance active : 4 queries montées (useWorkouts,
 *     useActiveWorkout, useActiveGenericWorkout, useActiveWorkoutSegments)
 *     × 4 tables = 16 lectures ;
 *   - validation d'UNE série : invalidation de la clé séance active → 1
 *     refetch → 4 lectures ; 10 séries = 40 lectures ;
 *   - clôture de séance : invalidation du préfixe `fitness` → 4 refetch
 *     → 16 lectures.
 *
 * Après : 4 lectures par aller-retour réellement utile (montage, retour du
 * réseau, changement de compte), 0 pour les refetch redondants. La lecture du
 * store local, elle, reste faite à CHAQUE appel — c'est ce qui garantit
 * qu'aucune donnée n'est perdue (cf. `sessionRewardOffline.test.ts` et
 * `fitnessCoreOffline.test.ts` pour l'intégrité fonctionnelle).
 */

type Row = Record<string, unknown> & { id: string };

const reads: Record<string, number> = {};
let online = true;

function createCountingSupabase() {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        then(resolve: (v: unknown) => void) {
          reads[table] = (reads[table] ?? 0) + 1;
          resolve({ data: [] as Row[], error: null });
        },
      };
      return builder;
    },
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createCountingSupabase();
  },
}));

vi.mock("@/lib/offline/networkStatus", async () => {
  const actual = await vi.importActual<typeof import("@/lib/offline/networkStatus")>(
    "@/lib/offline/networkStatus",
  );
  return { ...actual, getIsOnline: () => online };
});

// Imports après les mocks (obligatoire avec vi.mock hoisté).
import { resetOfflineDbForTests } from "./db";
import { refreshWorkoutsFromServer } from "@/hooks/use-fitness";
import {
  markWorkoutsServerRefreshStale,
  workoutsServerRefreshGate,
} from "@/lib/offline/workoutsRefreshWindow";

const USER = "user-perf";
const TABLES_PER_ROUND_TRIP = 4; // workouts + exercises + exercise_sets + workout_segments

function totalReads(): number {
  return Object.values(reads).reduce((sum, n) => sum + n, 0);
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
  workoutsServerRefreshGate.reset();
  for (const key of Object.keys(reads)) delete reads[key];
  online = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MAJ-04 — coût réseau de refreshWorkoutsFromServer", () => {
  it("un rafraîchissement réellement utile lit les 4 tables du domaine séance", async () => {
    await refreshWorkoutsFromServer(USER);
    expect(reads).toEqual({
      workouts: 1,
      exercises: 1,
      exercise_sets: 1,
      workout_segments: 1,
    });
  });

  it("les 4 queries montées pendant une séance partagent UN aller-retour (16 → 4 lectures)", async () => {
    await Promise.all([
      refreshWorkoutsFromServer(USER), // useWorkouts
      refreshWorkoutsFromServer(USER), // useActiveWorkout
      refreshWorkoutsFromServer(USER), // useActiveGenericWorkout
      refreshWorkoutsFromServer(USER), // useActiveWorkoutSegments
    ]);
    expect(totalReads()).toBe(TABLES_PER_ROUND_TRIP);
  });

  it("10 validations de série n'ajoutent AUCUNE lecture serveur (40 → 0)", async () => {
    await refreshWorkoutsFromServer(USER); // montage de l'écran
    const afterMount = totalReads();

    for (let i = 0; i < 10; i += 1) {
      // Chaque validation invalide la clé de la séance active → refetch →
      // la `queryFn` rappelle refreshWorkoutsFromServer.
      await refreshWorkoutsFromServer(USER);
    }
    expect(totalReads()).toBe(afterMount);
  });

  it("la clôture de séance (invalidation du préfixe fitness) n'ajoute aucune lecture (16 → 0)", async () => {
    await refreshWorkoutsFromServer(USER);
    const afterMount = totalReads();

    await Promise.all([
      refreshWorkoutsFromServer(USER),
      refreshWorkoutsFromServer(USER),
      refreshWorkoutsFromServer(USER),
      refreshWorkoutsFromServer(USER),
    ]);
    expect(totalReads()).toBe(afterMount);
  });

  it("le retour du réseau relit bien le serveur (la fraîcheur n'est pas sacrifiée)", async () => {
    await refreshWorkoutsFromServer(USER);
    expect(totalReads()).toBe(TABLES_PER_ROUND_TRIP);

    markWorkoutsServerRefreshStale();
    await refreshWorkoutsFromServer(USER);
    expect(totalReads()).toBe(TABLES_PER_ROUND_TRIP * 2);
  });

  it("hors connexion : aucune lecture, et la fenêtre reste ouverte pour le retour du réseau", async () => {
    online = false;
    await refreshWorkoutsFromServer(USER);
    expect(totalReads()).toBe(0);

    online = true;
    await refreshWorkoutsFromServer(USER);
    expect(totalReads()).toBe(TABLES_PER_ROUND_TRIP);
  });

  it("un autre utilisateur n'hérite jamais de la fenêtre du précédent", async () => {
    await refreshWorkoutsFromServer(USER);
    await refreshWorkoutsFromServer("autre-user");
    expect(totalReads()).toBe(TABLES_PER_ROUND_TRIP * 2);
  });
});
