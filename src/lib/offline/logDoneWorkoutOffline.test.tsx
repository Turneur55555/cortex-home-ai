// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
 * « Je l'ai faite » — `useLogDoneWorkout`, contre les VRAIS repositories et la VRAIE file,
 * HORS CONNEXION (le cas réel : on enregistre sa séance en sortant de la salle).
 *
 * Ce qui compte ici, c'est l'ORDRE et la FORME de ce qui part au serveur, parce que c'est ce
 * que voit le trigger `award_xp_on_workout_complete` (INVARIANTS §3.1) :
 *   - la séance part ACTIVE, puis ses exercices, puis ses séries cochées ;
 *   - la clôture (`status='completed'`) est une opération SÉPARÉE, jamais fusionnée dans le
 *     `create`, enfilée APRÈS toutes les séries et retenue par leur barrière de dépendances.
 * C'est exactement la garantie DISC-01 de `useFinishWorkout` (voir
 * `sessionRewardOffline.test.ts`, où le simulateur de trigger le prouve) ; le défaut que ce
 * chemin évite est celui de `useAddWorkout` — un INSERT déjà terminé, avant les séries.
 */

const USER = "user-done";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from() {
      throw new Error("« Je l'ai faite » hors ligne ne doit JAMAIS appeler le serveur.");
    },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
  },
}));

vi.mock("@/lib/offline/networkStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/networkStatus")>();
  return { ...actual, getIsOnline: () => false };
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: USER }, session: null, loading: false }),
}));

vi.mock("@/lib/activity", () => ({ logActivity: () => undefined }));
vi.mock("@/lib/offline/syncFlush", () => ({ requestSyncFlush: () => undefined }));
vi.mock("@/hooks/useVerifyExerciseRanksForSession", () => ({
  verifyExerciseRanksForSession: () => undefined,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Imports après les mocks (vi.mock est hissé).
import {
  exerciseSetsRepo,
  exercisesRepo,
  useLogDoneWorkout,
  workoutsRepo,
} from "@/hooks/use-fitness";
import { localDateYMD, addDaysYMD } from "@/lib/dates";
import { ACTIVE_WORKOUT_CONFLICT_MESSAGE } from "@/lib/fitness/activeWorkoutGuard";
import { resetOfflineDbForTests } from "./db";
import { listAllOperations } from "./syncQueue";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let mutation: ReturnType<typeof useLogDoneWorkout>;

function Probe() {
  mutation = useLogDoneWorkout();
  return null;
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  act(() => root.render(wrap(<Probe />)));
}

const yesterday = () => addDaysYMD(localDateYMD(), -1);

const PAYLOAD = () => ({
  name: "Dos",
  date: yesterday(),
  durationMinutes: 50,
  exercises: [
    {
      name: "Tirage poitrine",
      imagePath: null,
      exerciseReferenceId: "ref-tirage",
      sets: [
        { reps: 10, weight: 60 },
        { reps: 8, weight: 65 },
      ],
    },
    {
      name: "Tractions",
      imagePath: null,
      exerciseReferenceId: "ref-tractions",
      sets: [{ reps: 12, weight: 0 }],
    },
  ],
});

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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mount();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("useLogDoneWorkout — la séance saisie après coup suit le chemin d'une séance en direct", () => {
  it("en local : séance terminée à SA date, durée confirmée, séries cochées et numérotées", async () => {
    let result: { workoutId: string } | undefined;
    await act(async () => {
      result = await mutation.mutateAsync(PAYLOAD());
    });

    const workout = await workoutsRepo.get(result!.workoutId);
    expect(workout).toMatchObject({
      name: "Dos",
      date: yesterday(),
      status: "completed",
      duration_minutes: 50,
      discipline: "muscu",
    });

    const exercises = (await exercisesRepo.list(USER))
      .filter((e) => e.workout_id === result!.workoutId)
      .sort((a, b) => a.position - b.position);
    // Résumé historique écrit dès la création, avec la règle de la clôture.
    expect(
      exercises.map((e) => [e.name, e.exercise_reference_id, e.sets, e.reps, e.weight]),
    ).toEqual([
      ["Tirage poitrine", "ref-tirage", 2, 8, 65],
      // Poids du corps : la série existe (cochée), mais ce n'est pas une série « exploitable »
      // pour le résumé historique (même règle que la clôture en direct).
      ["Tractions", "ref-tractions", null, null, null],
    ]);

    const sets = await exerciseSetsRepo.list(USER);
    const tirageSets = sets
      .filter((s) => s.exercise_id === exercises[0].id)
      .sort((a, b) => a.set_number - b.set_number);
    expect(tirageSets.map((s) => [s.set_number, s.reps, s.weight, s.completed])).toEqual([
      [1, 10, 60, true],
      [2, 8, 65, true],
    ]);
    expect(sets.filter((s) => s.exercise_id === exercises[1].id)).toMatchObject([
      { set_number: 1, reps: 12, weight: 0, completed: true },
    ]);
  });

  it("file : create ACTIVE → exercices → séries → clôture séparée, retenue par TOUS ses enfants", async () => {
    let workoutId = "";
    await act(async () => {
      workoutId = (await mutation.mutateAsync(PAYLOAD())).workoutId;
    });

    const ops = (await listAllOperations(USER)).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    const workoutOps = ops.filter((o) => o.table === "workouts" && o.recordLocalId === workoutId);
    expect(workoutOps.map((o) => o.opType)).toEqual(["create", "update"]);

    const [create, close] = workoutOps;
    // Le serveur reçoit d'abord une séance ACTIVE : le trigger ne se déclenche pas à l'INSERT…
    expect(create.payload).toMatchObject({ status: "active", date: yesterday() });
    // …mais à la clôture, opération distincte (jamais fusionnée dans le create).
    expect(close.payload).toMatchObject({ status: "completed", duration_minutes: 50 });

    const children = ops.filter((o) => o.table === "exercises" || o.table === "exercise_sets");
    expect(children).toHaveLength(2 + 3);
    for (const child of children) {
      expect(child.opType).toBe("create");
      expect(child.createdAt < close.createdAt).toBe(true);
      expect(child.createdAt > create.createdAt).toBe(true);
    }
    // La barrière nomme chaque exercice et chaque série : si l'un échoue, la clôture attend.
    expect(new Set(close.dependsOnRecords?.map((d) => `${d.table}:${d.recordLocalId}`))).toEqual(
      new Set(children.map((c) => `${c.table}:${c.recordLocalId}`)),
    );
  });

  it("une séance déjà en cours : refus, rien n'est écrit (une seule séance active — §2.1)", async () => {
    await workoutsRepo.create(USER, {
      name: "En cours",
      date: localDateYMD(),
      gym_location: "Salle",
      status: "active",
      discipline: "muscu",
      metadata: {},
      duration_minutes: null,
      notes: null,
      level_before: null,
      level_after: null,
      xp_before: null,
      xp_after: null,
    });
    const before = (await listAllOperations(USER)).length;

    await act(async () => {
      await expect(mutation.mutateAsync(PAYLOAD())).rejects.toThrow(
        ACTIVE_WORKOUT_CONFLICT_MESSAGE,
      );
    });
    expect(await listAllOperations(USER)).toHaveLength(before);
    expect(await exercisesRepo.list(USER)).toHaveLength(0);
  });

  it("refuse une date future, une durée invalide ou une séance vide — sans rien écrire", async () => {
    const tomorrow = addDaysYMD(localDateYMD(), 1);
    for (const payload of [
      { ...PAYLOAD(), date: tomorrow },
      { ...PAYLOAD(), durationMinutes: 0 },
      { ...PAYLOAD(), durationMinutes: 42.5 },
      { ...PAYLOAD(), exercises: [] },
      { ...PAYLOAD(), exercises: [{ ...PAYLOAD().exercises[0], sets: [] }] },
    ]) {
      await act(async () => {
        await expect(mutation.mutateAsync(payload)).rejects.toThrow();
      });
    }
    expect(await listAllOperations(USER)).toHaveLength(0);
  });
});
