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
 * Robustesse de la sync queue (chantier « Sync Queue » de l'audit du
 * 30/08/2026) : récupération des opérations orphelines restées en `syncing`
 * après une interruption (CRIT-01), protection contre deux instances qui
 * traitent la même opération, conservation du type d'opération dans un
 * conflit (MAJ-05), erreurs réellement visibles (MAJ-11) et blocage effectif
 * des erreurs Postgres non retryables.
 *
 * Même harnais que `offlineSync.test.ts` : `fake-indexeddb` + un faux
 * client Supabase en mémoire.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface PgLikeError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

interface FakeSupabaseOptions {
  /** Fait échouer la PROCHAINE requête d'écriture avec cette erreur. */
  failNextWith?: PgLikeError | null;
}

function createFakeSupabase(server: Map<string, Map<string, Row>>, opts: FakeSupabaseOptions) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: PgLikeError | null }> => {
        // Une lecture (détection de conflit) n'est jamais l'objet du
        // scénario d'échec : seules les écritures consomment `failNextWith`.
        if (op && opts.failNextWith) {
          const error = opts.failNextWith;
          opts.failNextWith = null;
          return { data: null, error };
        }
        if (!op) {
          if (idFilter) return { data: store.get(idFilter) ?? null, error: null };
          return { data: Array.from(store.values()), error: null };
        }
        if (op.type === "upsert") {
          const row = { ...(op.payload as Row) };
          store.set(row.id, row);
          return { data: row, error: null };
        }
        if (op.type === "update") {
          if (!idFilter || !store.has(idFilter)) {
            return { data: null, error: { message: "row not found" } };
          }
          const existing = store.get(idFilter) as Row;
          const updated: Row = {
            ...existing,
            ...(op.payload as Row),
            updated_at: new Date().toISOString(),
          };
          store.set(idFilter, updated);
          return { data: updated, error: null };
        }
        if (idFilter) store.delete(idFilter);
        return { data: null, error: null };
      };

      const builder = {
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
const fakeSupabaseOpts: FakeSupabaseOptions = {};

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase(serverStore, fakeSupabaseOpts);
  },
}));

// Imports après le mock (obligatoire avec vi.mock hoisté).
import { entityKey, getOfflineDb, resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import {
  claimOperation,
  listAllOperations,
  reclaimStaleSyncingOperations,
  STALE_SYNCING_MS,
} from "./syncQueue";
import {
  discardBlockedOperation,
  listConflicts,
  processSyncQueue,
  resolveConflict,
  retryBlockedOperation,
} from "./syncEngine";
import { describeSyncFailure, NON_RETRYABLE_PG_ERROR_CODES } from "./syncErrors";
import type { OfflineEntity, SyncOperation } from "./types";

interface FavoriteRow extends Row {
  user_id: string;
  name: string;
  calories: number | null;
  created_at: string;
}

const TABLE = "nutrition_favorites";
const USER = "user-resilience";

function repo() {
  return createOfflineRepository<FavoriteRow>(TABLE);
}

function serverRows() {
  return serverStore.get(TABLE);
}

/** Simule une opération interrompue : prise en charge puis instance tuée. */
async function markSyncing(opId: string, startedMsAgo: number): Promise<void> {
  const db = await getOfflineDb();
  const op = (await db.get("syncQueue", opId)) as SyncOperation;
  await db.put("syncQueue", {
    ...op,
    status: "syncing",
    lastAttemptAt: new Date(Date.now() - startedMsAgo).toISOString(),
  });
}

async function readOp(opId: string): Promise<SyncOperation> {
  const db = await getOfflineDb();
  return (await db.get("syncQueue", opId)) as SyncOperation;
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
  serverStore.clear();
  fakeSupabaseOpts.failNextWith = null;
});

describe("CRIT-01 — récupération des opérations restées en `syncing`", () => {
  it("Test 1 — une opération `syncing` RÉCENTE n'est pas reprise (une autre instance la traite)", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    const [op] = await listAllOperations(USER);
    // Une autre instance vient de la prendre en charge (il y a 1 s).
    await markSyncing(op.id, 1_000);

    const result = await processSyncQueue(USER);

    expect(result.reclaimed).toBe(0);
    expect(result.succeeded).toBe(0);
    // Rien n'a été envoyé : l'opération appartient toujours à l'autre instance.
    expect(serverRows()?.has(created.id)).toBeFalsy();
    expect((await readOp(op.id)).status).toBe("syncing");
  });

  it("Test 2 — une opération `syncing` ORPHELINE (lastAttemptAt ancien) redevient `pending` puis est traitée", async () => {
    const created = await repo().create(USER, { name: "Amandes", calories: 60 });
    const [op] = await listAllOperations(USER);
    await markSyncing(op.id, STALE_SYNCING_MS + 1_000);

    // Étape observable demandée par l'audit : syncing → pending.
    const reclaimed = await reclaimStaleSyncingOperations(USER);
    expect(reclaimed).toBe(1);
    const afterReclaim = await readOp(op.id);
    expect(afterReclaim.status).toBe("pending");
    // Rien n'est jamais supprimé silencieusement : l'opération est toujours là,
    // avec une trace lisible de l'interruption.
    expect(afterReclaim.lastError).toMatch(/interrompue/i);

    // → puis traitement normal.
    const result = await processSyncQueue(USER);
    expect(result.succeeded).toBe(1);
    expect(serverRows()?.get(created.id)?.name).toBe("Amandes");
    expect(await listAllOperations(USER)).toEqual([]);
  });

  it("Test 3 — interruption complète : pending → syncing → arrêt de l'app → redémarrage → opération récupérée", async () => {
    const created = await repo().create(USER, { name: "Flocons", calories: 350 });
    const [op] = await listAllOperations(USER);

    // 1. L'instance prend possession de l'opération (claim atomique réel)...
    const claimed = await claimOperation(op.id);
    expect(claimed?.status).toBe("syncing");
    // 2. ...puis l'application est tuée avant toute résolution réseau : rien
    //    n'a été envoyé, l'opération reste `syncing` en base.
    expect(serverRows()?.has(created.id)).toBeFalsy();
    expect((await readOp(op.id)).status).toBe("syncing");

    // 3. Nouveau démarrage plus tard (le claim a dépassé le seuil d'abandon).
    await markSyncing(op.id, STALE_SYNCING_MS + 500);
    const result = await processSyncQueue(USER);

    expect(result.reclaimed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(serverRows()?.get(created.id)?.name).toBe("Flocons");
    expect(await listAllOperations(USER)).toEqual([]);
  });

  it("une opération `syncing` sans lastAttemptAt (moteur antérieur) est considérée orpheline, jamais bloquée à vie", async () => {
    const created = await repo().create(USER, { name: "Legacy", calories: 1 });
    const [op] = await listAllOperations(USER);
    const db = await getOfflineDb();
    await db.put("syncQueue", { ...op, status: "syncing", lastAttemptAt: null });

    const result = await processSyncQueue(USER);
    expect(result.reclaimed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(serverRows()?.has(created.id)).toBe(true);
  });
});

describe("protection contre deux traitements simultanés", () => {
  it("Test 9 — deux instances tentent de prendre la même opération : une seule y parvient", async () => {
    await repo().create(USER, { name: "Concurrence", calories: 10 });
    const [op] = await listAllOperations(USER);

    const first = await claimOperation(op.id);
    const second = await claimOperation(op.id);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(first?.status).toBe("syncing");
    expect(first?.lastAttemptAt).not.toBeNull();
  });

  it("deux passages de queue en parallèle n'envoient jamais deux fois la même opération", async () => {
    const created = await repo().create(USER, { name: "Parallèle", calories: 42 });

    const [a, b] = await Promise.all([processSyncQueue(USER), processSyncQueue(USER)]);

    // Exactement un passage a envoyé l'opération ; l'autre l'a laissée.
    expect(a.succeeded + b.succeeded).toBe(1);
    expect(serverRows()?.size).toBe(1);
    expect(serverRows()?.get(created.id)?.name).toBe("Parallèle");
    expect(await listAllOperations(USER)).toEqual([]);
  });

  it("le FIFO reste respecté : une opération laissée à une autre instance ne bloque pas les suivantes", async () => {
    const r = repo();
    const first = await r.create(USER, { name: "Premier", calories: 1 });
    const second = await r.create(USER, { name: "Second", calories: 2 });
    const ops = await listAllOperations(USER);
    const firstOp = ops.find((op) => op.recordLocalId === first.id) as SyncOperation;

    // La première est en cours ailleurs (récente → non reprise).
    await markSyncing(firstOp.id, 1_000);

    const result = await processSyncQueue(USER);
    expect(result.skipped).toBe(0); // filtrée en amont : elle n'est plus dans la file traitable
    expect(result.succeeded).toBe(1);
    expect(serverRows()?.has(second.id)).toBe(true);
    expect(serverRows()?.has(first.id)).toBe(false);
    // Elle n'est pas perdue : elle repartira dès qu'elle sera orpheline.
    expect((await readOp(firstOp.id)).status).toBe("syncing");
  });
});

describe("MAJ-05 — le type de l'opération est conservé dans le conflit", () => {
  async function seedSyncedFavorite() {
    const r = repo();
    const created = await r.create(USER, { name: "Pâtes", calories: 400 });
    await processSyncQueue(USER);
    return { r, created };
  }

  /** Modification concurrente « ailleurs » (autre appareil). */
  function bumpServerRow(id: string, patch: Partial<FavoriteRow>) {
    const row = serverRows()!.get(id)!;
    serverRows()!.set(id, {
      ...row,
      ...patch,
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
  }

  it("Test 4 — conflit issu d'un UPDATE : « garder ma version » rejoue un UPDATE", async () => {
    const { r, created } = await seedSyncedFavorite();
    bumpServerRow(created.id, { calories: 999 });
    await r.update(created.id, USER, { calories: 450 });

    expect((await processSyncQueue(USER)).conflicted).toBe(1);
    const [conflict] = await listConflicts(USER);
    expect(conflict.opType).toBe("update");

    await resolveConflict(conflict.id, "keep-local");
    const [requeued] = await listAllOperations(USER);
    expect(requeued.opType).toBe("update");

    expect((await processSyncQueue(USER)).succeeded).toBe(1);
    expect(serverRows()!.get(created.id)!.calories).toBe(450);
  });

  it("Test 5 — conflit issu d'un DELETE : « garder ma version » rejoue un DELETE (la ligne ne ressuscite jamais)", async () => {
    const { r, created } = await seedSyncedFavorite();
    bumpServerRow(created.id, { calories: 999 });
    // Intention locale : SUPPRIMER.
    await r.remove(created.id, USER);

    expect((await processSyncQueue(USER)).conflicted).toBe(1);
    const [conflict] = await listConflicts(USER);
    expect(conflict.opType).toBe("delete");

    await resolveConflict(conflict.id, "keep-local");
    const [requeued] = await listAllOperations(USER);
    // Le bug MAJ-05 : ici, l'opération ré-enfilée était un `update` et la
    // ligne ressuscitait côté serveur.
    expect(requeued.opType).toBe("delete");
    expect(requeued.payload).toBeNull();

    expect((await processSyncQueue(USER)).succeeded).toBe(1);
    expect(serverRows()!.has(created.id)).toBe(false);
    expect(await r.get(created.id)).toBeUndefined();
  });

  it("« garder la version serveur » sur un conflit de suppression restaure la ligne locale (comportement inchangé)", async () => {
    const { r, created } = await seedSyncedFavorite();
    bumpServerRow(created.id, { calories: 999 });
    await r.remove(created.id, USER);
    await processSyncQueue(USER);

    const [conflict] = await listConflicts(USER);
    await resolveConflict(conflict.id, "keep-server");

    expect((await r.get(created.id))?.calories).toBe(999);
    expect(serverRows()!.has(created.id)).toBe(true);
    // Rien à renvoyer.
    expect(await listAllOperations(USER)).toEqual([]);
  });

  it("un conflit persisté sans `opType` (données antérieures) est relu comme un update", async () => {
    const { r, created } = await seedSyncedFavorite();
    bumpServerRow(created.id, { calories: 999 });
    await r.update(created.id, USER, { calories: 450 });
    await processSyncQueue(USER);

    const db = await getOfflineDb();
    const [conflict] = await listConflicts(USER);
    const { opType: _legacy, ...withoutOpType } = conflict;
    await db.put("conflicts", withoutOpType);

    await resolveConflict(conflict.id, "keep-local");
    const [requeued] = await listAllOperations(USER);
    expect(requeued.opType).toBe("update");
  });
});

describe("erreurs retryables vs définitives", () => {
  it("Test 6 — une erreur réseau (sans code Postgres) reste retryable", async () => {
    const created = await repo().create(USER, { name: "Réseau", calories: 5 });
    fakeSupabaseOpts.failNextWith = { message: "Failed to fetch" };

    const first = await processSyncQueue(USER);
    expect(first.retried).toBe(1);
    expect(first.blocked).toBe(0);

    const op = (await listAllOperations(USER))[0];
    expect(op.status).toBe("failed");
    expect(op.retryCount).toBe(1);

    // Le mécanisme existant (retry immédiat / backoff) reprend la main.
    const second = await processSyncQueue(USER);
    expect(second.succeeded).toBe(1);
    expect(serverRows()?.get(created.id)?.name).toBe("Réseau");
  });

  it("Test 7 — une erreur Postgres non retryable bloque l'opération, qui n'est plus retentée en boucle", async () => {
    const created = await repo().create(USER, { name: "Colonne inconnue", calories: 5 });
    fakeSupabaseOpts.failNextWith = {
      message: "Could not find the 'created_at' column of 'exercises' in the schema cache",
      code: "PGRST204",
      hint: "Perhaps you meant 'created'",
    };
    expect(NON_RETRYABLE_PG_ERROR_CODES.has("PGRST204")).toBe(true);

    const first = await processSyncQueue(USER);
    expect(first.blocked).toBe(1);
    expect(first.retried).toBe(0);

    const blocked = (await listAllOperations(USER))[0];
    expect(blocked.status).toBe("blocked");
    expect(blocked.retryCount).toBe(1);

    // Les passages suivants ne la retentent plus (aucun appel réseau, aucun
    // compteur qui grimpe) — mais elle reste VISIBLE dans la file.
    const second = await processSyncQueue(USER);
    const third = await processSyncQueue(USER);
    expect(second.retried + third.retried).toBe(0);
    expect(second.blocked + third.blocked).toBe(0);
    const stillBlocked = (await listAllOperations(USER))[0];
    expect(stillBlocked.status).toBe("blocked");
    expect(stillBlocked.retryCount).toBe(1);
    expect(serverRows()?.has(created.id)).toBeFalsy();
  });

  it("une violation de clé étrangère reste retryable tant que la file peut encore créer la ligne parente", async () => {
    const r = repo();
    // Deux opérations en file : la seconde représente ce qui pourrait
    // encore créer la dépendance manquante (cas réel : `workout` → `exercise`
    // → `exercise_set`, l'enfant échoue en 23503 tant que le parent n'est
    // pas passé, puis les deux passent au tour suivant).
    const child = await r.create(USER, { name: "Enfant", calories: 1 });
    await r.create(USER, { name: "Parent", calories: 2 });

    fakeSupabaseOpts.failNextWith = {
      message: 'insert or update on table "x" violates foreign key constraint',
      code: "23503",
    };
    const first = await processSyncQueue(USER);
    expect(first.retried).toBe(1);
    expect(first.blocked).toBe(0);
    expect(first.succeeded).toBe(1);

    const childOp = (await listAllOperations(USER))[0];
    expect(childOp.status).toBe("failed");

    // Le tour suivant la termine normalement (la dépendance est arrivée).
    expect((await processSyncQueue(USER)).succeeded).toBe(1);
    expect(serverRows()?.get(child.id)?.name).toBe("Enfant");
  });

  it("une violation de clé étrangère devient bloquante quand plus rien dans la file ne peut la satisfaire", async () => {
    await repo().create(USER, { name: "Orpheline", calories: 1 });

    fakeSupabaseOpts.failNextWith = {
      message: 'insert or update on table "x" violates foreign key constraint',
      code: "23503",
    };
    const result = await processSyncQueue(USER);

    // Seule dans la file : aucune opération ne créera jamais le parent
    // manquant → on arrête la boucle infinie du bug prod.
    expect(result.blocked).toBe(1);
    expect((await listAllOperations(USER))[0].status).toBe("blocked");
    expect((await processSyncQueue(USER)).retried).toBe(0);
  });

  it("action utilisateur : « Réessayer » remet une opération bloquée en file et la synchronise si la cause a disparu", async () => {
    const created = await repo().create(USER, { name: "Débloquée", calories: 7 });
    fakeSupabaseOpts.failNextWith = { message: "not-null violation", code: "23502" };
    await processSyncQueue(USER);
    const blocked = (await listAllOperations(USER))[0];
    expect(blocked.status).toBe("blocked");

    await retryBlockedOperation(blocked.id);
    expect((await readOp(blocked.id)).status).toBe("pending");

    const result = await processSyncQueue(USER);
    expect(result.succeeded).toBe(1);
    expect(serverRows()?.get(created.id)?.name).toBe("Débloquée");
  });

  it("action utilisateur : « Retirer de la file » sort l'opération SANS supprimer la donnée locale", async () => {
    const r = repo();
    const created = await r.create(USER, { name: "Conservée", calories: 3 });
    fakeSupabaseOpts.failNextWith = { message: "check violation", code: "23514" };
    await processSyncQueue(USER);
    const blocked = (await listAllOperations(USER))[0];

    await discardBlockedOperation(blocked.id);

    expect(await listAllOperations(USER)).toEqual([]);
    // La donnée métier locale est intacte et toujours visible.
    const local = await r.get(created.id);
    expect(local?.name).toBe("Conservée");
    const db = await getOfflineDb();
    const entity = (await db.get("entities", entityKey(TABLE, created.id))) as OfflineEntity;
    expect(entity.syncStatus).toBe("failed");
  });

  it("corriger la donnée localement ré-arme une création bloquée (le verdict portait sur l'ancien payload)", async () => {
    const r = repo();
    const created = await r.create(USER, { name: "Incomplète", calories: null });
    fakeSupabaseOpts.failNextWith = {
      message: 'null value in column "calories" violates not-null constraint',
      code: "23502",
    };
    await processSyncQueue(USER);
    const blocked = (await listAllOperations(USER))[0];
    expect(blocked.status).toBe("blocked");

    // L'utilisateur corrige la donnée : le payload de la création en file est
    // mis à jour (fusion, cf. repository.ts) → l'opération repart.
    await r.update(created.id, USER, { calories: 250 });
    const rearmed = await readOp(blocked.id);
    expect(rearmed.status).toBe("pending");
    // L'historique de diagnostic est conservé.
    expect(rearmed.lastError).toContain("23502");

    expect((await processSyncQueue(USER)).succeeded).toBe(1);
    expect(serverRows()?.get(created.id)?.calories).toBe(250);
  });

  it("« Retirer de la file » ne touche jamais à une opération encore retryable", async () => {
    await repo().create(USER, { name: "Encore en jeu", calories: 3 });
    fakeSupabaseOpts.failNextWith = { message: "Failed to fetch" };
    await processSyncQueue(USER);
    const failed = (await listAllOperations(USER))[0];

    await discardBlockedOperation(failed.id);
    await retryBlockedOperation(failed.id);

    const stillThere = await readOp(failed.id);
    expect(stillThere.status).toBe("failed");
  });
});

describe("MAJ-11 — l'erreur réelle est exposée à l'interface", () => {
  it("Test 8 — `lastError` porte le message serveur exact et alimente un libellé compréhensible", async () => {
    await repo().create(USER, { name: "Diagnostic", calories: 1 });
    fakeSupabaseOpts.failNextWith = {
      message: 'null value in column "name" violates not-null constraint',
      code: "23502",
      details: "Failing row contains (…)",
    };
    await processSyncQueue(USER);

    const op = (await listAllOperations(USER))[0];
    expect(op.status).toBe("blocked");
    // Le résumé technique complet est conservé pour le diagnostic…
    expect(op.lastError).toContain("violates not-null constraint");
    expect(op.lastError).toContain("code=23502");
    expect(op.lastError).toContain("details=");
    expect(op.lastErrorCode).toBe("23502");

    // …et le panneau dispose d'une raison réelle, jamais d'un message générique.
    const reason = describeSyncFailure(op);
    expect(reason).toBeTruthy();
    expect(reason).not.toMatch(/une erreur est survenue/i);
  });

  it("une erreur sans code connu retombe sur le message serveur lui-même, pas sur un texte générique", async () => {
    await repo().create(USER, { name: "Sans code", calories: 1 });
    fakeSupabaseOpts.failNextWith = { message: "Service temporarily unavailable" };
    await processSyncQueue(USER);

    const op = (await listAllOperations(USER))[0];
    expect(describeSyncFailure(op)).toBe("Service temporarily unavailable");
  });
});
