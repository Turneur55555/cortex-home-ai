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
 * CHANTIER « FIABILISATION DU MOTEUR OFFLINE » — boucles de retry.
 *
 * Deux problèmes de l'audit du 02/09/2026 sont verrouillés ici :
 *
 * - MAJ-01 — `PGRST116` pouvait encore boucler quand le `create` de
 *   l'enregistrement était BLOQUÉ. La garde « ligne serveur absente » laissait
 *   l'UPDATE repartir dès qu'un `create` existait dans la file, `blocked`
 *   compris — or une opération bloquée ne repart JAMAIS toute seule : la ligne
 *   n'apparaîtrait jamais, et l'UPDATE échouait en `PGRST116` à chaque
 *   passage, indéfiniment.
 *
 * - MIN-17 — `retryCount` n'était borné par rien. Toute erreur sans code
 *   Postgres (réseau, timeout, 5xx) laissait l'opération en `failed`, donc
 *   retentée éternellement : le backoff plafonne le RYTHME, pas le nombre
 *   d'essais.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface FailureControl {
  /** Erreur à renvoyer pour la prochaine écriture correspondante, ou `null`. */
  failWrite:
    | ((table: string, type: "upsert" | "update" | "delete", row: Row | null) => unknown)
    | null;
  /** Écritures réellement émises (pour prouver qu'une opération bloquée n'appelle plus le réseau). */
  writes: string[];
}

function createFakeSupabase(server: Map<string, Map<string, Row>>, control: FailureControl) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: unknown }> => {
        if (!op) {
          if (idFilter) return { data: store.get(idFilter) ?? null, error: null };
          return { data: Array.from(store.values()), error: null };
        }
        control.writes.push(`${op.type}:${table}:${idFilter ?? op.payload?.id ?? "?"}`);
        const injected = control.failWrite?.(table, op.type, (op.payload as Row) ?? null) ?? null;
        if (injected) return { data: null, error: injected };

        if (op.type === "upsert") {
          const row: Row = { ...(op.payload as Row), updated_at: new Date().toISOString() };
          store.set(row.id, row);
          return { data: row, error: null };
        }
        if (op.type === "update") {
          if (!idFilter || !store.has(idFilter)) {
            return {
              data: null,
              error: {
                message: "JSON object requested, multiple (or no) rows returned",
                code: "PGRST116",
                details: "The result contains 0 rows",
                hint: null,
              },
            };
          }
          const row: Row = {
            ...(store.get(idFilter) as Row),
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

const serverStore = new Map<string, Map<string, Row>>();
const control: FailureControl = { failWrite: null, writes: [] };

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase(serverStore, control);
  },
}));

import { resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import { listAllOperations, updateOperationStatus } from "./syncQueue";
import {
  listConflicts,
  MAX_RETRY_ATTEMPTS,
  processSyncQueue,
  retryBlockedOperation,
} from "./syncEngine";

const USER = "user-retry-bounds";

interface WorkoutRow extends Row {
  user_id: string;
  name: string;
  status: string;
}

const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");

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
  serverStore.clear();
  control.failWrite = null;
  control.writes = [];
  vi.restoreAllMocks();
});

/** Erreur réseau ordinaire : AUCUN code Postgres, donc jamais « définitive ». */
const NETWORK_ERROR = { message: "Failed to fetch" };
/** Erreur définitive identifiée (colonne inconnue du schema cache). */
const SCHEMA_ERROR = {
  message: "Could not find the 'foo' column of 'workouts' in the schema cache",
  code: "PGRST204",
};

describe("MIN-17 — le nombre de tentatives automatiques est borné", () => {
  it("une erreur temporaire finit par bloquer l'opération au lieu de boucler sans fin", async () => {
    const workout = await workoutsRepo.create(USER, { name: "Séance", status: "active" } as never);
    control.failWrite = () => NETWORK_ERROR;

    // Les tentatives normales ne changent PAS : l'opération reste `failed` et
    // repart à chaque passage, exactement comme avant…
    for (let pass = 1; pass < MAX_RETRY_ATTEMPTS; pass++) {
      const result = await processSyncQueue(USER);
      expect(result.retried).toBe(1);
      expect(result.blocked).toBe(0);
      const [op] = await listAllOperations(USER);
      expect(op.status).toBe("failed");
      expect(op.retryCount).toBe(pass);
    }

    // …jusqu'à la tentative de trop, qui la fige dans l'état de blocage DÉJÀ
    // existant du moteur.
    const last = await processSyncQueue(USER);
    expect(last.blocked).toBe(1);
    expect(last.retried).toBe(0);

    const [blocked] = await listAllOperations(USER);
    expect(blocked.status).toBe("blocked");
    expect(blocked.retryCount).toBe(MAX_RETRY_ATTEMPTS);
    // L'erreur RÉELLE reste visible dans le panneau de synchronisation…
    expect(blocked.lastError).toContain("Failed to fetch");
    // …complétée (jamais remplacée) par la raison du blocage.
    expect(blocked.lastError).toContain(`tentatives=${MAX_RETRY_ATTEMPTS}/${MAX_RETRY_ATTEMPTS}`);

    // Plus AUCUN appel réseau ensuite : la boucle est réellement terminée.
    control.writes = [];
    await processSyncQueue(USER);
    await processSyncQueue(USER);
    expect(control.writes).toEqual([]);
    // Et la donnée locale n'a pas bougé : rien n'est perdu.
    expect((await workoutsRepo.get(workout.id))?.name).toBe("Séance");
  });

  it("les retries NORMAUX ne sont pas cassés : un échec passager repart et aboutit", async () => {
    const workout = await workoutsRepo.create(USER, { name: "Séance", status: "active" } as never);
    let remainingFailures = 2;
    control.failWrite = () => (remainingFailures-- > 0 ? NETWORK_ERROR : null);

    await processSyncQueue(USER);
    await processSyncQueue(USER);
    expect((await listAllOperations(USER))[0].status).toBe("failed");

    const success = await processSyncQueue(USER);
    expect(success.succeeded).toBe(1);
    expect(await listAllOperations(USER)).toHaveLength(0);
    expect(serverStore.get("workouts")?.get(workout.id)?.name).toBe("Séance");
  });

  it("« Réessayer quand même » rend un budget de tentatives neuf (sinon l'action serait sans effet)", async () => {
    await workoutsRepo.create(USER, { name: "Séance", status: "active" } as never);
    control.failWrite = () => NETWORK_ERROR;
    for (let pass = 0; pass < MAX_RETRY_ATTEMPTS; pass++) await processSyncQueue(USER);
    const [blocked] = await listAllOperations(USER);
    expect(blocked.status).toBe("blocked");

    await retryBlockedOperation(blocked.id);
    const [requeued] = await listAllOperations(USER);
    expect(requeued.status).toBe("pending");
    expect(requeued.retryCount).toBe(0);
    // L'historique de diagnostic est conservé.
    expect(requeued.lastError).toContain("Failed to fetch");

    // La cause a disparu : l'opération repart vraiment (avant ce correctif,
    // elle aurait rebloqué au premier passage, sans aucune tentative).
    control.failWrite = null;
    const result = await processSyncQueue(USER);
    expect(result.succeeded).toBe(1);
  });

  it("une opération dont le compteur a été gonflé par les reprises d'orphelines est bloquée avant tout envoi", async () => {
    // `reclaimStaleSyncingOperations` incrémente `retryCount` à chaque reprise
    // (app fermée/rechargée en plein envoi) : ce chemin-là aussi doit finir
    // par s'arrêter. On simule l'état persisté correspondant.
    await workoutsRepo.create(USER, { name: "Séance", status: "active" } as never);
    const [op] = await listAllOperations(USER);
    await updateOperationStatus(op.id, {
      status: "pending",
      retryCount: MAX_RETRY_ATTEMPTS,
      lastError: "Synchronisation interrompue — reprise automatique.",
    });

    control.writes = [];
    const result = await processSyncQueue(USER);
    expect(result.blocked).toBe(1);
    expect(control.writes).toEqual([]); // bloquée AVANT tout appel réseau

    const [blocked] = await listAllOperations(USER);
    expect(blocked.status).toBe("blocked");
    expect(blocked.lastError).toContain("Synchronisation interrompue");
  });
});

describe("MAJ-01 — update sur une ligne absente dont le `create` est bloqué", () => {
  /**
   * Prépare l'état exact du bug : un `create` DÉFINITIVEMENT bloqué, et un
   * `update` séparé sur le même enregistrement (cas réel de la clôture de
   * séance, `neverMergeIntoPendingCreate`).
   */
  async function blockedCreateThenSeparateUpdate() {
    control.failWrite = (_table, type) => (type === "upsert" ? SCHEMA_ERROR : null);
    const workout = await workoutsRepo.create(USER, { name: "Séance", status: "active" } as never);
    const blockedPass = await processSyncQueue(USER);
    expect(blockedPass.blocked).toBe(1);
    expect((await listAllOperations(USER))[0].status).toBe("blocked");

    await workoutsRepo.update(workout.id, USER, { status: "completed" } as never, {
      neverMergeIntoPendingCreate: true,
    });
    control.failWrite = null;
    return workout;
  }

  it("devient un conflit explicite, jamais une boucle de retry PGRST116", async () => {
    const workout = await blockedCreateThenSeparateUpdate();

    const result = await processSyncQueue(USER);
    expect(result.conflicted).toBe(1);
    expect(result.retried).toBe(0);

    const [conflict] = await listConflicts(USER);
    expect(conflict.reason).toBe("server_row_deleted");
    expect(conflict.recordLocalId).toBe(workout.id);
    // La modification locale est intégralement conservée.
    expect((conflict.localData as { status: string }).status).toBe("completed");
    expect((await workoutsRepo.get(workout.id))?.status).toBe("completed");

    // Il ne reste que le `create` bloqué : l'`update` ne retente plus rien.
    const ops = await listAllOperations(USER);
    expect(ops).toHaveLength(1);
    expect(ops[0].opType).toBe("create");
    expect(ops[0].status).toBe("blocked");

    control.writes = [];
    const again = await processSyncQueue(USER);
    expect(again.retried).toBe(0);
    expect(again.conflicted).toBe(0);
    expect(control.writes).toEqual([]);
  });

  it("INCHANGÉ : tant que le `create` est encore VIVANT, l'update continue de l'attendre", async () => {
    // Même montage, mais le `create` échoue avec une erreur temporaire : il
    // repartira tout seul, donc la ligne finira par exister — ce n'est pas une
    // suppression, juste une course normale de la file FIFO.
    control.failWrite = (_table, type) => (type === "upsert" ? NETWORK_ERROR : null);
    const workout = await workoutsRepo.create(USER, { name: "Séance", status: "active" } as never);
    await processSyncQueue(USER);
    expect((await listAllOperations(USER))[0].status).toBe("failed");

    await workoutsRepo.update(workout.id, USER, { status: "completed" } as never, {
      neverMergeIntoPendingCreate: true,
    });

    // Passage avec le `create` toujours en échec : aucun conflit, l'update
    // échoue normalement et repartira.
    const blockedPass = await processSyncQueue(USER);
    expect(blockedPass.conflicted).toBe(0);
    expect(await listConflicts(USER)).toHaveLength(0);

    // Le réseau revient : `create` puis `update` aboutissent.
    control.failWrite = null;
    const recovery = await processSyncQueue(USER);
    expect(recovery.succeeded).toBe(2);
    expect(await listAllOperations(USER)).toHaveLength(0);
    expect(serverStore.get("workouts")?.get(workout.id)?.status).toBe("completed");
  });
});
