import { describe, expect, it } from "vitest";
import { listBlockedDependencies } from "./syncQueue";
import type { SyncOperation } from "./types";

/**
 * CHANTIER 8 (A1, volet 2) — DÉCOUVRABILITÉ D'UNE OPÉRATION RETENUE PAR LA
 * BARRIÈRE DE DÉPENDANCE.
 *
 * Une opération `blocked` reste volontairement une dépendance VIVANTE
 * (`LIVE_OPERATION_STATUSES`) : la retirer laisserait partir une clôture de
 * séance alors que ses enfants ne sont jamais arrivés, et le trigger
 * `award_xp_on_workout_complete` s'exécuterait UNE SEULE FOIS sur une séance
 * incomplète — la régression DISC-01b, irréversible.
 *
 * Le défaut n'était donc pas la barrière, mais le fait que RIEN ne reliait
 * « ma séance ne se synchronise pas » à « cette action-là est bloquée ».
 * L'issue existe pourtant déjà et ne supprime aucune donnée : « Réessayer
 * quand même » ou « Retirer de la file » (`retryBlockedOperation` /
 * `discardBlockedOperation`, qui conserve toujours la donnée métier locale).
 *
 * Ce prédicat est PUR : il travaille sur la file déjà chargée par le panneau
 * de synchronisation, sans relire IndexedDB.
 */

function op(overrides: Partial<SyncOperation> & Pick<SyncOperation, "id">): SyncOperation {
  return {
    userId: "user-1",
    table: "exercise_sets",
    recordLocalId: "record-1",
    opType: "create",
    payload: null,
    baseUpdatedAt: null,
    createdAt: "2026-09-05T10:00:00.000Z",
    status: "pending",
    retryCount: 0,
    lastError: null,
    lastAttemptAt: null,
    ...overrides,
  };
}

const closure = op({
  id: "closure",
  table: "workouts",
  recordLocalId: "workout-1",
  opType: "update",
  createdAt: "2026-09-05T10:00:05.000Z",
  dependsOnRecords: [
    { table: "exercises", recordLocalId: "ex-1" },
    { table: "exercise_sets", recordLocalId: "set-1" },
  ],
});

describe("listBlockedDependencies", () => {
  it("renvoie l'opération bloquée qui retient réellement cette opération", () => {
    const blocked = op({
      id: "blocked-set",
      recordLocalId: "set-1",
      status: "blocked",
      createdAt: "2026-09-05T10:00:01.000Z",
    });
    expect(listBlockedDependencies(closure, [blocked, closure])).toEqual([blocked]);
  });

  it("ignore une dépendance encore vivante mais NON bloquée (elle repartira seule)", () => {
    const failed = op({
      id: "failed-set",
      recordLocalId: "set-1",
      status: "failed",
      createdAt: "2026-09-05T10:00:01.000Z",
    });
    expect(listBlockedDependencies(closure, [failed, closure])).toEqual([]);
  });

  it("ignore une opération bloquée sur un enregistrement NON déclaré", () => {
    const unrelated = op({
      id: "blocked-nutrition",
      table: "nutrition",
      recordLocalId: "meal-1",
      status: "blocked",
      createdAt: "2026-09-05T10:00:01.000Z",
    });
    expect(listBlockedDependencies(closure, [unrelated, closure])).toEqual([]);
  });

  it("la table fait partie de l'identité : même id, autre table → pas de dépendance", () => {
    const sameIdOtherTable = op({
      id: "blocked-other-table",
      table: "workout_segments",
      recordLocalId: "set-1",
      status: "blocked",
      createdAt: "2026-09-05T10:00:01.000Z",
    });
    expect(listBlockedDependencies(closure, [sameIdOtherTable, closure])).toEqual([]);
  });

  it("ignore une opération bloquée POSTÉRIEURE (même règle d'antériorité que la barrière)", () => {
    const later = op({
      id: "blocked-later",
      recordLocalId: "set-1",
      status: "blocked",
      createdAt: "2026-09-05T10:00:09.000Z",
    });
    expect(listBlockedDependencies(closure, [later, closure])).toEqual([]);
  });

  it("ne se compte jamais elle-même", () => {
    const selfBlocked = { ...closure, status: "blocked" as const };
    expect(listBlockedDependencies(selfBlocked, [selfBlocked])).toEqual([]);
  });

  it("renvoie une liste vide pour une opération sans dépendance déclarée", () => {
    const plain = op({ id: "plain", status: "pending" });
    const blocked = op({ id: "blocked-set", recordLocalId: "set-1", status: "blocked" });
    expect(listBlockedDependencies(plain, [plain, blocked])).toEqual([]);
  });

  it("remonte TOUTES les dépendances bloquées, pas seulement la première", () => {
    const blockedExercise = op({
      id: "blocked-exercise",
      table: "exercises",
      recordLocalId: "ex-1",
      status: "blocked",
      createdAt: "2026-09-05T10:00:01.000Z",
    });
    const blockedSet = op({
      id: "blocked-set",
      recordLocalId: "set-1",
      status: "blocked",
      createdAt: "2026-09-05T10:00:02.000Z",
    });
    expect(listBlockedDependencies(closure, [blockedExercise, blockedSet, closure])).toEqual([
      blockedExercise,
      blockedSet,
    ]);
  });
});
