import { beforeEach, describe, expect, it } from "vitest";
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
import { resetOfflineDbForTests } from "./db";
import {
  enqueueOperation,
  findAwaitedCreateForRecord,
  findPendingCreateForRecord,
  rebasePendingOperationsForRecord,
} from "./syncQueue";

/**
 * MIN-01 (audit du 04/09/2026, chantier 6) — isolation par utilisateur de la
 * sync queue.
 *
 * Constat de départ : `findAwaitedCreateForRecord`, `findPendingCreateForRecord`
 * et `rebasePendingOperationsForRecord` appelaient `db.getAll("syncQueue")` —
 * la file COMPLÈTE, tous comptes confondus sur cet appareil — puis filtraient
 * seulement par `table`/`recordLocalId`, sans jamais vérifier `userId`. Le
 * reste du module (`listPendingOperations`, `listAllOperations`,
 * `reclaimStaleSyncingOperations`, `hasOtherQueuedOperations`) est, lui,
 * scopé par l'index `by-user` — ces trois fonctions en étaient l'exception.
 *
 * Sans conséquence pratique observable tant que `recordLocalId` reste un UUID
 * v4 aléatoire (collision infinitésimale entre deux comptes), mais un
 * appareil partagé qui a vu passer plusieurs comptes accumule des opérations
 * de CHACUN dans le même store IndexedDB (`purgeUserOfflineData` les retire à
 * la déconnexion, mais rien ne garantit qu'elle a toujours eu lieu avant que
 * ces fonctions soient appelées) : ces trois lectures ne doivent JAMAIS
 * pouvoir renvoyer, fusionner dans, ou recaler une opération d'un AUTRE
 * utilisateur.
 *
 * Ces tests verrouillent l'isolation : deux comptes partagent le même store
 * `syncQueue`, avec un `recordLocalId` volontairement IDENTIQUE sur la même
 * `table` (le pire cas, même si irréaliste avec des UUID v4 réels) — aucune
 * des trois fonctions ne doit jamais traverser la frontière utilisateur.
 */

const TABLE = "exercises";
const SHARED_RECORD_ID = "record-shared-across-accounts";
const USER_A = "user-a";
const USER_B = "user-b";

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

describe("MIN-01 — isolation de la sync queue entre utilisateurs", () => {
  it("findPendingCreateForRecord ne renvoie jamais le `create` d'un AUTRE utilisateur, même sur le même enregistrement/table", async () => {
    // Un appareil partagé : le `create` de A n'a pas encore été purgé quand
    // B est déjà connecté et écrit sur un enregistrement de MÊME id/table.
    const createA = await enqueueOperation({
      userId: USER_A,
      table: TABLE,
      recordLocalId: SHARED_RECORD_ID,
      opType: "create",
      payload: { owner: "A" },
      baseUpdatedAt: null,
    });

    const foundForB = await findPendingCreateForRecord(USER_B, TABLE, SHARED_RECORD_ID);
    expect(foundForB).toBeUndefined();

    const foundForA = await findPendingCreateForRecord(USER_A, TABLE, SHARED_RECORD_ID);
    expect(foundForA?.id).toBe(createA.id);
  });

  it("findAwaitedCreateForRecord ne considère jamais un `create` vivant d'un AUTRE utilisateur comme une raison d'attendre", async () => {
    await enqueueOperation({
      userId: USER_A,
      table: TABLE,
      recordLocalId: SHARED_RECORD_ID,
      opType: "create",
      payload: { owner: "A" },
      baseUpdatedAt: null,
    });

    // Pour B, ce `create` n'existe pas — la garde PGRST116 du sync engine ne
    // doit pas rester bloquée à attendre l'opération d'un autre compte.
    const awaitedForB = await findAwaitedCreateForRecord(USER_B, TABLE, SHARED_RECORD_ID);
    expect(awaitedForB).toBeUndefined();
  });

  it("rebasePendingOperationsForRecord ne recale jamais le baseUpdatedAt d'une opération d'un AUTRE utilisateur", async () => {
    await enqueueOperation({
      userId: USER_A,
      table: TABLE,
      recordLocalId: SHARED_RECORD_ID,
      opType: "create",
      payload: { owner: "A" },
      baseUpdatedAt: null,
    });
    const updateB = await enqueueOperation({
      userId: USER_B,
      table: TABLE,
      recordLocalId: SHARED_RECORD_ID,
      opType: "update",
      payload: { note: "B" },
      baseUpdatedAt: "2020-01-01T00:00:00.000Z",
    });

    const baseUpdatedAtBeforeB = updateB.baseUpdatedAt;

    // Un recalage déclenché pour A (ex. après le succès d'une de ses
    // opérations) ne doit toucher QUE la file de A — ici son propre `create`
    // (comptabilisé, même si un `create` n'a jamais de base à recaler) —
    // jamais l'`update` de B, alors même qu'il partage le même couple
    // table/recordLocalId.
    const touchedForA = await rebasePendingOperationsForRecord({
      userId: USER_A,
      table: TABLE,
      recordLocalId: SHARED_RECORD_ID,
      baseUpdatedAt: "2030-01-01T00:00:00.000Z",
    });
    expect(touchedForA).toBe(1); // le `create` de A lui-même, rien d'autre

    // L'opération de B n'a pas bougé d'un iota.
    const afterA = await findPendingCreateForRecord(USER_B, TABLE, SHARED_RECORD_ID);
    expect(afterA).toBeUndefined(); // B n'a pas de `create` — jamais halluciné depuis A

    const opsForB = await rebasePendingOperationsForRecord({
      userId: USER_B,
      table: TABLE,
      recordLocalId: SHARED_RECORD_ID,
      baseUpdatedAt: baseUpdatedAtBeforeB,
      excludeOperationId: updateB.id, // on exclut B pour ne rien réécrire, juste vérifier qu'il est bien seul dans son scope
    });
    expect(opsForB).toBe(0); // l'`update` de B est le SEUL candidat de son scope, et il est exclu ici
  });
});
