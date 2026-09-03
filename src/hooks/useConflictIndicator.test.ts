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
 * CHANTIER 4 (AMEL-04) — visibilité des conflits hors de Profil.
 *
 * `useConflictIndicator` lit le même store partagé que le driver
 * (`lib/offline/syncRuntime.ts`), rafraîchi ici exactement comme le ferait
 * le driver (`refreshSyncRuntime`) : aucune donnée fabriquée, aucun second
 * mécanisme de lecture — seulement le nombre de conflits pour l'utilisateur
 * courant. Couvre les cas 9/10/11 du chantier : pas de conflit → pas
 * d'indicateur, un conflit → indicateur visible, résolution → il disparaît.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const authState = vi.hoisted(() => ({ current: { id: "user-1" } as { id: string } | null }));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: authState.current }),
}));

import { useConflictIndicator } from "./useConflictIndicator";
import { getOfflineDb, resetOfflineDbForTests } from "@/lib/offline/db";
import { refreshSyncRuntime, resetSyncRuntimeForTests } from "@/lib/offline/syncRuntime";
import type { ConflictRecord } from "@/lib/offline/types";

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

let container: HTMLDivElement;
let root: Root;
let lastValue: number | undefined;

function Probe() {
  lastValue = useConflictIndicator();
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

describe("useConflictIndicator", () => {
  it("cas 9 — aucun conflit → aucun indicateur", async () => {
    await act(async () => {
      await refreshSyncRuntime(USER);
    });
    render();
    expect(lastValue).toBe(0);
  });

  it("cas 10 — un conflit apparaît → indicateur visible", async () => {
    const db = await getOfflineDb();
    await db.put("conflicts", makeConflict("c-1"));

    await act(async () => {
      await refreshSyncRuntime(USER);
    });
    render();

    expect(lastValue).toBe(1);
  });

  it("cas 11 — le conflit résolu (supprimé du store) → l'indicateur disparaît", async () => {
    const db = await getOfflineDb();
    await db.put("conflicts", makeConflict("c-1"));
    await act(async () => {
      await refreshSyncRuntime(USER);
    });
    render();
    expect(lastValue).toBe(1);

    // `resolveConflict` (syncEngine.ts) supprime l'enregistrement une fois
    // arbitré — on reproduit ici exactement cet effet, sans réimplémenter
    // le moteur de résolution.
    await db.delete("conflicts", "c-1");
    await act(async () => {
      await refreshSyncRuntime(USER);
    });

    expect(lastValue).toBe(0);
  });

  it("aucun utilisateur connecté → 0, même si le store partagé porte des conflits", async () => {
    const db = await getOfflineDb();
    await db.put("conflicts", makeConflict("c-1"));
    await act(async () => {
      await refreshSyncRuntime(USER);
    });

    authState.current = null;
    render();

    expect(lastValue).toBe(0);
  });
});
