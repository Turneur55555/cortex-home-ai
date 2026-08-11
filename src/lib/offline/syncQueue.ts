import { getOfflineDb } from "./db";
import type { SyncOperation, SyncOpType } from "./types";

/**
 * Gestion de la file d'opérations en attente de synchronisation
 * (`syncQueue`). Chaque opération porte un id local stable — c'est ce qui
 * garantit l'idempotence : un retry après coupure réutilise le MÊME id
 * d'opération, et pour un `create`, le MÊME id d'enregistrement (généré
 * côté client, cf. `repository.ts`) → un upsert Supabase par id ne crée
 * jamais de doublon.
 */

export interface EnqueueOperationInput<T> {
  userId: string;
  table: string;
  recordLocalId: string;
  opType: SyncOpType;
  payload: T | null;
  baseUpdatedAt: string | null;
}

// `listPendingOperations` trie par `createdAt` pour garantir l'ordre FIFO
// entre opérations dépendantes (ex. le `create` d'un exercice avant le
// `create` de ses séries). `Date.now()` n'a qu'une précision milliseconde :
// plusieurs opérations enfilées dans la même milliseconde (rafale de taps,
// séquence synchrone rapide) auraient un `createdAt` identique, et le tri
// (stable) retomberait sur l'ordre renvoyé par l'index IndexedDB — trié par
// `userId` PUIS par la clé primaire `id` (uuid aléatoire), donc PAS l'ordre
// de création réel. Horloge monotone strictement croissante ci-dessous :
// chaque appel garantit un `createdAt` > au précédent, quel que soit
// `Date.now()`.
let lastEnqueuedAtMs = 0;

function nextMonotonicIsoTimestamp(): string {
  const now = Date.now();
  lastEnqueuedAtMs = now > lastEnqueuedAtMs ? now : lastEnqueuedAtMs + 1;
  return new Date(lastEnqueuedAtMs).toISOString();
}

export async function enqueueOperation<T>(
  input: EnqueueOperationInput<T>,
): Promise<SyncOperation<T>> {
  const db = await getOfflineDb();
  const op: SyncOperation<T> = {
    id: crypto.randomUUID(),
    userId: input.userId,
    table: input.table,
    recordLocalId: input.recordLocalId,
    opType: input.opType,
    payload: input.payload,
    baseUpdatedAt: input.baseUpdatedAt,
    createdAt: nextMonotonicIsoTimestamp(),
    status: "pending",
    retryCount: 0,
    lastError: null,
    lastAttemptAt: null,
  };
  await db.put("syncQueue", op as SyncOperation);
  return op;
}

/** File FIFO (par `createdAt`) des opérations pas encore terminées, pour un utilisateur donné. */
export async function listPendingOperations(userId: string): Promise<SyncOperation[]> {
  const db = await getOfflineDb();
  const all = await db.getAllFromIndex("syncQueue", "by-user", IDBKeyRange.only(userId));
  return all
    .filter((op) => op.status === "pending" || op.status === "failed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listAllOperations(userId: string): Promise<SyncOperation[]> {
  const db = await getOfflineDb();
  const all = await db.getAllFromIndex("syncQueue", "by-user", IDBKeyRange.only(userId));
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateOperationStatus(
  id: string,
  patch: Partial<Pick<SyncOperation, "status" | "retryCount" | "lastError" | "lastAttemptAt">>,
): Promise<void> {
  const db = await getOfflineDb();
  const existing = await db.get("syncQueue", id);
  if (!existing) return;
  await db.put("syncQueue", { ...existing, ...patch });
}

export async function removeOperation(id: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete("syncQueue", id);
}

/**
 * Retrouve une opération `create` encore en attente (pas encore envoyée avec
 * succès) pour un enregistrement donné. Utilisé par `repository.ts` pour
 * fusionner un `update`/`delete` local dans la création pas-encore-synchro
 * au lieu d'empiler une opération séparée qui référencerait un id inconnu
 * du serveur.
 */
export async function findPendingCreateForRecord(
  table: string,
  recordLocalId: string,
): Promise<SyncOperation | undefined> {
  const db = await getOfflineDb();
  const all = await db.getAll("syncQueue");
  return all.find(
    (op) =>
      op.table === table &&
      op.recordLocalId === recordLocalId &&
      op.opType === "create" &&
      (op.status === "pending" || op.status === "failed"),
  );
}

export async function updateOperationPayload<T>(id: string, payload: T): Promise<void> {
  const db = await getOfflineDb();
  const existing = await db.get("syncQueue", id);
  if (!existing) return;
  await db.put("syncQueue", { ...existing, payload } as SyncOperation);
}

export async function countPendingAndFailed(
  userId: string,
): Promise<{ pending: number; failed: number }> {
  const ops = await listAllOperations(userId);
  return {
    pending: ops.filter((op) => op.status === "pending" || op.status === "syncing").length,
    failed: ops.filter((op) => op.status === "failed").length,
  };
}
