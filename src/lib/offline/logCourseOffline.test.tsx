// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
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
 * « J'y étais » — `useLogCourseFromTemplate` (cours de Lagree enregistré d'un toucher, sans
 * séance à l'écran), contre les VRAIS repositories et la VRAIE file, HORS CONNEXION. Même
 * garantie que « Je l'ai faite » (logDoneWorkoutOffline.test.tsx) : le serveur reçoit une
 * séance ACTIVE puis une clôture SÉPARÉE — sinon le trigger d'XP ne verrait rien.
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
vi.mock("@/services/exerciseResolution", () => ({
  resolveExerciseIdsByLabel: async () => new Map(),
}));

// Imports après les mocks (vi.mock est hissé).
import { workoutsRepo } from "@/hooks/use-fitness";
import { useLogCourseFromTemplate, type WorkoutTemplateRow } from "@/hooks/useWorkoutTemplates";
import { localDateYMD } from "@/lib/dates";
import { ACTIVE_WORKOUT_CONFLICT_MESSAGE } from "@/lib/fitness/activeWorkoutGuard";
import { COURSES } from "@/lib/fitness/courses";
import { resetOfflineDbForTests } from "./db";
import { listAllOperations } from "./syncQueue";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let mutation: ReturnType<typeof useLogCourseFromTemplate>;

function Probe() {
  mutation = useLogCourseFromTemplate();
  return null;
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    ),
  );
}

const template = (course_key: string | null): WorkoutTemplateRow => ({
  id: "tpl",
  name: "Lagree",
  icon: "Sparkles",
  color: "violet",
  course_key,
  created_at: "2026-11-04T00:00:00Z",
  updated_at: "2026-11-04T00:00:00Z",
  exercises: [],
  segments: [],
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

describe("useLogCourseFromTemplate — le cours enregistré d'un toucher", () => {
  it("en local : cours terminé aujourd'hui, 50 min, Keep Cool, avec son cours et ses zones", async () => {
    let workoutId = "";
    await act(async () => {
      workoutId = (await mutation.mutateAsync(template("lagree"))).workoutId;
    });
    const workout = await workoutsRepo.get(workoutId);
    expect(workout).toMatchObject({
      name: "Lagree",
      date: localDateYMD(),
      status: "completed",
      duration_minutes: 50,
      discipline: "guided",
      gym_location: "Keep Cool",
    });
    expect(workout?.metadata).toMatchObject({
      course: "lagree",
      muscleZones: [...COURSES.lagree.zones],
    });
  });

  it("file : create ACTIVE puis clôture SÉPARÉE (le trigger d'XP voit la transition)", async () => {
    let workoutId = "";
    await act(async () => {
      workoutId = (await mutation.mutateAsync(template("lagree"))).workoutId;
    });
    const ops = (await listAllOperations(USER))
      .filter((o) => o.table === "workouts" && o.recordLocalId === workoutId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(ops.map((o) => o.opType)).toEqual(["create", "update"]);
    expect(ops[0].payload).toMatchObject({ status: "active" });
    expect(ops[1].payload).toMatchObject({ status: "completed", duration_minutes: 50 });
  });

  it("une séance déjà en cours : refus, rien n'est écrit (§2.1)", async () => {
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
      await expect(mutation.mutateAsync(template("lagree"))).rejects.toThrow(
        ACTIVE_WORKOUT_CONFLICT_MESSAGE,
      );
    });
    expect(await listAllOperations(USER)).toHaveLength(before);
  });

  it("un modèle de musculation n'est pas un cours : refus sans rien écrire", async () => {
    await act(async () => {
      await expect(mutation.mutateAsync(template(null))).rejects.toThrow();
    });
    expect(await listAllOperations(USER)).toHaveLength(0);
  });
});
