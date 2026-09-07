// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
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
 * CHANTIER 4 (AMEL-04), étendu par le CHANTIER FINAL (AUD-05) — visibilité,
 * hors de Profil, de ce qui attend une décision de l'utilisateur.
 *
 * `useSyncAttentionIndicator` lit le même store partagé que le driver
 * (`lib/offline/syncRuntime.ts`), rafraîchi ici exactement comme le ferait
 * le driver (`refreshSyncRuntime`) : aucune donnée fabriquée, aucun second
 * mécanisme de lecture, aucune nouvelle boucle de poll. Couvre les cas
 * 9/10/11 du chantier 4 (pas de conflit → pas d'indicateur, un conflit →
 * indicateur visible, résolution → il disparaît) ET l'extension AUD-05 : une
 * opération `blocked` — celle qui retient la clôture d'une séance, donc sa
 * récompense XP — allume le même signal, tandis que `pending`/`failed`, qui
 * se résorbent seules, ne l'allument jamais.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const authState = vi.hoisted(() => ({ current: { id: "user-1" } as { id: string } | null }));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: authState.current }),
}));

import { useSyncAttentionIndicator } from "./useSyncAttentionIndicator";
import { getOfflineDb, resetOfflineDbForTests } from "@/lib/offline/db";
import { refreshSyncRuntime, resetSyncRuntimeForTests } from "@/lib/offline/syncRuntime";
import type { ConflictRecord, SyncOperation } from "@/lib/offline/types";

const USER = "user-1";

function makeConflict(id: string): ConflictRecord {
  return {
    id,
    userId: USER,
    table: "exercises",
    recordLocalId: `rec-${id}`,
    opType: "update",
    reason: "updated_at_mismatch",
    localData: {},
    serverData: {},
    localUpdatedAt: new Date().toISOString(),
    serverUpdatedAt: new Date().toISOString(),
    detectedAt: new Date().toISOString(),
  };
}

function makeOperation(id: string, status: SyncOperation["status"]): SyncOperation {
  return {
    id,
    userId: USER,
    table: "workouts",
    recordLocalId: `rec-${id}`,
    opType: "update",
    payload: {},
    status,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    lastError: null,
    lastErrorCode: null,
    lastAttemptAt: null,
  } as SyncOperation;
}

let container: HTMLDivElement;
let root: Root;
let lastValue: ReturnType<typeof useSyncAttentionIndicator> | undefined;

function Probe() {
  lastValue = useSyncAttentionIndicator();
  return null;
}

function render() {
  act(() => {
    root.render(createElement(Probe));
  });
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
  authState.current = { id: USER };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useSyncAttentionIndicator", () => {
  it("cas 9 — aucun conflit → aucun indicateur", async () => {
    await act(async () => {
      await refreshSyncRuntime(USER);
    });
    render();
    expect(lastValue?.total).toBe(0);
  });

  it("cas 10 — un conflit apparaît → indicateur visible", async () => {
    const db = await getOfflineDb();
    await db.put("conflicts", makeConflict("c-1"));

    await act(async () => {
      await refreshSyncRuntime(USER);
    });
    render();

    expect(lastValue?.total).toBe(1);
  });

  it("cas 11 — le conflit résolu (supprimé du store) → l'indicateur disparaît", async () => {
    const db = await getOfflineDb();
    await db.put("conflicts", makeConflict("c-1"));
    await act(async () => {
      await refreshSyncRuntime(USER);
    });
    render();
    expect(lastValue?.total).toBe(1);

    // `resolveConflict` (syncEngine.ts) supprime l'enregistrement une fois
    // arbitré — on reproduit ici exactement cet effet, sans réimplémenter
    // le moteur de résolution.
    await db.delete("conflicts", "c-1");
    await act(async () => {
      await refreshSyncRuntime(USER);
    });

    expect(lastValue?.total).toBe(0);
  });

  it("AUD-05 — une opération BLOQUÉE allume le même signal qu'un conflit", async () => {
    const db = await getOfflineDb();
    await db.put("syncQueue", makeOperation("op-1", "blocked"));

    await act(async () => {
      await refreshSyncRuntime(USER);
    });
    render();

    expect(lastValue?.blockedCount).toBe(1);
    expect(lastValue?.conflictCount).toBe(0);
    expect(lastValue?.total).toBe(1);
  });

  it("AUD-05 — conflit ET opération bloquée s'additionnent", async () => {
    const db = await getOfflineDb();
    await db.put("conflicts", makeConflict("c-1"));
    await db.put("syncQueue", makeOperation("op-1", "blocked"));
    await db.put("syncQueue", makeOperation("op-2", "blocked"));

    await act(async () => {
      await refreshSyncRuntime(USER);
    });
    render();

    expect(lastValue).toEqual({ conflictCount: 1, blockedCount: 2, total: 3 });
  });

  it("AUD-05 — `pending` et `failed` n'allument JAMAIS le signal (elles se résorbent seules)", async () => {
    const db = await getOfflineDb();
    await db.put("syncQueue", makeOperation("op-1", "pending"));
    await db.put("syncQueue", makeOperation("op-2", "failed"));
    await db.put("syncQueue", makeOperation("op-3", "syncing"));

    await act(async () => {
      await refreshSyncRuntime(USER);
    });
    render();

    expect(lastValue?.total).toBe(0);
  });

  it("AUD-05 — l'opération débloquée (retirée de la file) éteint le signal", async () => {
    const db = await getOfflineDb();
    await db.put("syncQueue", makeOperation("op-1", "blocked"));
    await act(async () => {
      await refreshSyncRuntime(USER);
    });
    render();
    expect(lastValue?.total).toBe(1);

    // « Retirer de la file » (`discardBlockedOperation`) supprime
    // l'opération : on reproduit son effet, sans réimplémenter le moteur.
    await db.delete("syncQueue", "op-1");
    await act(async () => {
      await refreshSyncRuntime(USER);
    });

    expect(lastValue?.total).toBe(0);
  });

  it("aucun utilisateur connecté → 0, même si le store partagé porte des conflits", async () => {
    const db = await getOfflineDb();
    await db.put("conflicts", makeConflict("c-1"));
    await act(async () => {
      await refreshSyncRuntime(USER);
    });

    authState.current = null;
    render();

    expect(lastValue?.total).toBe(0);
  });
});
