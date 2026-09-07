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
 * CHANTIER FINAL (AUD-11) — pas de passe de queue quand il n'y a RIEN à
 * synchroniser.
 *
 * Le driver appelle `runSyncQueueOnce` toutes les 4 secondes, en permanence.
 * File vide — l'état normal d'une application à jour — cela produisait deux
 * lectures IndexedDB et une bascule `isSyncing` true → false, donc un
 * re-rendu de TOUT ce qui lit le store partagé (la barre de navigation
 * comprise), quinze fois par minute, pour rien.
 *
 * Ce qui est vérifié ici :
 * - une file sans opération traitable ne déclenche AUCUN appel au moteur ;
 * - le store partagé n'émet alors AUCUN changement ;
 * - dès qu'une opération traitable existe, la passe repart normalement ;
 * - la valeur de retour reste un RÉSULTAT (jamais `null`) — `signOutGuard`
 *   distingue les deux, et lui renvoyer `null` rallongerait chaque
 *   déconnexion propre de 1,5 s.
 */

const processSyncQueueSpy = vi.hoisted(() => vi.fn());

vi.mock("./syncEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./syncEngine")>();
  return {
    ...actual,
    processSyncQueue: (...args: Parameters<typeof actual.processSyncQueue>) => {
      processSyncQueueSpy(...args);
      return actual.processSyncQueue(...args);
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from() {
      throw new Error("réseau indisponible (test)");
    },
  },
}));

import { getOfflineDb, resetOfflineDbForTests } from "./db";
import {
  resetSyncRuntimeForTests,
  runSyncQueueOnce,
  subscribeSyncRuntime,
  getSyncRuntimeSnapshot,
} from "./syncRuntime";
import { attemptSyncBeforeSignOut } from "./signOutGuard";
import type { SyncOperation, SyncOpStatus } from "./types";

const USER = "user-aud11";

function makeOperation(id: string, status: SyncOpStatus): SyncOperation {
  return {
    id,
    userId: USER,
    table: "workouts",
    recordLocalId: `rec-${id}`,
    opType: "update",
    payload: { name: "Push Day" },
    baseUpdatedAt: null,
    createdAt: new Date().toISOString(),
    status,
    retryCount: 0,
    lastError: null,
    lastErrorCode: null,
    lastAttemptAt: status === "syncing" ? new Date().toISOString() : null,
  } as SyncOperation;
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
  resetSyncRuntimeForTests();
  processSyncQueueSpy.mockClear();
});

describe("AUD-11 — file vide : aucune passe inutile", () => {
  it("file vide → le moteur n'est jamais appelé", async () => {
    await runSyncQueueOnce(USER);
    expect(processSyncQueueSpy).not.toHaveBeenCalled();
  });

  it("file vide → le store partagé n'émet AUCUN changement (pas de re-rendu)", async () => {
    let notifications = 0;
    const unsubscribe = subscribeSyncRuntime(() => {
      notifications += 1;
    });

    await runSyncQueueOnce(USER);
    await runSyncQueueOnce(USER);
    await runSyncQueueOnce(USER);

    unsubscribe();
    expect(notifications).toBe(0);
    expect(getSyncRuntimeSnapshot().isSyncing).toBe(false);
  });

  it("file vide → renvoie un RÉSULTAT à zéro, jamais `null`", async () => {
    const result = await runSyncQueueOnce(USER);
    expect(result).not.toBeNull();
    expect(result).toEqual({
      succeeded: 0,
      conflicted: 0,
      retried: 0,
      blocked: 0,
      remapped: 0,
      skipped: 0,
      reclaimed: 0,
    });
  });

  it("`signOutGuard` ne boucle pas sur une file vide (le piège du `null`)", async () => {
    // `ensureFreshSyncPass` (interne à signOutGuard) réessaie 10 fois à
    // 150 ms d'intervalle tant que `runSyncQueueOnce` renvoie `null`. Sur une
    // file vide, « Synchroniser d'abord » doit rester immédiat — d'où le
    // résultat à zéro plutôt que `null`.
    const started = Date.now();
    const summary = await attemptSyncBeforeSignOut(USER);
    expect(Date.now() - started).toBeLessThan(150);
    expect(summary).toEqual({
      pendingCount: 0,
      failedCount: 0,
      blockedCount: 0,
      conflictCount: 0,
    });
  });

  it.each(["pending", "failed", "syncing"] as const)(
    "une opération `%s` → la passe repart normalement",
    async (status) => {
      const db = await getOfflineDb();
      await db.put("syncQueue", makeOperation("op-1", status));

      await runSyncQueueOnce(USER);

      expect(processSyncQueueSpy).toHaveBeenCalledTimes(1);
    },
  );

  it("une opération BLOQUÉE seule ne réveille pas le moteur (elle attend une décision)", async () => {
    const db = await getOfflineDb();
    await db.put("syncQueue", makeOperation("op-1", "blocked"));

    await runSyncQueueOnce(USER);

    // `processSyncQueue` ne traite pas les `blocked` : une passe n'aurait
    // rien fait. « Réessayer quand même » la repasse en `pending` — et le
    // test ci-dessous vérifie que la passe repart alors bien.
    expect(processSyncQueueSpy).not.toHaveBeenCalled();

    await db.put("syncQueue", makeOperation("op-1", "pending"));
    await runSyncQueueOnce(USER);
    expect(processSyncQueueSpy).toHaveBeenCalledTimes(1);
  });

  it("le verrou de passe unique est pris SANS `await` préalable", async () => {
    // Régression réelle rencontrée en écrivant AUD-11 : placer la lecture de
    // la file AVANT l'affectation de `runningPass` laissait deux appelants
    // franchir le test du verrou pendant que l'autre attendait l'IndexedDB —
    // la seconde affectation écrasait la première et « une seule passe en
    // vol » ne tenait plus. `signOutGuard` s'appuie précisément dessus pour
    // distinguer SA passe de celle du driver.
    const db = await getOfflineDb();
    await db.put("syncQueue", makeOperation("op-1", "pending"));

    const first = runSyncQueueOnce(USER);
    // Sans aucun `await` intercalé : le second appelant doit déjà voir le
    // verrou pris.
    const second = runSyncQueueOnce(USER);

    await expect(second).resolves.toBeNull();
    await first;
    expect(processSyncQueueSpy).toHaveBeenCalledTimes(1);
  });

  it("la file d'un AUTRE utilisateur ne réveille pas la passe de celui-ci", async () => {
    const db = await getOfflineDb();
    await db.put("syncQueue", { ...makeOperation("op-1", "pending"), userId: "quelqu-un-dautre" });

    await runSyncQueueOnce(USER);

    expect(processSyncQueueSpy).not.toHaveBeenCalled();
  });
});
