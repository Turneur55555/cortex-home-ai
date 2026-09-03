// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
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
 * CRIT-01 — LE MOTEUR OFFLINE TOURNE HORS DE L'ÉCRAN PROFIL.
 *
 * Avant : les effets du moteur (poll, reprise au retour réseau, appel à
 * `processSyncQueue`) vivaient dans `useOfflineSync`, hook consommé par le
 * SEUL bloc « Synchronisation » du Profil. Une action faite hors ligne
 * pendant une séance restait donc en file tant que l'utilisateur n'ouvrait
 * pas ses paramètres.
 *
 * Ce test d'intégration reproduit exactement ce scénario — SANS jamais monter
 * `SyncStatusCard`, `SyncQueueSheet` ni quoi que ce soit du Profil : seul
 * `<OfflineSyncDriver />` est rendu, comme il l'est dans
 * `routes/_authenticated.tsx`. Aucun navigateur réel n'est nécessaire :
 * IndexedDB est fourni par `fake-indexeddb` et Supabase par un faux client.
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

const USER = "user-driver";

// Seule dépendance réellement hors de portée d'un test unitaire : la session.
// Le statut réseau, lui, reste RÉEL (`navigator.onLine` + events `online`),
// puisque c'est précisément le déclencheur qu'on veut vérifier.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: USER }, session: null, loading: false }),
}));

import { OfflineSyncDriver } from "./OfflineSyncDriver";
import { resetOfflineDbForTests } from "@/lib/offline/db";
import { createOfflineRepository } from "@/lib/offline/repository";
import { listAllOperations } from "@/lib/offline/syncQueue";
import { resetSyncRuntimeForTests } from "@/lib/offline/syncRuntime";

// React 19 : sans ce drapeau, `act()` avertit à chaque rendu.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface ExerciseRow extends Row {
  user_id: string;
  workout_id: string;
  name: string;
}

const exercisesRepo = createOfflineRepository<ExerciseRow>("exercises");

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mountDriver(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  root = createRoot(container);
  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <OfflineSyncDriver />
      </QueryClientProvider>,
    );
  });
}

function unmountDriver(): void {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
}

/** Laisse les promesses (IndexedDB + faux réseau) se dérouler. */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Attend qu'une condition asynchrone se réalise (chaîne IndexedDB → faux réseau). */
async function waitFor(predicate: () => boolean | Promise<boolean>, label: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  throw new Error(`waitFor: condition jamais satisfaite (${label})`);
}

/**
 * Faux timers RESTREINTS au seul `setInterval` du driver : `fake-indexeddb`
 * s'appuie sur les macrotâches réelles (`setTimeout`/`setImmediate`) pour
 * résoudre ses transactions — les figer bloquerait tout le test.
 */
function usePollTimers(): void {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
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
  serverStore.clear();
  setOnline(true);
});

describe("CRIT-01 — driver global du moteur offline", () => {
  it("une opération enfilée hors ligne, écran Profil JAMAIS monté, part au retour du réseau", async () => {
    // 1. HORS LIGNE — l'utilisateur est en séance, pas dans ses paramètres.
    setOnline(false);
    const exercise = await exercisesRepo.create(USER, {
      workout_id: "w-1",
      name: "Développé couché",
    } as never);
    expect(await listAllOperations(USER)).toHaveLength(1);

    // 2. LE MOTEUR GLOBAL EST ACTIF — seul le driver est monté : aucun
    //    composant du Profil (`SyncStatusCard`, `SyncQueueSheet`) n'existe
    //    dans cet arbre.
    mountDriver();
    await flush();
    // Toujours hors ligne : rien n'est parti, l'opération est intacte.
    expect(serverStore.get("exercises")?.has(exercise.id)).toBeFalsy();
    expect(await listAllOperations(USER)).toHaveLength(1);

    // 3. LE RÉSEAU REVIENT (événement réel `online`).
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await flush();

    // 4. L'OPÉRATION A ÉTÉ TRAITÉE — sans qu'aucune UI de synchronisation
    //    n'ait jamais été montée.
    await waitFor(
      async () => (await listAllOperations(USER)).length === 0,
      "l'opération quitte la file après le retour du réseau",
    );
    expect(serverStore.get("exercises")?.get(exercise.id)?.name).toBe("Développé couché");

    unmountDriver();
  });

  it("le balayage périodique tourne aussi hors du Profil (filet de sécurité, sans event `online`)", async () => {
    usePollTimers();
    try {
      mountDriver();
      await flush();

      // Écriture faite APRÈS le montage, alors que `navigator.onLine` n'a
      // jamais basculé : seul le poll du driver peut la faire partir.
      const exercise = await exercisesRepo.create(USER, {
        workout_id: "w-1",
        name: "Rowing",
      } as never);
      expect(serverStore.get("exercises")?.has(exercise.id)).toBeFalsy();

      await act(async () => {
        vi.advanceTimersByTime(4_000);
      });
      await flush();

      await waitFor(
        async () => (await listAllOperations(USER)).length === 0,
        "l'opération quitte la file après un tick du balayage périodique",
      );
      expect(serverStore.get("exercises")?.get(exercise.id)?.name).toBe("Rowing");

      unmountDriver();
    } finally {
      vi.useRealTimers();
    }
  });

  it("démonté, le driver n'entretient plus aucune boucle (aucun timer résiduel)", async () => {
    usePollTimers();
    try {
      mountDriver();
      await flush();
      unmountDriver();

      const exercise = await exercisesRepo.create(USER, {
        workout_id: "w-1",
        name: "Orphelin",
      } as never);
      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });
      await flush();

      // Personne ne pilote plus le moteur : l'opération reste en file (elle
      // repartira au prochain montage). C'est la preuve que le poll observé
      // au test précédent vient bien du driver, et de rien d'autre.
      expect(serverStore.get("exercises")?.has(exercise.id)).toBeFalsy();
      expect(await listAllOperations(USER)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
