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

/**
 * Jeu de données minimal mais NON VIDE — indispensable depuis le bornage
 * déterministe du chantier 3 (MAJ-08) : les enfants sont désormais demandés
 * `in(<clé parente>, …)` à partir des séances réellement rapatriées. Avec un
 * serveur vide, il n'y a aucun parent, donc aucune requête enfant à compter,
 * et ce fichier ne mesurerait plus rien. Une séance avec un exercice, une
 * série et un segment suffit à produire exactement UN aller-retour par table.
 */
const SERVER_ROWS: Record<string, Row[]> = {
  workouts: [
    { id: "w-1", user_id: "user-perf", date: "2026-09-03", updated_at: "2026-09-03T10:00:00.000Z" },
  ],
  exercises: [
    { id: "e-1", workout_id: "w-1", user_id: "user-perf", updated_at: "2026-09-03T10:00:00.000Z" },
  ],
  exercise_sets: [
    { id: "s-1", exercise_id: "e-1", user_id: "user-perf", updated_at: "2026-09-03T10:00:00.000Z" },
  ],
  workout_segments: [
    { id: "g-1", workout_id: "w-1", user_id: "user-perf", updated_at: "2026-09-03T10:00:00.000Z" },
  ],
};

function createCountingSupabase() {
  return {
    from(table: string) {
      const run = () => {
        reads[table] = (reads[table] ?? 0) + 1;
        return Promise.resolve({ data: SERVER_ROWS[table] ?? [], error: null });
      };
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        // Lecture paginée des enfants (MAJ-08) : une seule page suffit ici,
        // le jeu de test étant très en dessous de `CHILD_PAGE_SIZE`.
        range: () => run(),
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          run().then(resolve, reject);
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
