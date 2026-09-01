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
import { QueryObserver, onlineManager, type QueryClient } from "@tanstack/react-query";
import { createAppQueryClient } from "@/lib/queryClient";
import { OFFLINE_FIRST_QUERY_OPTIONS, isOfflineFirstQuery } from "@/lib/offline/offlineQuery";

/**
 * CHANTIER 3 / CRIT-05 — non-régression du fonctionnement OFFLINE des
 * queries locales.
 *
 * Ces tests montent de VRAIES queries sur le VRAI `QueryClient` de l'app
 * (`createAppQueryClient`, la configuration utilisée par `src/router.tsx`)
 * et pilotent l'état réseau via `onlineManager` — exactement le mécanisme
 * que TanStack Query consulte pour mettre une query en pause. Ils vérifient
 * donc le comportement réel, pas une reproduction locale des règles.
 */

function installFakeIndexedDb() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.indexedDB = new IDBFactory();
  g.IDBKeyRange = IDBKeyRange;
  g.IDBCursor = IDBCursor;
  g.IDBCursorWithValue = IDBCursorWithValue;
  g.IDBDatabase = IDBDatabase;
  g.IDBIndex = IDBIndex;
  g.IDBObjectStore = IDBObjectStore;
  g.IDBOpenDBRequest = IDBOpenDBRequest;
  g.IDBRequest = IDBRequest;
  g.IDBTransaction = IDBTransaction;
  g.IDBVersionChangeEvent = IDBVersionChangeEvent;
}

/** Attend qu'un observer atteigne un état donné (ou échoue au bout de `timeoutMs`). */
async function waitFor(predicate: () => boolean, label: string, timeoutMs = 1_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`waitFor: ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("CRIT-05 — queries locales hors ligne", () => {
  let client: QueryClient;
  const unsubscribes: Array<() => void> = [];

  beforeEach(() => {
    installFakeIndexedDb();
    client = createAppQueryClient();
    // `mount()` = ce que fait `QueryClientProvider` dans l'app : c'est lui
    // qui abonne le cache à `onlineManager` (reprise des fetch en pause et
    // `refetchOnReconnect` au retour réseau).
    client.mount();
    onlineManager.setOnline(true);
  });

  afterEach(() => {
    for (const u of unsubscribes.splice(0)) u();
    client.unmount();
    client.clear();
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
  });

  function observe<T>(options: Record<string, unknown>) {
    const observer = new QueryObserver<T>(client, options as never);
    unsubscribes.push(observer.subscribe(() => undefined));
    return observer;
  }

  // ---------------------------------------------------------------- TEST 1
  it("TEST 1 — une query marquée offline-first s'exécute et rend ses données sans réseau", async () => {
    onlineManager.setOnline(false);
    const queryFn = vi.fn(async () => {
      // Représentant d'une `queryFn` offline-first : aucun appel réseau,
      // lecture directe du store local.
      return ["repas local"];
    });

    const observer = observe<string[]>({
      ...OFFLINE_FIRST_QUERY_OPTIONS,
      queryKey: ["test", "offline-first"],
      queryFn,
    });

    await waitFor(() => observer.getCurrentResult().status === "success", "success hors ligne");
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().data).toEqual(["repas local"]);
    expect(observer.getCurrentResult().fetchStatus).toBe("idle");
  });

  // ---------------------------------------------------------------- TEST 3
  it("TEST 3 — une query online-only NE tourne PAS hors ligne : elle reste en pause", async () => {
    onlineManager.setOnline(false);
    const queryFn = vi.fn(async () => "réponse serveur");

    const observer = observe<string>({
      queryKey: ["test", "online-only"],
      queryFn,
    });

    await waitFor(
      () => observer.getCurrentResult().fetchStatus === "paused",
      "mise en pause hors ligne",
    );
    // Le point important : la `queryFn` n'a JAMAIS été appelée — aucune
    // tentative réseau artificielle hors connexion.
    expect(queryFn).not.toHaveBeenCalled();
    expect(observer.getCurrentResult().status).toBe("pending");
  });

  // ---------------------------------------------------------------- TEST 4
  it("TEST 4 — retour réseau : la query online-only reprend, la query locale se rafraîchit", async () => {
    onlineManager.setOnline(false);

    let serverCalls = 0;
    const onlineOnly = observe<string>({
      queryKey: ["test", "reprise-online"],
      queryFn: async () => {
        serverCalls += 1;
        return `serveur#${serverCalls}`;
      },
    });

    let localReads = 0;
    const localFirst = observe<string>({
      ...OFFLINE_FIRST_QUERY_OPTIONS,
      queryKey: ["test", "reprise-locale"],
      staleTime: 0,
      queryFn: async () => {
        localReads += 1;
        return `local#${localReads}`;
      },
    });

    // Hors ligne : la locale a déjà servi, l'online-only est en pause.
    await waitFor(() => localFirst.getCurrentResult().status === "success", "locale servie");
    expect(localReads).toBe(1);
    expect(serverCalls).toBe(0);
    expect(onlineOnly.getCurrentResult().fetchStatus).toBe("paused");

    // Retour réseau.
    onlineManager.setOnline(true);

    await waitFor(() => serverCalls === 1, "reprise de la query online-only");
    expect(onlineOnly.getCurrentResult().data).toBe("serveur#1");
    // La query locale est elle aussi rafraîchie (refetchOnReconnect, défaut
    // conservé) — sans avoir jamais cessé de servir ses données locales.
    await waitFor(() => localReads === 2, "refetch de la query locale au retour réseau");
    expect(localFirst.getCurrentResult().data).toBe("local#2");
  });

  it("invalidation ciblée : le prédicat ne retient que les queries offline-first", async () => {
    const local = observe<string>({
      ...OFFLINE_FIRST_QUERY_OPTIONS,
      queryKey: ["test", "cible-locale"],
      queryFn: async () => "local",
    });
    const remote = observe<string>({
      queryKey: ["test", "cible-serveur"],
      queryFn: async () => "serveur",
    });
    await waitFor(
      () =>
        local.getCurrentResult().status === "success" &&
        remote.getCurrentResult().status === "success",
      "les deux queries ont abouti",
    );

    const matched = client
      .getQueryCache()
      .findAll({ predicate: isOfflineFirstQuery })
      .map((q) => q.queryKey);

    expect(matched).toEqual([["test", "cible-locale"]]);
  });

  it("la configuration globale du projet reste ONLINE-ONLY par défaut (mutations exceptées)", () => {
    const defaults = client.getDefaultOptions();
    // Défaut TanStack conservé pour les queries : online-only.
    expect(defaults.queries?.networkMode ?? "online").toBe("online");
    // Les mutations offline-first, elles, doivent toujours s'exécuter
    // (acquis du 28/08/2026 — repository → IndexedDB → sync queue).
    expect(defaults.mutations?.networkMode).toBe("always");
    // Le rafraîchissement au retour réseau reste au défaut (true) : c'est
    // lui qui refetch UNIQUEMENT les queries montées et périmées.
    expect(defaults.queries?.refetchOnReconnect ?? true).toBe(true);
  });
});
