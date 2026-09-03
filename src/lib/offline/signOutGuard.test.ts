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
 * CHANTIER 4 (MAJ-04) — logique de garde de la déconnexion.
 *
 * Couvre : la classification pure (rien à perdre / quelque chose à perdre),
 * le texte utilisateur, et — en intégration, avec le VRAI moteur offline
 * (`processSyncQueue` via `runSyncQueueOnce`, jamais un second moteur) — que
 * « Synchroniser d'abord » résorbe réellement ce qui peut l'être et laisse
 * intact ce qui attend une décision utilisateur (bloqué / conflit).
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

const serverStore = new Map<string, Map<string, Row>>();

function createFakeSupabase() {
  return {
    from(table: string) {
      if (!serverStore.has(table)) serverStore.set(table, new Map());
      const store = serverStore.get(table) as Map<string, Row>;
      let op: { type: "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: unknown }> => {
        if (!op) {
          if (idFilter) return { data: store.get(idFilter) ?? null, error: null };
          return { data: Array.from(store.values()), error: null };
        }
        if (op.type === "upsert") {
          const row: Row = { ...(op.payload as Row), updated_at: new Date().toISOString() };
          store.set(row.id, row);
          return { data: row, error: null };
        }
        if (op.type === "update") {
          const existing = idFilter ? store.get(idFilter) : undefined;
          if (!existing) {
            return {
              data: null,
              error: { message: "0 rows", code: "PGRST116", details: null, hint: null },
            };
          }
          const row: Row = {
            ...existing,
            ...(op.payload as Row),
            updated_at: new Date().toISOString(),
          };
          store.set(row.id, row);
          return { data: row, error: null };
        }
        if (idFilter) store.delete(idFilter);
        return { data: null, error: null };
      };

      const builder: Record<string, unknown> = {
        select: () => builder,
        eq(col: string, val: string) {
          if (col === "id") idFilter = val;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        upsert(payload: Row) {
          op = { type: "upsert", payload };
          return builder;
        },
        update(payload: Row) {
          op = { type: "update", payload };
          return builder;
        },
        delete() {
          op = { type: "delete" };
          return builder;
        },
        maybeSingle: () => exec(),
        single: () => exec(),
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

const USER = "user-signout-guard";

import { resetOfflineDbForTests } from "@/lib/offline/db";
import { createOfflineRepository } from "@/lib/offline/repository";
import { getOfflineDb } from "@/lib/offline/db";
import { listAllOperations } from "@/lib/offline/syncQueue";
import { resetSyncRuntimeForTests } from "@/lib/offline/syncRuntime";
import {
  attemptSyncBeforeSignOut,
  describeUnresolvedOfflineWork,
  getOfflineSignOutSummary,
  hasUnresolvedOfflineWork,
} from "@/lib/offline/signOutGuard";
import type { ConflictRecord, SyncOperation } from "@/lib/offline/types";

interface ExerciseRow extends Row {
  user_id: string;
  workout_id: string;
  name: string;
}

const exercisesRepo = createOfflineRepository<ExerciseRow>("exercises");

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
  resetSyncRuntimeForTests();
  serverStore.clear();
});

describe("hasUnresolvedOfflineWork — classification pure", () => {
  it("rien en attente → rien à perdre", () => {
    expect(
      hasUnresolvedOfflineWork({
        pendingCount: 0,
        failedCount: 0,
        blockedCount: 0,
        conflictCount: 0,
      }),
    ).toBe(false);
  });

  it.each(["pendingCount", "failedCount", "blockedCount", "conflictCount"] as const)(
    "%s > 0 → quelque chose à perdre",
    (field) => {
      expect(
        hasUnresolvedOfflineWork({
          pendingCount: 0,
          failedCount: 0,
          blockedCount: 0,
          conflictCount: 0,
          [field]: 1,
        }),
      ).toBe(true);
    },
  );
});

describe("describeUnresolvedOfflineWork — vocabulaire utilisateur", () => {
  it("ne mentionne jamais de terme technique", () => {
    const lines = describeUnresolvedOfflineWork({
      pendingCount: 1,
      failedCount: 1,
      blockedCount: 1,
      conflictCount: 1,
    });
    const text = lines.join(" ");
    expect(text).not.toMatch(/updated_at_mismatch|server_row_deleted|syncQueue|blocked|pending/i);
  });

  it("une seule ligne par catégorie réellement présente", () => {
    const lines = describeUnresolvedOfflineWork({
      pendingCount: 2,
      failedCount: 0,
      blockedCount: 0,
      conflictCount: 0,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("2 actions en attente d'envoi");
  });
});

describe("attemptSyncBeforeSignOut — réutilise le moteur existant", () => {
  it("résorbe une opération pending résolvable, sommaire final à zéro", async () => {
    const exercise = await exercisesRepo.create(USER, {
      workout_id: "w-1",
      name: "Développé couché",
    } as never);
    expect(await listAllOperations(USER)).toHaveLength(1);

    const summary = await attemptSyncBeforeSignOut(USER);

    expect(summary).toEqual({
      pendingCount: 0,
      failedCount: 0,
      blockedCount: 0,
      conflictCount: 0,
    });
    expect(await listAllOperations(USER)).toHaveLength(0);
    expect(serverStore.get("exercises")?.get(exercise.id)?.name).toBe("Développé couché");
  });

  it("une opération bloquée reste bloquée — jamais considérée comme synchronisée", async () => {
    const db = await getOfflineDb();
    const blockedOp: SyncOperation = {
      id: "op-blocked-1",
      userId: USER,
      table: "exercises",
      recordLocalId: "ex-blocked",
      opType: "update",
      payload: { name: "Squat" },
      baseUpdatedAt: null,
      createdAt: new Date().toISOString(),
      status: "blocked",
      retryCount: 10,
      lastError: "Colonne inconnue",
      lastErrorCode: "PGRST204",
      lastAttemptAt: new Date().toISOString(),
    };
    await db.put("syncQueue", blockedOp);

    const summary = await attemptSyncBeforeSignOut(USER);

    expect(summary.blockedCount).toBe(1);
    expect(hasUnresolvedOfflineWork(summary)).toBe(true);
  });

  it("un conflit non résolu reste un conflit — jamais synchronisé par une passe", async () => {
    const db = await getOfflineDb();
    const conflict: ConflictRecord = {
      id: "conflict-1",
      userId: USER,
      table: "exercises",
      recordLocalId: "ex-conflict",
      opType: "update",
      reason: "updated_at_mismatch",
      localData: { name: "Local" },
      serverData: { name: "Serveur" },
      localUpdatedAt: new Date().toISOString(),
      serverUpdatedAt: new Date().toISOString(),
      detectedAt: new Date().toISOString(),
    };
    await db.put("conflicts", conflict);

    const summary = await attemptSyncBeforeSignOut(USER);

    expect(summary.conflictCount).toBe(1);
    expect(hasUnresolvedOfflineWork(summary)).toBe(true);
  });
});

describe("cas de course — la file peut changer pendant l'ouverture du dialogue", () => {
  it("une opération ajoutée après le premier sommaire est quand même résorbée par « Synchroniser d'abord »", async () => {
    // Sommaire initial (celui qui ouvre le dialogue) : une seule opération.
    const first = await exercisesRepo.create(USER, {
      workout_id: "w-1",
      name: "Développé couché",
    } as never);
    const initialSummary = await getOfflineSignOutSummary(USER);
    expect(initialSummary.pendingCount).toBe(1);

    // Pendant que le dialogue est affiché, une SECONDE opération est
    // enfilée (l'utilisateur continue d'utiliser l'app dans un autre onglet,
    // ou la barrière de dépendance en a créé une). `attemptSyncBeforeSignOut`
    // ne se fie jamais au sommaire déjà affiché : il relit l'état réel.
    const second = await exercisesRepo.create(USER, {
      workout_id: "w-1",
      name: "Rowing",
    } as never);
    expect(await listAllOperations(USER)).toHaveLength(2);

    const finalSummary = await attemptSyncBeforeSignOut(USER);

    expect(finalSummary).toEqual({
      pendingCount: 0,
      failedCount: 0,
      blockedCount: 0,
      conflictCount: 0,
    });
    expect(serverStore.get("exercises")?.get(first.id)?.name).toBe("Développé couché");
    expect(serverStore.get("exercises")?.get(second.id)?.name).toBe("Rowing");
  });

  it("une synchronisation déjà en vol (déclenchée ailleurs) est attendue avant de relire l'état", async () => {
    await exercisesRepo.create(USER, { workout_id: "w-1", name: "Traction" } as never);

    // Simule le driver qui a déjà lancé sa propre passe au même instant
    // (poll périodique) : `runSyncQueueOnce` renvoie alors `null` pour le
    // premier appelant. `attemptSyncBeforeSignOut` ne doit pas s'en contenter
    // — il doit patienter puis relire un état réellement à jour.
    const { runSyncQueueOnce } = await import("@/lib/offline/syncRuntime");
    const concurrentPass = runSyncQueueOnce(USER);

    const summary = await attemptSyncBeforeSignOut(USER);
    await concurrentPass;

    expect(hasUnresolvedOfflineWork(summary)).toBe(false);
    expect(await listAllOperations(USER)).toHaveLength(0);
  });
});

describe("getOfflineSignOutSummary — lecture directe, sans effet de bord", () => {
  it("aucune opération, aucun conflit → sommaire vide", async () => {
    const summary = await getOfflineSignOutSummary(USER);
    expect(summary).toEqual({
      pendingCount: 0,
      failedCount: 0,
      blockedCount: 0,
      conflictCount: 0,
    });
  });
});
