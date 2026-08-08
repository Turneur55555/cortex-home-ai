import { entityKey, getOfflineDb } from "./db";
import {
  enqueueOperation,
  findPendingCreateForRecord,
  removeOperation,
  updateOperationPayload,
} from "./syncQueue";
import type { OfflineEntity } from "./types";

/**
 * Repository layer générique offline-first. `createOfflineRepository<T>`
 * expose un CRUD qui écrit TOUJOURS d'abord dans IndexedDB (état local
 * `syncStatus: 'pending'`, reflété instantanément), PUIS enfile une
 * opération dans la sync queue — jamais d'appel réseau direct ici. Générique
 * : aucune dépendance à une table/un composant spécifique, réutilisable par
 * tous les modules (nutrition/recettes aujourd'hui, fitness/journal plus
 * tard).
 */

type BaseRow = {
  id: string;
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export interface OfflineRepository<T extends BaseRow> {
  /** Table locale (clé logique dans IndexedDB). */
  table: string;
  /** Table Supabase réelle correspondante. */
  supabaseTable: string;
  list(userId: string): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(userId: string, data: Omit<T, "id" | "user_id" | "created_at" | "updated_at">): Promise<T>;
  update(id: string, userId: string, patch: Partial<T>): Promise<T>;
  remove(id: string, userId: string): Promise<void>;
}

/** Registre table locale → table Supabase, consulté par `syncEngine.ts`. */
const tableRegistry = new Map<string, string>();

export function getSupabaseTableName(table: string): string {
  return tableRegistry.get(table) ?? table;
}

export function createOfflineRepository<T extends BaseRow>(
  table: string,
  supabaseTableName: string = table,
): OfflineRepository<T> {
  tableRegistry.set(table, supabaseTableName);

  async function readEntity(id: string): Promise<OfflineEntity<T> | undefined> {
    const db = await getOfflineDb();
    const entity = (await db.get("entities", entityKey(table, id))) as OfflineEntity<T> | undefined;
    return entity;
  }

  return {
    table,
    supabaseTable: supabaseTableName,

    async list(userId: string): Promise<T[]> {
      const db = await getOfflineDb();
      const entities = (await db.getAllFromIndex(
        "entities",
        "by-table-user",
        IDBKeyRange.only([table, userId]),
      )) as OfflineEntity<T>[];
      return entities.filter((e) => !e.deleted).map((e) => e.data);
    },

    async get(id: string): Promise<T | undefined> {
      const entity = await readEntity(id);
      if (!entity || entity.deleted) return undefined;
      return entity.data;
    },

    async create(userId, data): Promise<T> {
      const db = await getOfflineDb();
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const row = {
        ...data,
        id,
        user_id: userId,
        created_at: now,
        updated_at: now,
      } as unknown as T;

      const entity: OfflineEntity<T> = {
        key: entityKey(table, id),
        table,
        localId: id,
        userId,
        data: row,
        syncStatus: "pending",
        serverUpdatedAt: null,
        localUpdatedAt: now,
        deleted: false,
      };
      await db.put("entities", entity as OfflineEntity);

      await enqueueOperation<T>({
        userId,
        table,
        recordLocalId: id,
        opType: "create",
        payload: row,
        baseUpdatedAt: null,
      });

      return row;
    },

    async update(id, userId, patch): Promise<T> {
      const entity = await readEntity(id);
      if (!entity || entity.deleted) {
        throw new Error(`Offline update: entité introuvable (${table}/${id})`);
      }
      const now = new Date().toISOString();
      const newData = { ...entity.data, ...patch, updated_at: now } as T;
      const db = await getOfflineDb();
      const updatedEntity: OfflineEntity<T> = {
        ...entity,
        data: newData,
        localUpdatedAt: now,
        syncStatus: "pending",
      };
      await db.put("entities", updatedEntity as OfflineEntity);

      // Si une création n'a pas encore été synchronisée, fusionne le patch
      // dans SON payload plutôt que d'enfiler un `update` séparé — il
      // n'existe encore aucune ligne serveur à mettre à jour.
      const pendingCreate = await findPendingCreateForRecord(table, id);
      if (pendingCreate) {
        await updateOperationPayload(pendingCreate.id, newData);
      } else {
        await enqueueOperation<T>({
          userId,
          table,
          recordLocalId: id,
          opType: "update",
          payload: newData,
          baseUpdatedAt: entity.serverUpdatedAt,
        });
      }
      return newData;
    },

    async remove(id, userId): Promise<void> {
      const entity = await readEntity(id);
      if (!entity) return;
      const db = await getOfflineDb();

      const pendingCreate = await findPendingCreateForRecord(table, id);
      if (pendingCreate) {
        // Jamais synchronisée côté serveur : on efface tout, rien à envoyer.
        await db.delete("entities", entityKey(table, id));
        await removeOperation(pendingCreate.id);
        return;
      }

      const now = new Date().toISOString();
      const updatedEntity: OfflineEntity<T> = {
        ...entity,
        deleted: true,
        localUpdatedAt: now,
        syncStatus: "pending",
      };
      await db.put("entities", updatedEntity as OfflineEntity);

      await enqueueOperation<T>({
        userId,
        table,
        recordLocalId: id,
        opType: "delete",
        payload: null,
        baseUpdatedAt: entity.serverUpdatedAt,
      });
    },
  };
}

/**
 * Fusionne des lignes serveur dans le store local — utilisé à l'hydratation
 * initiale et après une synchronisation réussie. N'écrase JAMAIS un
 * enregistrement local qui a une modification non synchronisée
 * (`syncStatus: 'pending' | 'failed' | 'conflict'`) : ce cas relève du
 * conflict detector, pas d'un simple refresh.
 */
export async function hydrateEntitiesFromServer<T extends BaseRow>(
  table: string,
  userId: string,
  rows: T[],
): Promise<void> {
  const db = await getOfflineDb();
  const tx = db.transaction("entities", "readwrite");
  for (const row of rows) {
    const key = entityKey(table, row.id);
    const existing = await tx.store.get(key);
    if (existing && existing.syncStatus !== "synced") continue;
    const entity: OfflineEntity<T> = {
      key,
      table,
      localId: row.id,
      userId,
      data: row,
      syncStatus: "synced",
      serverUpdatedAt: row.updated_at ?? null,
      localUpdatedAt: row.updated_at ?? new Date().toISOString(),
      deleted: false,
    };
    await tx.store.put(entity as OfflineEntity);
  }
  await tx.done;
}
