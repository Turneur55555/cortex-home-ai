import { beforeEach, describe, expect, it, vi } from "vitest";
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
 * CHANTIER 9 — CLÔTURE DE SÉANCE : COURSES, CASCADE ET RÉSUMÉ, HORS LIGNE.
 *
 * Ce fichier rejoue, sur les VRAIS repositories offline et la VRAIE file de
 * synchronisation, ce que font `useFinishWorkout` / `useCancelWorkout`
 * (`hooks/use-fitness.ts`) — verrou de clôture compris. Aucun réseau : tout se
 * passe dans le store local, comme pendant une séance en salle sans réseau.
 *
 * Ce que les tests purs (`lib/fitness/sessionClosure.test.ts`) ne peuvent pas
 * montrer et qui se joue ici : l'ÉTAT RÉEL DES DONNÉES après une course. Une
 * annulation qui passerait pendant une clôture ne « rate » pas silencieusement :
 * elle supprime en cascade les séries et les exercices que la clôture vient de
 * déclarer au serveur dans `dependsOnRecords` — la barrière retiendrait alors
 * une clôture dont les dépendances n'existent plus.
 */

// Aucun appel serveur n'est attendu : toute lecture/écriture Supabase ferait
// échouer le test au lieu de passer inaperçue.
vi.mock("@/integrations/supabase/client", () => ({
  get supabase(): never {
    throw new Error("Aucun accès Supabase ne doit avoir lieu hors ligne");
  },
}));

import { resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import { listAllOperations } from "./syncQueue";
import type { SyncOperation } from "./types";
import { collectWorkoutSyncDependencies } from "@/lib/fitness/workoutSyncDependencies";
import {
  SessionClosureConflictError,
  resetSessionClosureLockForTests,
  runExclusiveSessionClosure,
} from "@/lib/fitness/sessionClosure";
import { allocateSetNumber, nextSetNumber } from "@/lib/fitness/setNumberAllocation";
import { parseSetFieldInput, summarizeExerciseSetsForHistory } from "@/lib/fitness/sets";

const USER = "user-chantier-9";

type Row = Record<string, unknown> & { id: string };
interface WorkoutRow extends Row {
  user_id: string;
  name: string;
  status: string;
  duration_minutes: number | null;
  created_at: string;
}
interface ExerciseRow extends Row {
  user_id: string;
  workout_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  created_at: string;
}
interface ExerciseSetRow extends Row {
  user_id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  completed: boolean;
  created_at: string;
}
interface WorkoutSegmentRow extends Row {
  user_id: string;
  workout_id: string;
  label: string;
  created_at: string;
}

const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");
const exercisesRepo = createOfflineRepository<ExerciseRow>("exercises");
const setsRepo = createOfflineRepository<ExerciseSetRow>("exercise_sets");
const segmentsRepo = createOfflineRepository<WorkoutSegmentRow>("workout_segments");

/** Cascade locale — copie fidèle de `cascadeDeleteWorkoutChildren` (use-fitness.ts). */
async function cascadeDeleteWorkoutChildren(userId: string, workoutId: string): Promise<void> {
  const localExercises = (await exercisesRepo.list(userId)).filter(
    (e) => e.workout_id === workoutId,
  );
  const localSets = await setsRepo.list(userId);
  for (const ex of localExercises) {
    for (const s of localSets.filter((st) => st.exercise_id === ex.id)) {
      await setsRepo.remove(s.id, userId);
    }
    await exercisesRepo.remove(ex.id, userId);
  }
  for (const seg of (await segmentsRepo.list(userId)).filter((s) => s.workout_id === workoutId)) {
    await segmentsRepo.remove(seg.id, userId);
  }
}

/**
 * Clôture d'une séance, telle que `useFinishWorkout` l'écrit réellement :
 * verrou → dépendances lues dans le STORE LOCAL → passage à `completed` (jamais
 * fusionné dans un `create` en attente) → resynchronisation des colonnes
 * résumé des exercices depuis les séries locales.
 */
async function finishWorkout(
  workoutId: string,
  options: { onBeforeWrite?: () => Promise<void> } = {},
) {
  return runExclusiveSessionClosure(workoutId, "finish", async () => {
    const [localExercises, localSets, localSegments] = await Promise.all([
      exercisesRepo.list(USER),
      setsRepo.list(USER),
      segmentsRepo.list(USER),
    ]);
    const dependsOnRecords = collectWorkoutSyncDependencies(workoutId, {
      exercises: localExercises,
      exerciseSets: localSets,
      workoutSegments: localSegments,
    });
    if (options.onBeforeWrite) await options.onBeforeWrite();
    await workoutsRepo.update(
      workoutId,
      USER,
      { status: "completed", duration_minutes: 42 },
      { neverMergeIntoPendingCreate: true, dependsOnRecords },
    );

    const setsByExercise = new Map<string, ExerciseSetRow[]>();
    for (const st of localSets) {
      const bucket = setsByExercise.get(st.exercise_id);
      if (bucket) bucket.push(st);
      else setsByExercise.set(st.exercise_id, [st]);
    }
    for (const ex of localExercises.filter((e) => e.workout_id === workoutId)) {
      const summary = summarizeExerciseSetsForHistory(setsByExercise.get(ex.id) ?? []);
      if (ex.sets === summary.sets && ex.reps === summary.reps && ex.weight === summary.weight) {
        continue;
      }
      await exercisesRepo.update(ex.id, USER, { ...summary });
    }
  });
}

/** Annulation, telle que `useCancelWorkout` l'écrit réellement. */
async function cancelWorkout(workoutId: string) {
  return runExclusiveSessionClosure(workoutId, "cancel", async () => {
    await cascadeDeleteWorkoutChildren(USER, workoutId);
    await workoutsRepo.remove(workoutId, USER);
  });
}

/** Ajout d'une série, tel que `useAddExerciseSet` l'écrit (numéro sérialisé). */
async function addSet(exerciseId: string, values: { reps: number | null; weight: number | null }) {
  return allocateSetNumber(exerciseId, async () => {
    const existing = (await setsRepo.list(USER)).filter((s) => s.exercise_id === exerciseId);
    return setsRepo.create(USER, {
      exercise_id: exerciseId,
      set_number: nextSetNumber({ existing, fallback: existing.length + 1 }),
      reps: values.reps,
      weight: values.weight,
      completed: false,
    } as never);
  });
}

async function seedSession(): Promise<{
  workout: WorkoutRow;
  exercise: ExerciseRow;
  sets: ExerciseSetRow[];
}> {
  const workout = await workoutsRepo.create(USER, {
    name: "Push Day",
    status: "active",
    duration_minutes: null,
  } as never);
  const exercise = await exercisesRepo.create(USER, {
    workout_id: workout.id,
    name: "Développé couché",
    sets: null,
    reps: null,
    weight: null,
  } as never);
  const sets = [
    await addSet(exercise.id, { reps: 10, weight: 60 }),
    await addSet(exercise.id, { reps: 8, weight: 80 }),
  ];
  return { workout, exercise, sets };
}

function opsFor(ops: SyncOperation[], table: string, recordLocalId: string): SyncOperation[] {
  return ops.filter((op) => op.table === table && op.recordLocalId === recordLocalId);
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
  resetSessionClosureLockForTests();
});

// ─── B1 / B2 — courses entre Terminer et Annuler ──────────────────────────

describe("B1/B2 — une seule clôture peut être engagée", () => {
  it("« Annuler » lancé PENDANT la clôture ne supprime rien : la séance reste terminée avec tout son contenu", async () => {
    const { workout, exercise, sets } = await seedSession();

    let cancelOutcome: unknown = null;
    // L'annulation est déclenchée exactement au moment où la clôture a lu ses
    // dépendances mais n'a pas encore écrit : la fenêtre la plus dangereuse.
    await finishWorkout(workout.id, {
      onBeforeWrite: async () => {
        cancelOutcome = await cancelWorkout(workout.id).catch((e) => e);
      },
    });

    expect(cancelOutcome).toBeInstanceOf(SessionClosureConflictError);
    expect((await workoutsRepo.get(workout.id))?.status).toBe("completed");
    expect(await exercisesRepo.get(exercise.id)).toBeDefined();
    for (const s of sets) expect(await setsRepo.get(s.id)).toBeDefined();
  });

  it("les dépendances déclarées par la clôture existent encore — la barrière ne peut pas rester coincée", async () => {
    const { workout, exercise, sets } = await seedSession();
    await finishWorkout(workout.id, {
      onBeforeWrite: async () => {
        await cancelWorkout(workout.id).catch(() => undefined);
      },
    });

    const ops = await listAllOperations(USER);
    const closure = ops.find(
      (op) => op.table === "workouts" && op.recordLocalId === workout.id && op.opType === "update",
    );
    expect(closure).toBeDefined();
    const awaited = (closure?.dependsOnRecords ?? []).map((d) => d.recordLocalId).sort();
    expect(awaited).toEqual([exercise.id, ...sets.map((s) => s.id)].sort());
    // Chaque enregistrement attendu est toujours là : rien n'a été supprimé
    // sous les pieds de la barrière.
    for (const id of awaited) {
      const stillThere = (await exercisesRepo.get(id)) != null || (await setsRepo.get(id)) != null;
      expect(stillThere, `dépendance ${id}`).toBe(true);
    }
  });

  it("« Terminer » lancé PENDANT l'annulation est refusé : la séance est bien supprimée, sans clôture orpheline", async () => {
    const { workout } = await seedSession();

    let finishOutcome: unknown = null;
    await runExclusiveSessionClosure(workout.id, "cancel", async () => {
      finishOutcome = await finishWorkout(workout.id).catch((e) => e);
      await cascadeDeleteWorkoutChildren(USER, workout.id);
      await workoutsRepo.remove(workout.id, USER);
    });

    expect(finishOutcome).toBeInstanceOf(SessionClosureConflictError);
    expect(await workoutsRepo.get(workout.id)).toBeUndefined();
    expect((await exercisesRepo.list(USER)).length).toBe(0);
    expect((await setsRepo.list(USER)).length).toBe(0);
    // La séance n'a JAMAIS été synchronisée : sa suppression retire toutes ses
    // opérations, il ne reste donc aucune clôture à envoyer.
    expect(opsFor(await listAllOperations(USER), "workouts", workout.id)).toEqual([]);
  });

  it("un second « Terminer » (bouton du bandeau puis entrée du menu) n'enfile pas une deuxième clôture", async () => {
    const { workout } = await seedSession();
    await finishWorkout(workout.id);
    await expect(finishWorkout(workout.id)).rejects.toBeInstanceOf(SessionClosureConflictError);

    const closures = opsFor(await listAllOperations(USER), "workouts", workout.id).filter(
      (op) => op.opType === "update",
    );
    expect(closures.length).toBeLessThanOrEqual(1);
    expect((await workoutsRepo.get(workout.id))?.status).toBe("completed");
  });
});

// ─── Cascade d'annulation ─────────────────────────────────────────────────

describe("Annulation — cascade complète, aucune donnée ni opération orpheline", () => {
  it("supprime séries, exercices ET segments de la séance, et rien d'autre", async () => {
    const { workout, exercise, sets } = await seedSession();
    await segmentsRepo.create(USER, {
      workout_id: workout.id,
      label: "Course 5 km",
    } as never);

    // Une autre séance, intacte : la cascade ne doit jamais déborder.
    const other = await workoutsRepo.create(USER, {
      name: "Pull Day",
      status: "completed",
      duration_minutes: 50,
    } as never);
    const otherExercise = await exercisesRepo.create(USER, {
      workout_id: other.id,
      name: "Tractions",
      sets: null,
      reps: null,
      weight: null,
    } as never);

    await cancelWorkout(workout.id);

    expect(await workoutsRepo.get(workout.id)).toBeUndefined();
    expect(await exercisesRepo.get(exercise.id)).toBeUndefined();
    for (const s of sets) expect(await setsRepo.get(s.id)).toBeUndefined();
    expect((await segmentsRepo.list(USER)).length).toBe(0);

    expect(await workoutsRepo.get(other.id)).toBeDefined();
    expect(await exercisesRepo.get(otherExercise.id)).toBeDefined();
  });

  it("aucune opération de synchronisation ne survit pour des lignes jamais parties au serveur", async () => {
    const { workout, exercise, sets } = await seedSession();
    await cancelWorkout(workout.id);

    const ops = await listAllOperations(USER);
    for (const id of [workout.id, exercise.id, ...sets.map((s) => s.id)]) {
      expect(
        ops.filter((op) => op.recordLocalId === id),
        `opérations restantes pour ${id}`,
      ).toEqual([]);
    }
  });
});

// ─── Séries : ajout / modification / suppression hors ligne ───────────────

describe("Séries — ajout, modification, suppression hors ligne", () => {
  it("une série ajoutée est visible immédiatement et enfilée pour la synchronisation", async () => {
    const { exercise } = await seedSession();
    const created = await addSet(exercise.id, { reps: 12, weight: 40 });

    const local = (await setsRepo.list(USER)).find((s) => s.id === created.id);
    expect(local).toMatchObject({ reps: 12, weight: 40, set_number: 3 });
    expect(opsFor(await listAllOperations(USER), "exercise_sets", created.id).length).toBe(1);
  });

  it("deux ajouts concurrents (double tap) ne partagent jamais le même numéro", async () => {
    const { exercise } = await seedSession();
    const [a, b] = await Promise.all([
      addSet(exercise.id, { reps: 10, weight: 60 }),
      addSet(exercise.id, { reps: 10, weight: 60 }),
    ]);
    expect(a.set_number).not.toBe(b.set_number);
  });

  it("une modification écrit la valeur métier, jamais la saisie brute", async () => {
    const { sets } = await seedSession();
    // Exactement ce que fait la carte d'exercice : la saisie passe d'abord par
    // `parseSetFieldInput`, seule une valeur exploitable atteint la mutation.
    const parsed = parseSetFieldInput("weight", "82,5");
    expect(parsed.kind).toBe("value");
    if (parsed.kind !== "value") throw new Error("saisie refusée à tort");
    await setsRepo.update(sets[0].id, USER, { weight: parsed.value, completed: true });

    const local = await setsRepo.get(sets[0].id);
    expect(local?.weight).toBe(82.5);
    expect(local?.completed).toBe(true);
  });

  it("une saisie inexploitable n'atteint JAMAIS le store — ni NaN, ni null par accident", async () => {
    const { sets } = await seedSession();
    const before = await setsRepo.get(sets[0].id);

    for (const raw of ["abc", "-5", "1e9"]) {
      const parsed = parseSetFieldInput("weight", raw);
      expect(parsed.kind, `saisie « ${raw} »`).toBe("invalid");
      // La carte n'appelle pas la mutation dans ce cas : rien n'est écrit.
    }

    const after = await setsRepo.get(sets[0].id);
    expect(after?.weight).toBe(before?.weight);
    expect(Number.isNaN(after?.weight as number)).toBe(false);
  });

  it("un champ VIDÉ efface bien la valeur (null explicite), et c'est le seul effacement possible", async () => {
    const { sets } = await seedSession();
    const parsed = parseSetFieldInput("weight", "");
    expect(parsed).toEqual({ kind: "cleared" });
    await setsRepo.update(sets[0].id, USER, { weight: null });
    expect((await setsRepo.get(sets[0].id))?.weight).toBeNull();
  });

  it("une suppression retire la série du store et n'en laisse aucune trace à envoyer", async () => {
    const { exercise } = await seedSession();
    const created = await addSet(exercise.id, { reps: 6, weight: 90 });
    await setsRepo.remove(created.id, USER);

    expect(await setsRepo.get(created.id)).toBeUndefined();
    expect((await setsRepo.list(USER)).some((s) => s.id === created.id)).toBe(false);
    expect(opsFor(await listAllOperations(USER), "exercise_sets", created.id)).toEqual([]);
  });
});

// ─── A2 — résumé des exercices à la clôture ───────────────────────────────

describe("A2 — résumé `exercises.sets/reps/weight` écrit à la clôture", () => {
  it("est calculé depuis le STORE LOCAL, y compris pour un exercice absent du cache d'écran", async () => {
    const { workout, exercise } = await seedSession();
    // Exercice ajouté juste avant « Terminer » : le cache React ne l'a pas
    // encore, le store local si. Avant le chantier 9, il n'avait aucun résumé.
    const tardif = await exercisesRepo.create(USER, {
      workout_id: workout.id,
      name: "Écarté poulie",
      sets: null,
      reps: null,
      weight: null,
    } as never);
    await addSet(tardif.id, { reps: 15, weight: 20 });

    await finishWorkout(workout.id);

    expect(await exercisesRepo.get(exercise.id)).toMatchObject({
      sets: 2,
      reps: 8,
      weight: 80,
    });
    expect(await exercisesRepo.get(tardif.id)).toMatchObject({
      sets: 1,
      reps: 15,
      weight: 20,
    });
  });

  it("un exercice sans série exploitable garde un résumé VIDE, jamais une valeur inventée", async () => {
    const { workout } = await seedSession();
    const vide = await exercisesRepo.create(USER, {
      workout_id: workout.id,
      name: "Gainage",
      sets: null,
      reps: null,
      weight: null,
    } as never);

    await finishWorkout(workout.id);

    expect(await exercisesRepo.get(vide.id)).toMatchObject({
      sets: null,
      reps: null,
      weight: null,
    });
  });

  it("n'enfile aucune opération inutile quand le résumé est déjà à jour", async () => {
    const { workout, exercise } = await seedSession();
    await finishWorkout(workout.id);
    const afterFirst = opsFor(await listAllOperations(USER), "exercises", exercise.id).length;

    // Deuxième clôture refusée par le verrou : aucune opération de plus.
    await finishWorkout(workout.id).catch(() => undefined);
    expect(opsFor(await listAllOperations(USER), "exercises", exercise.id).length).toBe(afterFirst);
  });
});
