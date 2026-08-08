import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ConflictRecord, OfflineEntity, SyncOperation } from "./types";

/**
 * Base IndexedDB générique de l'architecture offline-first. Un seul schéma
 * partagé par tous les modules (nutrition/recettes aujourd'hui, fitness/
 * journal plus tard) — pas de base par module, pour garder une seule sync
 * queue et un seul mécanisme de conflit à travers l'app.
 *
 * Toutes les données sont scopées par `userId` (index composé
 * `[table+userId]`) — jamais de fuite entre comptes, cf. `purgeUserData`
 * appelé au changement de compte (voir `syncEngine.ts` / `use-auth.tsx`).
 */

const DB_NAME = "cortex-offline";
const DB_VERSION = 1;

interface CortexOfflineDB extends DBSchema {
  entities: {
    key: string; // `${table}::${localId}`
    value: OfflineEntity;
    indexes: {
      "by-table-user": [string, string]; // [table, userId]
      "by-sync-status": string;
    };
  };
  syncQueue: {
    key: string; // opération.id
    value: SyncOperation;
    indexes: {
      "by-status": string;
      "by-user": string;
    };
  };
  conflicts: {
    key: string; // conflit.id
    value: ConflictRecord;
    indexes: {
      "by-user": string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<CortexOfflineDB>> | null = null;

export function getOfflineDb(): Promise<IDBPDatabase<CortexOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CortexOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("entities")) {
          const store = db.createObjectStore("entities", { keyPath: "key" });
          store.createIndex("by-table-user", ["table", "userId"]);
          store.createIndex("by-sync-status", "syncStatus");
        }
        if (!db.objectStoreNames.contains("syncQueue")) {
          const store = db.createObjectStore("syncQueue", { keyPath: "id" });
          store.createIndex("by-status", "status");
          store.createIndex("by-user", "userId");
        }
        if (!db.objectStoreNames.contains("conflicts")) {
          const store = db.createObjectStore("conflicts", { keyPath: "id" });
          store.createIndex("by-user", "userId");
        }
      },
    });
  }
  return dbPromise;
}

/** Réservé aux tests : force la réouverture de la base (nouvelle instance fake-indexeddb par test). */
export function resetOfflineDbForTests(): void {
  dbPromise = null;
}

export function entityKey(table: string, localId: string): string {
  return `${table}::${localId}`;
}

/**
 * Purge intégrale des données offline d'un utilisateur — appelée au
 * changement de compte (signOut) pour ne jamais laisser les données du
 * compte précédent visibles/synchronisables pour le suivant sur le même
 * appareil.
 */
export async function purgeUserOfflineData(userId: string): Promise<void> {
  const db = await getOfflineDb();

  const entityTx = db.transaction("entities", "readwrite");
  let cursor = await entityTx.store.index("by-table-user").openCursor();
  while (cursor) {
    if (cursor.value.userId === userId) await cursor.delete();
    cursor = await cursor.continue();
  }
  await entityTx.done;

  const queueTx = db.transaction("syncQueue", "readwrite");
  let queueCursor = await queueTx.store.index("by-user").openCursor(IDBKeyRange.only(userId));
  while (queueCursor) {
    await queueCursor.delete();
    queueCursor = await queueCursor.continue();
  }
  await queueTx.done;

  const conflictTx = db.transaction("conflicts", "readwrite");
  let conflictCursor = await conflictTx.store.index("by-user").openCursor(IDBKeyRange.only(userId));
  while (conflictCursor) {
    await conflictCursor.delete();
    conflictCursor = await conflictCursor.continue();
  }
  await conflictTx.done;
}

/** Purge tout (tous comptes) — utilitaire de test uniquement. */
export async function clearAllOfflineDataForTests(): Promise<void> {
  const db = await getOfflineDb();
  await db.clear("entities");
  await db.clear("syncQueue");
  await db.clear("conflicts");
}
