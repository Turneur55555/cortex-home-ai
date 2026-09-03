import type { Database } from "@/integrations/supabase/types";
import { entityKey, getOfflineDb } from "./db";
import {
  enqueueOperation,
  findPendingCreateForRecord,
  listAllOperations,
  removeOperation,
  updateOperationPayload,
} from "./syncQueue";
import type { OfflineEntity, SyncDependencyRef } from "./types";

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

  /**
   * PASSE-PLAT vers `SyncOperation.dependsOnRecords` (barrière de dépendance
   * du moteur de file, chantier 1 bis). Le repository ne l'interprète pas et
   * ne la calcule pas : il la transmet telle quelle à `enqueueOperation`.
   * La connaissance métier « quels enregistrements sont les enfants de
   * celui-ci » appartient à l'appelant (pour les séances :
   * `lib/fitness/workoutSyncDependencies.ts`).
   *
   * Complément indissociable de `neverMergeIntoPendingCreate` pour une
   * écriture qui déclenche un calcul serveur portant sur des lignes liées :
   * la première option garantit que le patch part APRÈS les enfants dans
   * l'ORDRE de la file, la seconde qu'il n'est pas ENVOYÉ tant que ces
   * enfants n'ont pas RÉUSSI (un échec réseau ou un `blocked` sur un enfant
   * ne suffit pas à interrompre la file, cf. DISC-01b).
   *
   * N'a d'effet que sur une opération `update` réellement enfilée : si le
   * patch est fusionné dans un `create` en attente (comportement par défaut),
   * il n'y a pas d'opération distincte à retenir. Les deux options vont donc
   * ensemble.
   */
  dependsOnRecords?: SyncDependencyRef[];
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
      // Vers le serveur, on n'envoie QUE le patch demandé, débarrassé des
      // colonnes du contrat (immuables ou propriété du serveur).
      const payload = buildUpdatePayload<T>(patch);
      const hasSyncableChange = Object.keys(payload).length > 0;

      // MIN-16 (chantier 3) — UNE MODIFICATION SANS CONTENU SYNCHRONISABLE
      // NE DOIT RIEN AVANCER DU TOUT.
      //
      // Avant : un patch ne portant que des colonnes du contrat (`{}`,
      // `{ updated_at }`, `{ id }`…) réécrivait quand même l'entité avec
      // `data.updated_at = now()` ET `localUpdatedAt = now()`, alors
      // qu'AUCUNE opération n'était enfilée. Le store local se retrouvait
      // donc à affirmer une version (`updated_at` local, plus récent que
      // `serverUpdatedAt`) que le serveur ne verrait JAMAIS, puisque rien
      // n'était envoyé — et `localUpdatedAt`, qui est précisément
      // l'horodatage présenté à l'utilisateur comme « votre version » dans
      // l'arbitrage de conflit (`ConflictRecord.localUpdatedAt`), désignait
      // une modification qui n'existe pas.
      //
      // Maintenant : sans changement réellement synchronisable, `update()`
      // est un NO-OP strict — aucune écriture IndexedDB, aucun timestamp
      // avancé, aucun changement de `syncStatus`, y compris quand une
      // création est encore en attente (il n'y a alors rien de plus à
      // fusionner dans son payload : les colonnes du contrat y sont déjà,
      // et elles sont immuables). Une modification RÉELLEMENT
      // synchronisable, elle, avance le timestamp local exactement comme
      // avant — c'est la seule chose qui doit le faire.
      if (!hasSyncableChange) return entity.data;

      const now = new Date().toISOString();
      // Localement, l'entité reste une ligne COMPLÈTE (c'est ce que lisent
      // les écrans) — `updated_at` local sert d'horodatage optimiste en
      // attendant la valeur serveur renvoyée par la synchronisation.
      // On applique le patch DÉBARRASSÉ des colonnes du contrat : ce qui
      // n'a pas le droit de partir vers le serveur n'a pas davantage le
      // droit de réécrire l'identité de la ligne en local (`id`,
      // `user_id`, `created_at`) ni de doubler l'horloge serveur.
      const newData = { ...entity.data, ...payload, updated_at: now } as T;

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
        // À ce stade il y a forcément quelque chose à synchroniser — le cas
        // « rien à envoyer » est sorti plus haut par le no-op strict.
        syncStatus: "pending",
      };
      await db.put("entities", updatedEntity as OfflineEntity);

      if (pendingCreate) {
        await updateOperationPayload(pendingCreate.id, newData);
      } else {
        await enqueueOperation<Partial<T>>({
          userId,
          table,
          recordLocalId: id,
          opType: "update",
          payload,
          baseUpdatedAt: entity.serverUpdatedAt,
          dependsOnRecords: options?.dependsOnRecords,
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
 * CHANTIER 3 — MAJ-03 : options de RÉCONCILIATION DES SUPPRESSIONS SERVEUR.
 *
 * L'hydratation est additive par défaut, et doit le rester : une ligne
 * absente d'une réponse serveur n'est PAS une preuve de suppression. Elle
 * peut manquer parce que la réponse est paginée, tronquée par la limite
 * `max-rows` de PostgREST, filtrée (fenêtre d'historique, RLS), ou parce que
 * la requête a partiellement échoué. Supprimer sur cette base détruirait des
 * données utilisateur — interdit (cf. `docs/architecture/offline-data-integrity.md`).
 *
 * `reconcileWithin` est le SEUL moyen d'autoriser une suppression locale, et
 * c'est une AFFIRMATION FORTE de l'appelant :
 *
 *   « `rows` contient TOUTES les lignes serveur de cette table, pour cet
 *     utilisateur, qui satisfont ce prédicat — j'ai la preuve que le jeu de
 *     données est complet et borné. »
 *
 * Cette preuve ne peut venir que du site d'appel (c'est lui qui connaît la
 * requête, sa pagination et ses filtres). Elle repose aujourd'hui sur le
 * TOTAL EXACT annoncé par la base (`count: "exact"`), jamais sur une
 * heuristique de taille de réponse — « moins de lignes que demandé » ne
 * distingue pas « fin du jeu de données » de « réponse tronquée par le
 * `max-rows` du serveur », et cette distinction autorise des suppressions.
 * Deux formes utilisées aujourd'hui, cf.
 * `use-fitness.ts::fetchWorkoutsIntoLocalStore` :
 *   - « le nombre de séances reçues ATTEINT le total exact » → le jeu est
 *     complet pour cet utilisateur ;
 *   - « j'ai demandé les enfants d'une liste EXPLICITE de parents, page par
 *     page jusqu'à atteindre leur total exact, sans aucune erreur » → le jeu
 *     est complet pour ces parents-là, et le prédicat borne la
 *     réconciliation à eux.
 *
 * Même avec cette affirmation, la fonction ne supprime une ligne locale que
 * si TOUTES ces conditions sont réunies :
 *   1. elle est `synced` — aucune modification locale non confirmée
 *      (`pending`/`failed`/`conflict` sont laissées intactes : elles relèvent
 *      de la file et du conflict detector, jamais d'un refresh) ;
 *   2. aucune opération ne la vise encore dans la sync queue (ceinture et
 *      bretelles : une opération vivante sur un enregistrement `synced` est
 *      anormale, mais on ne prend pas le risque) ;
 *   3. elle n'est pas déjà marquée supprimée localement ;
 *   4. elle tombe dans le périmètre prouvé complet (`reconcileWithin`).
 */
export interface HydrationOptions<T> {
  /**
   * Périmètre PROUVÉ COMPLET par l'appelant — prédicat évalué sur la ligne
   * LOCALE. Absent (cas par défaut) : hydratation strictement additive,
   * aucune suppression locale, comportement historique inchangé.
   */
  reconcileWithin?: (row: T) => boolean;
}

export interface HydrationResult {
  /**
   * Ids des enregistrements locaux retirés parce que prouvés absents du
   * serveur. Vide si `reconcileWithin` n'était pas fourni. Permet à
   * l'appelant d'étendre le périmètre de réconciliation aux ENFANTS de ces
   * lignes (un enfant dont le parent a disparu du serveur a disparu avec lui
   * — `ON DELETE CASCADE`).
   */
  removedLocalIds: string[];
}

/**
 * Fusionne des lignes serveur dans le store local — utilisé à l'hydratation
 * initiale et après une synchronisation réussie. N'écrase JAMAIS un
 * enregistrement local qui a une modification non synchronisée
 * (`syncStatus: 'pending' | 'failed' | 'conflict'`) : ce cas relève du
 * conflict detector, pas d'un simple refresh.
 *
 * Additive par défaut. Voir `HydrationOptions.reconcileWithin` pour le seul
 * cas où une suppression locale est autorisée (MAJ-03).
 */
export async function hydrateEntitiesFromServer<T extends BaseRow>(
  table: OfflineCompatibleTableName,
  userId: string,
  rows: T[],
  options?: HydrationOptions<T>,
): Promise<HydrationResult> {
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

  const reconcileWithin = options?.reconcileWithin;
  if (!reconcileWithin) return { removedLocalIds: [] };

  // Lu AVANT d'ouvrir la transaction de réconciliation : `listAllOperations`
  // ouvre sa propre transaction sur `syncQueue`, l'imbriquer bloquerait.
  const queuedRecordIds = new Set(
    (await listAllOperations(userId))
      .filter((op) => op.table === table)
      .map((op) => op.recordLocalId),
  );
  const serverIds = new Set(rows.map((row) => row.id));

  const removedLocalIds: string[] = [];
  const reconcileTx = db.transaction("entities", "readwrite");
  const locals = (await reconcileTx.store
    .index("by-table-user")
    .getAll(IDBKeyRange.only([table, userId]))) as OfflineEntity<T>[];
  for (const local of locals) {
    if (local.syncStatus !== "synced") continue;
    if (local.deleted) continue;
    if (serverIds.has(local.localId)) continue;
    if (queuedRecordIds.has(local.localId)) continue;
    if (!reconcileWithin(local.data)) continue;
    await reconcileTx.store.delete(local.key ?? entityKey(table, local.localId));
    removedLocalIds.push(local.localId);
  }
  await reconcileTx.done;

  return { removedLocalIds };
}
