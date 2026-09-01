import type { Database } from "@/integrations/supabase/types";
import { entityKey, getOfflineDb } from "./db";
import {
  enqueueOperation,
  findPendingCreateForRecord,
  listAllOperations,
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

/**
 * Contrat que TOUTE table branchée sur `createOfflineRepository` doit
 * respecter côté base (cf. `scripts/check-offline-repository-contract.mjs`
 * et le type `OfflineCompatibleTableName` ci-dessous) :
 *
 * - `id` (uuid) : généré côté CLIENT dès la création (jamais par la base),
 *   c'est lui qui porte l'idempotence du retry (`upsert onConflict: id`) ;
 * - `user_id` : scope obligatoire, aucune donnée offline n'est globale ;
 * - `created_at` : ajouté par `create()` à CHAQUE payload — une table qui ne
 *   l'a pas fait échouer tous ses `create` en PGRST204 (bug prod `exercises`
 *   du 29/08, puis `shopping_list`, cf. migrations
 *   20260829130000 / 20260831090000) ;
 * - `updated_at` : socle du conflict detector, doit être avancé par un
 *   trigger SERVEUR à chaque UPDATE (cf. migration 20260831091000).
 */
export const OFFLINE_CONTRACT_COLUMNS = ["id", "user_id", "created_at", "updated_at"] as const;

type PublicTables = Database["public"]["Tables"];

/**
 * Une ligne respecte le contrat si elle porte les 4 colonnes ET si ses deux
 * timestamps sont non-nullables (un `updated_at` nullable ne permettrait pas
 * de comparer des versions de façon fiable).
 */
type RowRespectsOfflineContract<R> = (typeof OFFLINE_CONTRACT_COLUMNS)[number] extends keyof R
  ? R extends { id: string; created_at: string; updated_at: string }
    ? true
    : false
  : false;

/**
 * GARDE-FOU DE TYPE (le vrai filet CI : `typecheck.yml` tourne sur toute PR
 * et tout push main) — seules les tables Supabase respectant le contrat
 * ci-dessus peuvent être passées à `createOfflineRepository`. Une table à
 * laquelle il manque `created_at`/`updated_at` (le bug `shopping_list` de
 * l'audit du 30/08) ne compile tout simplement plus : impossible de la
 * brancher SILENCIEUSEMENT sur le repository générique.
 *
 * La liste des tables valides est dérivée de `types.ts`, artefact généré
 * depuis la base (source de vérité unique, cf. CLAUDE.md +
 * `supabase-types.yml`) — aucune seconde liste à maintenir à la main.
 */
export type OfflineCompatibleTableName = {
  [K in keyof PublicTables]: RowRespectsOfflineContract<PublicTables[K]["Row"]> extends true
    ? K & string
    : never;
}[keyof PublicTables];

/**
 * Retire du patch les colonnes du contrat : elles sont soit immuables
 * (`id`, `user_id`, `created_at` — l'identité de la ligne ne se « met pas à
 * jour »), soit propriété exclusive du serveur (`updated_at`, avancé par le
 * trigger `set_updated_at` à chaque UPDATE — l'horloge d'un client resté
 * hors ligne n'a rien à y écrire).
 */
function stripContractColumns<T>(patch: Partial<T>): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if ((OFFLINE_CONTRACT_COLUMNS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Payload d'un `update` envoyé à Supabase : STRICTEMENT le patch demandé par
 * l'appelant, jamais l'entité complète.
 *
 * Avant (audit MAJ-01) : `update()` envoyait `{...entity.data, ...patch}`,
 * donc toute la ligne locale. Renommer une séance renvoyait aussi
 * `xp_before`/`xp_after`/`level_before`/`level_after` — colonnes calculées
 * par les triggers RPG serveur (`award_xp_on_workout_complete`) — avec les
 * valeurs locales, potentiellement périmées ou nulles : une modification
 * anodine pouvait effacer la progression RPG calculée côté serveur.
 * Maintenant, seules les colonnes réellement modifiées partent.
 */
export function buildUpdatePayload<T>(patch: Partial<T>): Partial<T> {
  return stripContractColumns(patch);
}

/**
 * Options d'un `update` (chantier 4, DISC-01). Générique : le repository ne
 * connaît toujours AUCUNE table ni AUCUNE colonne en particulier — c'est
 * l'appelant, seul à connaître la sémantique de son patch, qui déclare la
 * contrainte.
 */
export interface OfflineUpdateOptions {
  /**
   * N'AUTORISE PAS la fusion de ce patch dans un `create` encore en attente :
   * enfile une opération `update` SÉPARÉE, qui partira donc APRÈS tout ce qui
   * a été enfilé entre-temps (FIFO).
   *
   * POURQUOI CETTE OPTION EXISTE (DISC-01, mesuré)
   * ----------------------------------------------
   * Le comportement par défaut — fusionner — est le bon dans le cas général :
   * il n'existe aucune ligne serveur à mettre à jour, et cela évite une
   * opération inutile. Mais il change AUSSI le moment où le serveur observe
   * la valeur : au lieu d'un UPDATE tardif, elle arrive dans l'INSERT
   * initial, donc AVANT toutes les lignes enfilées après ce `create`.
   *
   * C'est indifférent pour une donnée passive, et FAUX pour une valeur qui
   * déclenche un calcul serveur portant sur des lignes liées. Cas réel : une
   * séance vécue entièrement hors ligne. La clôture (`status='completed'`)
   * fusionnée dans le `create` faisait arriver la séance en INSERT déjà
   * terminée, AVANT ses exercices et ses séries (FIFO) — le trigger
   * `award_xp_on_workout_complete` s'exécutait alors sur une séance vide et
   * ne versait ni XP de record, ni XP de progression d'exercice.
   *
   * L'appelant qui pose cette option affirme : « le serveur ne doit observer
   * ce patch qu'une fois les lignes liées arrivées ». Défaut `false` :
   * comportement de toutes les autres tables et de tous les autres appels
   * strictement INCHANGÉ.
   */
  neverMergeIntoPendingCreate?: boolean;
}

export interface OfflineRepository<T extends BaseRow> {
  /** Table locale (clé logique dans IndexedDB). */
  table: string;
  /** Table Supabase réelle correspondante. */
  supabaseTable: string;
  list(userId: string): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(userId: string, data: Omit<T, "id" | "user_id" | "created_at" | "updated_at">): Promise<T>;
  update(id: string, userId: string, patch: Partial<T>, options?: OfflineUpdateOptions): Promise<T>;
  remove(id: string, userId: string): Promise<void>;
}

/** Registre table locale → table Supabase, consulté par `syncEngine.ts`. */
const tableRegistry = new Map<string, string>();

export function getSupabaseTableName(table: string): string {
  return tableRegistry.get(table) ?? table;
}

export function createOfflineRepository<T extends BaseRow>(
  table: OfflineCompatibleTableName,
  supabaseTableName: OfflineCompatibleTableName = table,
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
      // `id` + `created_at` viennent du client PAR DESIGN : une ligne créée
      // hors ligne le lundi et synchronisée le vendredi doit garder sa vraie
      // date de création (le serveur, lui, ne peut que constater l'INSERT).
      // `updated_at` part avec la même valeur initiale, puis passe
      // définitivement sous contrôle du serveur (trigger `set_updated_at`,
      // cf. migration 20260831091000) — plus aucun `update` client ne le
      // renvoie, cf. `buildUpdatePayload`.
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

    async update(id, userId, patch, options): Promise<T> {
      const entity = await readEntity(id);
      if (!entity || entity.deleted) {
        throw new Error(`Offline update: entité introuvable (${table}/${id})`);
      }
      const now = new Date().toISOString();
      // Localement, l'entité reste une ligne COMPLÈTE (c'est ce que lisent
      // les écrans) — `updated_at` local sert d'horodatage optimiste en
      // attendant la valeur serveur renvoyée par la synchronisation.
      const newData = { ...entity.data, ...patch, updated_at: now } as T;
      // Vers le serveur, en revanche, on n'envoie QUE le patch demandé.
      const payload = buildUpdatePayload<T>(patch);
      const hasSyncableChange = Object.keys(payload).length > 0;

      // Si une création n'a pas encore été synchronisée, fusionne le patch
      // dans SON payload plutôt que d'enfiler un `update` séparé — il
      // n'existe encore aucune ligne serveur à mettre à jour. Le payload
      // d'un `create` reste volontairement la ligne complète : l'INSERT a
      // besoin de toutes les colonnes, et aucune valeur serveur n'existe
      // encore qui pourrait être écrasée.
      // `neverMergeIntoPendingCreate` (cf. OfflineUpdateOptions) : l'appelant
      // exige que le serveur n'observe ce patch qu'APRÈS les lignes enfilées
      // depuis la création — on ignore donc délibérément la fusion.
      const pendingCreate = options?.neverMergeIntoPendingCreate
        ? undefined
        : await findPendingCreateForRecord(table, id);

      const db = await getOfflineDb();
      const updatedEntity: OfflineEntity<T> = {
        ...entity,
        data: newData,
        localUpdatedAt: now,
        // Un patch qui ne touche QUE des colonnes du contrat n'a rien à
        // envoyer : le marquer `pending` laisserait l'entité bloquée dans cet
        // état sans opération correspondante dans la queue.
        syncStatus: pendingCreate || hasSyncableChange ? "pending" : entity.syncStatus,
      };
      await db.put("entities", updatedEntity as OfflineEntity);

      if (pendingCreate) {
        await updateOperationPayload(pendingCreate.id, newData);
      } else if (hasSyncableChange) {
        await enqueueOperation<Partial<T>>({
          userId,
          table,
          recordLocalId: id,
          opType: "update",
          payload,
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
        //
        // On retire TOUTES les opérations encore vivantes de cet
        // enregistrement, pas seulement le `create` (chantier 4, DISC-01) :
        // depuis `neverMergeIntoPendingCreate`, un `update` séparé peut
        // coexister avec un `create` pas encore parti. Ne retirer que le
        // `create` laisserait cet `update` orphelin, qui tenterait ensuite de
        // modifier une ligne que le serveur n'a jamais vue — échec en boucle.
        // Sans cette option, la file ne contient de toute façon que le
        // `create` (tout patch y est fusionné) : comportement identique.
        await db.delete("entities", entityKey(table, id));
        for (const op of await listAllOperations(userId)) {
          if (op.table === table && op.recordLocalId === id) {
            await removeOperation(op.id);
          }
        }
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
  table: OfflineCompatibleTableName,
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
