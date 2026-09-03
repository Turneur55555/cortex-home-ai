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
 * CHANTIER 3 — HYDRATATION FITNESS BORNÉE (MAJ-08) et RÉCONCILIATION DES
 * SUPPRESSIONS SERVEUR (MAJ-03).
 *
 * Le simulateur reproduit les DEUX contraintes PostgREST qui font la
 * différence ici :
 *   1. `max-rows` (1 000 par défaut chez Supabase) est appliqué
 *      SILENCIEUSEMENT — une requête non paginée qui dépasse le plafond
 *      renvoie une réponse TRONQUÉE, sans erreur. C'est exactement ce qui
 *      arrivait à `exercise_sets` (1 128 lignes relevées en production pour
 *      un utilisateur du projet `bcwfvpwxzlmkxobvbtzp` le 03/09/2026) ;
 *   2. `range(from, to)` pagine réellement.
 *
 * Chaque requête est journalisée : c'est ce journal qui prouve le BORNAGE
 * (limite des séances, filtres `in(...)` sur les seuls parents rapatriés,
 * pagination) et pas seulement le résultat final.
 */

type Row = Record<string, unknown> & { id: string };

/** Plafond `max-rows` de PostgREST, appliqué en silence comme en production. */
const MAX_ROWS = 1_000;

interface RequestLog {
  table: string;
  eq: Record<string, string>;
  inColumn?: string;
  inCount?: number;
  limit?: number;
  rangeFrom?: number;
  rangeTo?: number;
  returned: number;
  count: number | null;
}

const server = new Map<string, Row[]>();
const requests: RequestLog[] = [];
let online = true;
/** Table dont la PROCHAINE lecture échouera (simulation de coupure). */
let failTable: string | null = null;
/**
 * Plafond `max-rows` EFFECTIF du simulateur, réglable PAR TABLE. C'est une
 * configuration SERVEUR : la réconciliation ne doit jamais dépendre de sa
 * valeur (cf. les tests « plafond serveur abaissé »).
 */
const maxRowsByTable: Record<string, number> = {};
/** Le serveur annonce-t-il le total exact (`count: "exact"`) ? */
let countEnabled = true;

function rowsOf(table: string): Row[] {
  return server.get(table) ?? [];
}

function compareBy(orders: { column: string; ascending: boolean }[]) {
  return (a: Row, b: Row): number => {
    for (const { column, ascending } of orders) {
      const av = String(a[column] ?? "");
      const bv = String(b[column] ?? "");
      if (av !== bv) return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
    }
    return 0;
  };
}

function createFakeSupabase() {
  return {
    from(table: string) {
      const eq: Record<string, string> = {};
      const orders: { column: string; ascending: boolean }[] = [];
      let inFilter: { column: string; values: string[] } | null = null;
      let limit: number | undefined;
      let countRequested = false;

      const exec = async (range?: {
        from: number;
        to: number;
      }): Promise<{ data: Row[] | null; error: unknown; count: number | null }> => {
        if (failTable === table) {
          failTable = null;
          requests.push({ table, eq: { ...eq }, returned: 0, count: null });
          return { data: null, error: new Error("réseau coupé"), count: null };
        }
        let rows = rowsOf(table).filter((row) =>
          Object.entries(eq).every(([col, val]) => row[col] === val),
        );
        if (inFilter) {
          const { column, values } = inFilter;
          const set = new Set(values);
          rows = rows.filter((row) => set.has(row[column] as string));
        }
        rows = [...rows].sort(compareBy(orders));
        // `count: "exact"` porte sur le jeu FILTRÉ, avant pagination — comme
        // l'en-tête `Content-Range` de PostgREST.
        const exactCount = countRequested && countEnabled ? rows.length : null;
        if (range) rows = rows.slice(range.from, range.to + 1);
        else if (limit !== undefined) rows = rows.slice(0, limit);
        // Plafond serveur appliqué EN DERNIER et SANS erreur — comme PostgREST.
        const truncated = rows.slice(0, maxRowsByTable[table] ?? MAX_ROWS);
        requests.push({
          table,
          eq: { ...eq },
          inColumn: inFilter?.column,
          inCount: inFilter?.values.length,
          limit,
          rangeFrom: range?.from,
          rangeTo: range?.to,
          returned: truncated.length,
          count: exactCount,
        });
        return { data: truncated.map((row) => ({ ...row })), error: null, count: exactCount };
      };

      const builder = {
        select(_columns: string, options?: { count?: "exact" }) {
          countRequested = options?.count === "exact";
          return builder;
        },
        eq(column: string, value: string) {
          eq[column] = value;
          return builder;
        },
        in(column: string, values: string[]) {
          inFilter = { column, values };
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orders.push({ column, ascending: options?.ascending !== false });
          return builder;
        },
        limit(value: number) {
          limit = value;
          return builder;
        },
        range: (from: number, to: number) => exec({ from, to }),
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          exec().then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase();
  },
}));

vi.mock("@/lib/offline/networkStatus", async () => {
  const actual = await vi.importActual<typeof import("@/lib/offline/networkStatus")>(
    "@/lib/offline/networkStatus",
  );
  return { ...actual, getIsOnline: () => online };
});

// Imports après les mocks (obligatoire avec vi.mock hoisté).
import { clearAllOfflineDataForTests, resetOfflineDbForTests } from "./db";
import { workoutsServerRefreshGate } from "./workoutsRefreshWindow";
import {
  exerciseSetsRepo,
  exercisesRepo,
  refreshWorkoutsFromServer,
  workoutSegmentsRepo,
  workoutsRepo,
} from "@/hooks/use-fitness";

const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "44444444-4444-4444-8444-444444444444";

/** Doit rester aligné sur `WORKOUTS_HYDRATION_LIMIT` (use-fitness.ts). */
const WORKOUTS_LIMIT = 200;

function isoDate(index: number): string {
  // Séances numérotées de la plus ANCIENNE (index 0) à la plus RÉCENTE.
  const day = new Date(Date.UTC(2024, 0, 1) + index * 86_400_000);
  return day.toISOString().slice(0, 10);
}

function seedWorkouts(count: number, userId = USER): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      id: `w-${String(i).padStart(4, "0")}`,
      user_id: userId,
      name: `Séance ${i}`,
      date: isoDate(i),
      status: "completed",
      created_at: `2024-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
      updated_at: "2024-01-01T00:00:00.000Z",
    });
  }
  return rows;
}

function exerciseFor(workoutId: string, index = 0, userId = USER): Row {
  return {
    id: `e-${workoutId}-${index}`,
    user_id: userId,
    workout_id: workoutId,
    name: "Développé couché",
    position: index,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  };
}

function setFor(exerciseId: string, index: number, userId = USER): Row {
  return {
    id: `s-${exerciseId}-${String(index).padStart(4, "0")}`,
    user_id: userId,
    exercise_id: exerciseId,
    set_number: index,
    reps: 10,
    weight: 60,
    completed: true,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  };
}

function segmentFor(workoutId: string, userId = USER): Row {
  return {
    id: `g-${workoutId}`,
    user_id: userId,
    workout_id: workoutId,
    position: 0,
    label: "Bloc",
    metrics: {},
    completed: true,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  };
}

function requestsFor(table: string): RequestLog[] {
  return requests.filter((r) => r.table === table);
}

beforeEach(async () => {
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
  await clearAllOfflineDataForTests();
  workoutsServerRefreshGate.reset();
  server.clear();
  requests.length = 0;
  online = true;
  failTable = null;
  for (const key of Object.keys(maxRowsByTable)) delete maxRowsByTable[key];
  countEnabled = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── MAJ-08 ────────────────────────────────────────────────────────────────

describe("MAJ-08 — hydratation fitness bornée et déterministe", () => {
  it("ne rapatrie que les séances de la fenêtre, et UNIQUEMENT leurs enfants", async () => {
    const workouts = seedWorkouts(250);
    server.set("workouts", workouts);
    // Un exercice pour la séance la plus ancienne (HORS fenêtre) et un pour
    // la plus récente (DANS la fenêtre).
    const oldest = workouts[0].id as string;
    const newest = workouts[249].id as string;
    server.set("exercises", [exerciseFor(oldest), exerciseFor(newest)]);
    server.set("exercise_sets", [setFor(`e-${newest}-0`, 1), setFor(`e-${oldest}-0`, 1)]);
    server.set("workout_segments", [segmentFor(newest), segmentFor(oldest)]);

    await refreshWorkoutsFromServer(USER);

    const localWorkouts = await workoutsRepo.list(USER);
    expect(localWorkouts).toHaveLength(WORKOUTS_LIMIT);
    // Fenêtre = les plus récentes.
    expect(localWorkouts.some((w) => w.id === newest)).toBe(true);
    expect(localWorkouts.some((w) => w.id === oldest)).toBe(false);

    // La requête des séances est bien bornée.
    expect(requestsFor("workouts")[0].limit).toBe(WORKOUTS_LIMIT);

    // Les enfants sont demandés PAR séance rapatriée, jamais « toutes les
    // lignes de l'utilisateur ».
    for (const request of requestsFor("exercises")) {
      expect(request.inColumn).toBe("workout_id");
      expect(request.inCount).toBeLessThanOrEqual(100);
    }
    const localExercises = await exercisesRepo.list(USER);
    expect(localExercises.map((e) => e.id)).toEqual([`e-${newest}-0`]);
    const localSets = await exerciseSetsRepo.list(USER);
    expect(localSets.map((s) => s.exercise_id)).toEqual([`e-${newest}-0`]);
    const localSegments = await workoutSegmentsRepo.list(USER);
    expect(localSegments.map((g) => g.workout_id)).toEqual([newest]);
  });

  it("un gros volume de séries est rapatrié INTÉGRALEMENT, sans troncature silencieuse", async () => {
    // Reproduit le volume réel relevé en production (1 128 séries), au-delà
    // du plafond `max-rows` que le simulateur applique sans erreur.
    const workouts = seedWorkouts(3);
    server.set("workouts", workouts);
    const exercises = workouts.map((w) => exerciseFor(w.id as string));
    server.set("exercises", exercises);
    const sets: Row[] = [];
    for (const exercise of exercises) {
      for (let i = 0; i < 400; i += 1) sets.push(setFor(exercise.id as string, i));
    }
    expect(sets.length).toBe(1_200);
    expect(sets.length).toBeGreaterThan(MAX_ROWS);
    server.set("exercise_sets", sets);

    await refreshWorkoutsFromServer(USER);

    const localSets = await exerciseSetsRepo.list(USER);
    expect(localSets).toHaveLength(1_200);

    // La preuve du mécanisme : plusieurs pages, toutes sous le plafond.
    const setRequests = requestsFor("exercise_sets");
    expect(setRequests.length).toBeGreaterThan(1);
    for (const request of setRequests) {
      expect(request.rangeTo! - request.rangeFrom! + 1).toBeLessThanOrEqual(500);
      expect(request.returned).toBeLessThanOrEqual(MAX_ROWS);
    }
  });

  it("aucune requête enfant n'est émise quand l'utilisateur n'a aucune séance", async () => {
    server.set("workouts", []);
    await refreshWorkoutsFromServer(USER);
    expect(requestsFor("workouts")).toHaveLength(1);
    expect(requestsFor("exercises")).toHaveLength(0);
    expect(requestsFor("exercise_sets")).toHaveLength(0);
    expect(requestsFor("workout_segments")).toHaveLength(0);
  });

  it("les données d'un autre utilisateur ne sont jamais rapatriées", async () => {
    server.set("workouts", [...seedWorkouts(2), ...seedWorkouts(2, OTHER_USER)]);
    await refreshWorkoutsFromServer(USER);
    for (const request of requests) expect(request.eq.user_id).toBe(USER);
    const local = await workoutsRepo.list(USER);
    expect(local.every((w) => w.user_id === USER)).toBe(true);
  });
});

// ─── MAJ-03 ────────────────────────────────────────────────────────────────

describe("MAJ-03 — réconciliation des suppressions serveur", () => {
  it("jeu de données PROUVÉ complet : une séance supprimée ailleurs disparaît en local, avec ses enfants", async () => {
    const workouts = seedWorkouts(3);
    server.set("workouts", workouts);
    server.set(
      "exercises",
      workouts.map((w) => exerciseFor(w.id as string)),
    );
    server.set(
      "exercise_sets",
      workouts.map((w) => setFor(`e-${w.id}-0`, 1)),
    );
    server.set(
      "workout_segments",
      workouts.map((w) => segmentFor(w.id as string)),
    );

    await refreshWorkoutsFromServer(USER);
    expect(await workoutsRepo.list(USER)).toHaveLength(3);

    // Suppression depuis un AUTRE appareil (cascade serveur incluse).
    const deleted = workouts[1].id as string;
    server.set(
      "workouts",
      rowsOf("workouts").filter((w) => w.id !== deleted),
    );
    server.set(
      "exercises",
      rowsOf("exercises").filter((e) => e.workout_id !== deleted),
    );
    server.set(
      "exercise_sets",
      rowsOf("exercise_sets").filter((s) => s.exercise_id !== `e-${deleted}-0`),
    );
    server.set(
      "workout_segments",
      rowsOf("workout_segments").filter((g) => g.workout_id !== deleted),
    );

    workoutsServerRefreshGate.reset();
    await refreshWorkoutsFromServer(USER);

    expect((await workoutsRepo.list(USER)).map((w) => w.id)).not.toContain(deleted);
    expect((await exercisesRepo.list(USER)).map((e) => e.workout_id)).not.toContain(deleted);
    expect((await exerciseSetsRepo.list(USER)).map((s) => s.exercise_id)).not.toContain(
      `e-${deleted}-0`,
    );
    expect((await workoutSegmentsRepo.list(USER)).map((g) => g.workout_id)).not.toContain(deleted);
  });

  it("jeu de données TRONQUÉ par la fenêtre : AUCUNE suppression locale", async () => {
    // La fenêtre est pleine (250 > 200) : l'absence d'une ligne dans la
    // réponse ne prouve RIEN, on ne supprime pas.
    const workouts = seedWorkouts(250);
    server.set("workouts", workouts);
    await refreshWorkoutsFromServer(USER);
    const before = await workoutsRepo.list(USER);
    expect(before).toHaveLength(WORKOUTS_LIMIT);

    // On retire une séance de la fenêtre côté serveur, puis on ajoute une
    // séance plus récente pour que la fenêtre reste pleine.
    server.set(
      "workouts",
      rowsOf("workouts").filter((w) => w.id !== before[0].id),
    );
    workoutsServerRefreshGate.reset();
    await refreshWorkoutsFromServer(USER);

    const after = await workoutsRepo.list(USER);
    expect(after.map((w) => w.id)).toContain(before[0].id);
  });

  it("lecture d'enfants en ÉCHEC : hydratation additive, aucune suppression", async () => {
    const workouts = seedWorkouts(2);
    server.set("workouts", workouts);
    server.set(
      "exercises",
      workouts.map((w) => exerciseFor(w.id as string)),
    );
    await refreshWorkoutsFromServer(USER);
    expect(await exercisesRepo.list(USER)).toHaveLength(2);

    // Le serveur n'a plus qu'un exercice, MAIS la lecture échoue : impossible
    // de conclure quoi que ce soit, on ne touche à rien.
    server.set("exercises", [rowsOf("exercises")[0]]);
    failTable = "exercises";
    workoutsServerRefreshGate.reset();
    await refreshWorkoutsFromServer(USER);

    expect(await exercisesRepo.list(USER)).toHaveLength(2);
  });

  it("une ligne locale NON SYNCHRONISÉE n'est jamais supprimée, même sur un jeu complet", async () => {
    const workouts = seedWorkouts(2);
    server.set("workouts", workouts);
    await refreshWorkoutsFromServer(USER);

    // Modification locale non encore poussée sur la séance…
    const target = workouts[0].id as string;
    await workoutsRepo.update(target, USER, { name: "Renommée hors ligne" });

    // …et disparition côté serveur entre-temps.
    server.set(
      "workouts",
      rowsOf("workouts").filter((w) => w.id !== target),
    );
    workoutsServerRefreshGate.reset();
    await refreshWorkoutsFromServer(USER);

    const local = await workoutsRepo.list(USER);
    expect(local.map((w) => w.id)).toContain(target);
    expect(local.find((w) => w.id === target)?.name).toBe("Renommée hors ligne");
  });

  it("une ligne locale HORS PÉRIMÈTRE prouvé n'est jamais supprimée", async () => {
    // Séance ancienne + son exercice, hydratés alors que le serveur était
    // petit — puis le serveur grossit et la séance sort de la fenêtre.
    const workouts = seedWorkouts(2);
    server.set("workouts", workouts);
    server.set(
      "exercises",
      workouts.map((w) => exerciseFor(w.id as string)),
    );
    await refreshWorkoutsFromServer(USER);
    expect(await exercisesRepo.list(USER)).toHaveLength(2);

    const oldWorkoutId = workouts[0].id as string;
    server.set("workouts", seedWorkouts(250));
    server.set("exercises", []);
    workoutsServerRefreshGate.reset();
    await refreshWorkoutsFromServer(USER);

    // L'exercice de la séance sortie de la fenêtre n'est pas dans le
    // périmètre prouvé : il reste, même si le serveur n'en parle plus.
    const local = await exercisesRepo.list(USER);
    expect(local.map((e) => e.workout_id)).toContain(oldWorkoutId);
  });
  it("un plafond serveur BAS est absorbé par la pagination : rien n'est perdu, la preuve tient", async () => {
    // `max-rows` est une configuration serveur : si elle passait sous la
    // taille de page, chaque page reviendrait tronquée. La boucle se cale sur
    // le TOTAL EXACT, pas sur « page incomplète » — elle continue donc de
    // paginer et rapatrie tout.
    const workouts = seedWorkouts(1);
    server.set("workouts", workouts);
    const workoutId = workouts[0].id as string;
    server.set("exercises", [
      exerciseFor(workoutId, 0),
      exerciseFor(workoutId, 1),
      exerciseFor(workoutId, 2),
    ]);
    maxRowsByTable.exercises = 2;

    await refreshWorkoutsFromServer(USER);

    expect(await exercisesRepo.list(USER)).toHaveLength(3);
    expect(requestsFor("exercises").length).toBeGreaterThan(1);
  });

  it("un plafond serveur qui EMPÊCHE de lire n'autorise AUCUNE suppression", async () => {
    const workouts = seedWorkouts(1);
    server.set("workouts", workouts);
    const workoutId = workouts[0].id as string;
    server.set("exercises", [exerciseFor(workoutId, 0), exerciseFor(workoutId, 1)]);
    await refreshWorkoutsFromServer(USER);
    expect(await exercisesRepo.list(USER)).toHaveLength(2);

    // Le serveur ne renvoie plus rien (plafond à 0) tout en annonçant qu'il
    // reste des lignes : impossible de conclure, donc on ne supprime rien.
    maxRowsByTable.exercises = 0;
    workoutsServerRefreshGate.reset();
    await refreshWorkoutsFromServer(USER);

    expect(await exercisesRepo.list(USER)).toHaveLength(2);
  });

  it("sans total exact annoncé par la base, AUCUNE suppression n'est possible", async () => {
    const workouts = seedWorkouts(2);
    server.set("workouts", workouts);
    server.set(
      "exercises",
      workouts.map((w) => exerciseFor(w.id as string)),
    );
    await refreshWorkoutsFromServer(USER);
    expect(await workoutsRepo.list(USER)).toHaveLength(2);

    // Le serveur supprime une séance ET n'annonce plus de total : la preuve
    // de complétude n'existe pas, on garde tout.
    const removed = workouts[0].id as string;
    server.set(
      "workouts",
      rowsOf("workouts").filter((w) => w.id !== removed),
    );
    countEnabled = false;
    workoutsServerRefreshGate.reset();
    await refreshWorkoutsFromServer(USER);

    expect((await workoutsRepo.list(USER)).map((w) => w.id)).toContain(removed);
  });
});
