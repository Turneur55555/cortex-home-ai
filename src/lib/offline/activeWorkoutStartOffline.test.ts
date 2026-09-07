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
 * CHANTIER FINAL (AUD-06) — DÉMARRAGE DE SÉANCE SÉCURISÉ, contre la VRAIE
 * garde et les VRAIS repositories.
 *
 * Ce qui est testé ici n'est PAS la primitive de sérialisation (couverte par
 * `lib/fitness/activeWorkoutStart.test.ts`) mais la séquence réelle des cinq
 * points de démarrage : `assertNoActiveWorkout()` (exporté par
 * `hooks/use-fitness.ts`, il lit le store offline) puis
 * `workoutsRepo.create()`. Le premier test reproduit délibérément l'ANCIENNE
 * séquence pour prouver que le défaut existait — sans lui, les suivants ne
 * démontreraient rien.
 *
 * Tout se passe HORS CONNEXION : aucune requête ne part au serveur, la
 * séance est créée en local et l'opération part en file. C'est le
 * comportement offline-first existant, inchangé.
 *
 * Le client Supabase est mocké par un objet inerte : ces chemins n'appellent
 * jamais le réseau (`repository.ts` est 100 % local), mais `use-fitness.ts`
 * l'importe au chargement du module.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from() {
      throw new Error("Le démarrage de séance ne doit JAMAIS appeler le serveur.");
    },
    functions: {
      invoke() {
        throw new Error("Le démarrage de séance ne doit JAMAIS appeler le serveur.");
      },
    },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  },
}));

// Hors connexion pour toute la durée du fichier : le démarrage doit
// fonctionner sans réseau, exactement comme en usage réel dans une salle.
vi.mock("@/lib/offline/networkStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/networkStatus")>();
  return { ...actual, getIsOnline: () => false };
});

// Imports après les mocks (obligatoire avec vi.mock hoisté).
import { assertNoActiveWorkout, workoutsRepo } from "@/hooks/use-fitness";
import { startActiveWorkoutExclusively } from "@/lib/fitness/activeWorkoutStart";
import { ACTIVE_WORKOUT_CONFLICT_MESSAGE } from "@/lib/fitness/activeWorkoutGuard";
import { resetOfflineDbForTests } from "./db";
import { listAllOperations } from "./syncQueue";

const USER = "user-aud06";

const workoutInput = (name: string) => ({
  name,
  date: "2026-09-07",
  gym_location: "Salle Neptune",
  status: "active" as const,
  discipline: "muscu",
  metadata: {},
  duration_minutes: null,
  notes: null,
  level_before: null,
  level_after: null,
  xp_before: null,
  xp_after: null,
});

/** La séquence RÉELLE d'un point de démarrage, telle qu'elle est écrite dans
 *  les cinq hooks depuis AUD-06 : garde + création dans la même section
 *  critique. */
function startWorkout(name: string) {
  return startActiveWorkoutExclusively(USER, async () => {
    await assertNoActiveWorkout(USER);
    return workoutsRepo.create(USER, workoutInput(name));
  });
}

/** L'ANCIENNE séquence, non atomique — conservée pour démontrer le défaut. */
function startWorkoutWithoutCriticalSection(name: string) {
  return (async () => {
    await assertNoActiveWorkout(USER);
    return workoutsRepo.create(USER, workoutInput(name));
  })();
}

async function activeWorkouts() {
  return (await workoutsRepo.list(USER)).filter((w) => w.status === "active");
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AUD-06 — le défaut corrigé", () => {
  it("SANS section critique, deux démarrages concurrents créent DEUX séances actives", async () => {
    await Promise.all([
      startWorkoutWithoutCriticalSection("Push A"),
      startWorkoutWithoutCriticalSection("Push B"),
    ]);

    // C'est exactement le scénario que la contrainte serveur rejettera plus
    // tard (23505 sur `workouts_one_active_per_user`) : une opération en
    // échec définitif, donc `blocked`, donc une clôture retenue.
    expect(await activeWorkouts()).toHaveLength(2);
  });
});

describe("AUD-06 — démarrage sérialisé", () => {
  it("succès normal : une seule séance active, une seule opération en file", async () => {
    const workout = await startWorkout("Push Day");

    expect(workout.status).toBe("active");
    const active = await activeWorkouts();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(workout.id);

    const ops = await listAllOperations(USER);
    expect(ops).toHaveLength(1);
    expect(ops[0].opType).toBe("create");
    expect(ops[0].table).toBe("workouts");
  });

  it("double déclenchement (double tap sur « Démarrer ») : une seule séance créée", async () => {
    const results = await Promise.allSettled([startWorkout("Push Day"), startWorkout("Push Day")]);

    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(((results[1] as PromiseRejectedResult).reason as Error).message).toBe(
      ACTIVE_WORKOUT_CONFLICT_MESSAGE,
    );

    expect(await activeWorkouts()).toHaveLength(1);
    // Le refus est PROPRE : aucune ligne fantôme, aucune opération orpheline.
    expect(await listAllOperations(USER)).toHaveLength(1);
  });

  it("appels concurrents depuis des points de démarrage DIFFÉRENTS : une seule séance", async () => {
    // Muscu (« Nouvelle séance ») et générique (Course, seedée par le Sensei)
    // partagent la même garde : la seconde intention doit être refusée, quel
    // que soit l'écran d'où elle part.
    const results = await Promise.allSettled([
      startWorkout("Push Day"),
      startWorkout("Sortie longue"),
      startWorkout("Refaire en live"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
    expect(await activeWorkouts()).toHaveLength(1);
  });

  it("échec puis nouvelle tentative : la chaîne n'est pas empoisonnée", async () => {
    const failed = startActiveWorkoutExclusively(USER, async () => {
      await assertNoActiveWorkout(USER);
      throw new Error("écriture locale impossible");
    });
    await expect(failed).rejects.toThrow("écriture locale impossible");
    expect(await activeWorkouts()).toHaveLength(0);

    // La tentative suivante part normalement — un échec réel ne doit jamais
    // condamner le démarrage.
    const workout = await startWorkout("Push Day");
    expect(workout.status).toBe("active");
    expect(await activeWorkouts()).toHaveLength(1);
  });

  it("une séance close libère le démarrage suivant", async () => {
    const first = await startWorkout("Push Day");
    await workoutsRepo.update(first.id, USER, { status: "completed", duration_minutes: 45 });

    const second = await startWorkout("Pull Day");
    expect(second.id).not.toBe(first.id);
    expect(await activeWorkouts()).toHaveLength(1);
  });

  it("hors connexion : rien n'est envoyé au serveur, tout est visible en local", async () => {
    // Le mock du client Supabase LÈVE à la moindre requête : ce test échoue
    // donc si le démarrage tentait un aller-retour réseau.
    const workout = await startWorkout("Push Day");

    const local = await workoutsRepo.list(USER);
    expect(local).toHaveLength(1);
    expect(local[0].id).toBe(workout.id);

    const ops = await listAllOperations(USER);
    expect(ops).toHaveLength(1);
    expect(ops[0].status).toBe("pending");
  });

  it("deux comptes sur le même appareil ne se bloquent pas l'un l'autre", async () => {
    await startWorkout("Push Day");

    const other = await startActiveWorkoutExclusively("autre-compte", async () => {
      await assertNoActiveWorkout("autre-compte");
      return workoutsRepo.create("autre-compte", workoutInput("Sa séance"));
    });

    expect(other.status).toBe("active");
    expect(await activeWorkouts()).toHaveLength(1);
  });
});
