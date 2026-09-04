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
 * Validation ciblée de `rebasePendingOperationsForRecord` (chantier 2) et de
 * sa coexistence avec la machine d'état de la sync queue (chantier 1 :
 * `claimOperation`, `syncing` orphelin, `blocked`, `retryBlockedOperation`,
 * `discardBlockedOperation`, `ConflictRecord.opType`).
 *
 * L'INVARIANT à démontrer, dans les deux sens :
 *
 *   Le recalage ne neutralise QUE l'écart de `updated_at` que NOS PROPRES
 *   synchronisations viennent de créer. Toute écriture d'un AUTRE appareil,
 *   qu'elle survienne avant ou après un recalage, doit continuer à produire
 *   un conflit — jamais d'écrasement silencieux (stratégie validée, cf.
 *   `conflictDetector.ts`).
 *
 * Le faux serveur porte une horloge monotone : chaque écriture avance
 * `updated_at`, exactement comme le trigger `set_updated_at` en base. Une
 * écriture « autre appareil » passe par `writeFromOtherDevice()`, qui touche
 * le store serveur SANS passer par la queue locale.
 *
 * Même harnais que `syncQueueResilience.test.ts` / `offlineSync.test.ts`.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface PgLikeError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

interface FakeSupabaseOptions {
  /** Fait échouer la PROCHAINE écriture avec cette erreur. */
  failNextWith?: PgLikeError | null;
  /**
   * Écriture concurrente d'un AUTRE appareil, déclenchée juste APRÈS le
   * prochain UPDATE réussi — permet de placer un vrai conflit exactement
   * dans la fenêtre où le recalage vient d'avoir lieu.
   */
  otherDeviceWriteAfterNextUpdate?: Record<string, unknown> | null;
}

/** Horloge serveur monotone, amorcée devant l'horloge client (qui horodate les `create`). */
let serverClockMs = Date.now();
function serverNow(): string {
  serverClockMs += 1_000;
  return new Date(serverClockMs).toISOString();
}

const serverStore = new Map<string, Map<string, Row>>();
const fakeSupabaseOpts: FakeSupabaseOptions = {};
/** Payloads d'UPDATE réellement partis sur le réseau. */
const sentUpdates: Row[] = [];

function createFakeSupabase(server: Map<string, Map<string, Row>>, opts: FakeSupabaseOptions) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: PgLikeError | null }> => {
        // Une lecture (détection de conflit) ne consomme jamais l'échec injecté.
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
          const row = { ...(op.payload as Row), updated_at: serverNow() };
          store.set(row.id, row);
          return { data: { ...row }, error: null };
        }
        if (op.type === "update") {
          if (!idFilter || !store.has(idFilter)) {
            return { data: null, error: { message: "row not found" } };
          }
          sentUpdates.push({ ...(op.payload as Row) });
          const existing = store.get(idFilter) as Row;
          // Trigger `set_updated_at` : la base impose sa propre valeur.
          const updated: Row = { ...existing, ...(op.payload as Row), updated_at: serverNow() };
          store.set(idFilter, updated);
          const response = { ...updated };

          if (opts.otherDeviceWriteAfterNextUpdate) {
            const patch = opts.otherDeviceWriteAfterNextUpdate;
            opts.otherDeviceWriteAfterNextUpdate = null;
            store.set(idFilter, { ...updated, ...patch, updated_at: serverNow() });
          }
          // La réponse reflète l'état AU MOMENT de notre écriture — le
          // serveur ne peut pas nous parler d'une écriture postérieure.
          return { data: response, error: null };
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
  rebasePendingOperationsForRecord,
  STALE_SYNCING_MS,
} from "./syncQueue";
import {
  discardBlockedOperation,
  listConflicts,
  processSyncQueue,
  resolveConflict,
  retryBlockedOperation,
} from "./syncEngine";
import type { OfflineEntity, SyncOperation } from "./types";

const TABLE = "nutrition_favorites";
const USER = "user-rebase";

interface FavoriteRow extends Row {
  user_id: string;
  name: string;
  calories: number | null;
  created_at: string;
}

function repo() {
  return createOfflineRepository<FavoriteRow>(TABLE);
}

function serverRow(id: string): Row | undefined {
  return serverStore.get(TABLE)?.get(id);
}

/** Écriture d'un AUTRE appareil : touche le serveur sans passer par la queue locale. */
function writeFromOtherDevice(id: string, patch: Record<string, unknown>): void {
  const store = serverStore.get(TABLE);
  const existing = store?.get(id);
  if (!store || !existing) throw new Error("ligne serveur absente");
  store.set(id, { ...existing, ...patch, updated_at: serverNow() });
}

async function readOp(opId: string): Promise<SyncOperation> {
  const db = await getOfflineDb();
  return (await db.get("syncQueue", opId)) as SyncOperation;
}

async function readEntity(id: string): Promise<OfflineEntity> {
  const db = await getOfflineDb();
  return (await db.get("entities", entityKey(TABLE, id))) as OfflineEntity;
}

/** Simule une opération prise en charge par une autre instance. */
async function markSyncing(opId: string, startedMsAgo: number): Promise<void> {
  const db = await getOfflineDb();
  const op = await readOp(opId);
  await db.put("syncQueue", {
    ...op,
    status: "syncing",
    lastAttemptAt: new Date(Date.now() - startedMsAgo).toISOString(),
  });
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
  sentUpdates.length = 0;
  serverClockMs = Date.now() + 60_000;
  fakeSupabaseOpts.failNextWith = null;
  fakeSupabaseOpts.otherDeviceWriteAfterNextUpdate = null;
});

// ─── 1. CREATE → UPDATE → synchronisation ───────────────────────────────

describe("CREATE → UPDATE → synchronisation", () => {
  it("le patch fusionne dans le create : une seule opération, aucun recalage nécessaire", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await repo().update(created.id, USER, { calories: 140 });

    const ops = await listAllOperations(USER);
    expect(ops).toHaveLength(1);
    expect(ops[0].opType).toBe("create");
    // Un `create` n'a pas de base : il ne doit JAMAIS être recalé.
    expect(ops[0].baseUpdatedAt).toBeNull();

    const result = await processSyncQueue(USER);
    expect(result.succeeded).toBe(1);
    expect(result.conflicted).toBe(0);
    expect(serverRow(created.id)?.calories).toBe(140);

    // Plus rien en attente → l'entité repasse `synced` avec la base serveur.
    const entity = await readEntity(created.id);
    expect(entity.syncStatus).toBe("synced");
    expect(entity.serverUpdatedAt).toBe(serverRow(created.id)?.updated_at);
    // Aucun UPDATE réseau : la création portait déjà la valeur finale.
    expect(sentUpdates).toHaveLength(0);
  });
});

// ─── 2. UPDATE 1 → synchronisation → UPDATE 2 ───────────────────────────

describe("UPDATE 1 → synchronisation → UPDATE 2", () => {
  it("le second update part avec la base serveur à jour, sans conflit", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);
    const baseAfterCreate = serverRow(created.id)?.updated_at;

    await repo().update(created.id, USER, { calories: 140 });
    const [op1] = await listAllOperations(USER);
    // Base prise à l'écriture locale = état serveur connu après le create.
    expect(op1.baseUpdatedAt).toBe(baseAfterCreate);

    expect((await processSyncQueue(USER)).conflicted).toBe(0);
    const baseAfterUpdate1 = serverRow(created.id)?.updated_at;
    expect(baseAfterUpdate1).not.toBe(baseAfterCreate);

    await repo().update(created.id, USER, { name: "Skyr nature" });
    const [op2] = await listAllOperations(USER);
    expect(op2.baseUpdatedAt).toBe(baseAfterUpdate1);

    const result = await processSyncQueue(USER);
    expect(result.conflicted).toBe(0);
    expect(result.succeeded).toBe(1);
    expect(serverRow(created.id)).toMatchObject({ name: "Skyr nature", calories: 140 });
  });
});

// ─── 3. Deux UPDATE offline successifs avant synchronisation ────────────

describe("deux UPDATE offline successifs avant synchronisation", () => {
  it("les deux patchs partent dans l'ordre, le second est recalé, aucun faux conflit", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);
    const baseAfterCreate = serverRow(created.id)?.updated_at as string;

    await repo().update(created.id, USER, { calories: 140 });
    await repo().update(created.id, USER, { name: "Skyr nature" });

    const queued = await listAllOperations(USER);
    expect(queued.map((o) => o.payload)).toEqual([{ calories: 140 }, { name: "Skyr nature" }]);
    // Les DEUX partent de la même base : c'est précisément ce qui produisait
    // un faux conflit sur la seconde avant le recalage.
    expect(queued.map((o) => o.baseUpdatedAt)).toEqual([baseAfterCreate, baseAfterCreate]);

    const result = await processSyncQueue(USER);

    expect(result.conflicted).toBe(0);
    expect(result.succeeded).toBe(2);
    expect(await listConflicts(USER)).toHaveLength(0);
    expect(serverRow(created.id)).toMatchObject({ name: "Skyr nature", calories: 140 });
    // Aucun patch n'a écrasé l'autre, localement non plus.
    expect(await repo().get(created.id)).toMatchObject({
      name: "Skyr nature",
      calories: 140,
    });
    expect((await readEntity(created.id)).syncStatus).toBe("synced");
  });

  it("le recalage n'écrit QUE `baseUpdatedAt` : payload, statut, opType et retryCount sont préservés", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);

    await repo().update(created.id, USER, { calories: 140 });
    await repo().update(created.id, USER, { name: "Skyr nature" });
    const [op1, op2] = await listAllOperations(USER);
    const before = { ...op2 };

    const remaining = await rebasePendingOperationsForRecord({
      userId: USER,
      table: TABLE,
      recordLocalId: created.id,
      baseUpdatedAt: "2030-01-01T00:00:00.000Z",
      excludeOperationId: op1.id,
    });

    expect(remaining).toBe(1);
    const after = await readOp(op2.id);
    expect(after.baseUpdatedAt).toBe("2030-01-01T00:00:00.000Z");
    expect(after.payload).toEqual(before.payload);
    expect(after.opType).toBe(before.opType);
    expect(after.status).toBe(before.status);
    expect(after.retryCount).toBe(before.retryCount);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.lastError).toBe(before.lastError);

    // L'opération exclue (celle qui vient de réussir) n'est jamais touchée.
    expect((await readOp(op1.id)).baseUpdatedAt).toBe(op1.baseUpdatedAt);
  });

  it("un `create` en attente n'est jamais recalé — il n'a pas de base par définition", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    const [createOp] = await listAllOperations(USER);

    await rebasePendingOperationsForRecord({
      userId: USER,
      table: TABLE,
      recordLocalId: created.id,
      baseUpdatedAt: "2030-01-01T00:00:00.000Z",
    });

    expect((await readOp(createOp.id)).baseUpdatedAt).toBeNull();
  });

  it("le recalage ne touche jamais une autre ligne ni une autre table", async () => {
    const a = await repo().create(USER, { name: "Skyr", calories: 120 });
    const b = await repo().create(USER, { name: "Amandes", calories: 60 });
    await processSyncQueue(USER);
    await repo().update(a.id, USER, { calories: 140 });
    await repo().update(b.id, USER, { calories: 61 });

    const ops = await listAllOperations(USER);
    const opB = ops.find((o) => o.recordLocalId === b.id) as SyncOperation;

    await rebasePendingOperationsForRecord({
      userId: USER,
      table: TABLE,
      recordLocalId: a.id,
      baseUpdatedAt: "2030-01-01T00:00:00.000Z",
    });

    expect((await readOp(opB.id)).baseUpdatedAt).toBe(opB.baseUpdatedAt);
  });
});

// ─── 4. Conflit réel serveur / local (multi-appareils) ──────────────────

describe("conflit réel serveur / local", () => {
  it("une écriture d'un AUTRE appareil est bien détectée comme conflit (aucun écrasement)", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);

    // Un autre appareil modifie la ligne pendant qu'on est hors connexion.
    writeFromOtherDevice(created.id, { name: "Skyr (autre appareil)" });

    await repo().update(created.id, USER, { calories: 200 });
    const result = await processSyncQueue(USER);

    expect(result.conflicted).toBe(1);
    expect(result.succeeded).toBe(0);
    const conflicts = await listConflicts(USER);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].opType).toBe("update"); // ConflictRecord.opType (chantier 1) préservé
    // Le serveur n'a PAS été écrasé.
    expect(serverRow(created.id)?.name).toBe("Skyr (autre appareil)");
    expect(serverRow(created.id)?.calories).toBe(120);
    expect((await readEntity(created.id)).syncStatus).toBe("conflict");
  });

  it("l'arbitrage `keep-local` réenfile un update assaini et repasse", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);
    writeFromOtherDevice(created.id, { name: "Skyr (autre appareil)" });
    await repo().update(created.id, USER, { calories: 200 });
    await processSyncQueue(USER);

    const [conflict] = await listConflicts(USER);
    await resolveConflict(conflict.id, "keep-local");
    const result = await processSyncQueue(USER);

    expect(result.succeeded).toBe(1);
    expect(serverRow(created.id)?.calories).toBe(200);
    // Les colonnes du contrat ne sont jamais réécrites par un update.
    const lastSent = sentUpdates[sentUpdates.length - 1];
    expect(Object.keys(lastSent)).not.toContain("id");
    expect(Object.keys(lastSent)).not.toContain("user_id");
    expect(Object.keys(lastSent)).not.toContain("created_at");
    expect(Object.keys(lastSent)).not.toContain("updated_at");
  });
});

// ─── 5. Conflit APRÈS recalage — le cœur de la validation ───────────────

describe("conflit survenant APRÈS un recalage", () => {
  it("le recalage ne masque PAS une écriture concurrente postérieure à notre propre synchronisation", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);

    // Deux patchs locaux en attente : la seconde opération sera recalée par
    // la première.
    await repo().update(created.id, USER, { calories: 140 });
    await repo().update(created.id, USER, { name: "Skyr nature" });

    // Un AUTRE appareil écrit dans la fenêtre exacte entre les deux : juste
    // après notre premier update, donc juste après le recalage.
    fakeSupabaseOpts.otherDeviceWriteAfterNextUpdate = { name: "Skyr (autre appareil)" };

    const result = await processSyncQueue(USER);

    // Le premier patch passe ; le second DOIT être arrêté en conflit.
    expect(result.succeeded).toBe(1);
    expect(result.conflicted).toBe(1);
    const conflicts = await listConflicts(USER);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].opType).toBe("update");
    // L'écriture de l'autre appareil est intacte : rien d'écrasé en silence.
    expect(serverRow(created.id)?.name).toBe("Skyr (autre appareil)");
    expect(serverRow(created.id)?.calories).toBe(140);
  });

  it("recalage et conflit réel se distinguent sur la même ligne, dans le même passage", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);

    await repo().update(created.id, USER, { calories: 140 });
    await repo().update(created.id, USER, { name: "Skyr nature" });
    await repo().update(created.id, USER, { calories: 150 });

    // Aucun autre appareil : les TROIS doivent passer (2 recalages).
    const clean = await processSyncQueue(USER);
    expect(clean.conflicted).toBe(0);
    expect(clean.succeeded).toBe(3);
    expect(serverRow(created.id)).toMatchObject({ name: "Skyr nature", calories: 150 });
  });
});

// ─── 6. UPDATE → erreur → retry ─────────────────────────────────────────

describe("UPDATE → erreur réseau → retry", () => {
  it("l'échec ne recale rien et le retry repart de la bonne base", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);
    const baseAfterCreate = serverRow(created.id)?.updated_at as string;

    await repo().update(created.id, USER, { calories: 140 });
    const [op] = await listAllOperations(USER);

    fakeSupabaseOpts.failNextWith = { message: "Failed to fetch" };
    const failed = await processSyncQueue(USER);
    expect(failed.retried).toBe(1);

    const afterFailure = await readOp(op.id);
    expect(afterFailure.status).toBe("failed");
    // Rien n'a été recalé : aucune synchronisation n'a réussi.
    expect(afterFailure.baseUpdatedAt).toBe(baseAfterCreate);

    const retried = await processSyncQueue(USER);
    expect(retried.succeeded).toBe(1);
    expect(retried.conflicted).toBe(0);
    expect(serverRow(created.id)?.calories).toBe(140);
  });
});

// ─── 7. Opération `blocked` puis réarmement ─────────────────────────────

describe("opération `blocked` (chantier 1) et recalage", () => {
  it("une opération bloquée est recalée par les synchronisations suivantes, et repasse au réarmement sans faux conflit", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);
    const baseAfterCreate = serverRow(created.id)?.updated_at as string;

    // Patch 1 : erreur de schéma → BLOQUÉE (verdict définitif du chantier 1).
    await repo().update(created.id, USER, { calories: 140 });
    const [op1] = await listAllOperations(USER);
    fakeSupabaseOpts.failNextWith = {
      message: "Could not find the 'calories' column of 'nutrition_favorites' in the schema cache",
      code: "PGRST204",
    };
    const blockedRun = await processSyncQueue(USER);
    expect(blockedRun.blocked).toBe(1);
    expect((await readOp(op1.id)).status).toBe("blocked");
    expect((await readOp(op1.id)).baseUpdatedAt).toBe(baseAfterCreate);

    // Patch 2 sur la MÊME ligne : il passe et fait avancer `updated_at`.
    await repo().update(created.id, USER, { name: "Skyr nature" });
    const ok = await processSyncQueue(USER);
    expect(ok.succeeded).toBe(1);
    const baseAfterPatch2 = serverRow(created.id)?.updated_at as string;
    expect(baseAfterPatch2).not.toBe(baseAfterCreate);

    // L'opération bloquée a bien été recalée — sinon son réarmement
    // déclencherait un conflit contre notre propre écriture.
    const blockedAfter = await readOp(op1.id);
    expect(blockedAfter.status).toBe("blocked"); // statut intact
    expect(blockedAfter.payload).toEqual({ calories: 140 }); // payload intact
    expect(blockedAfter.baseUpdatedAt).toBe(baseAfterPatch2);

    // Une opération bloquée maintient l'entité hors de l'état `synced` :
    // une modification locale reste non synchronisée.
    expect((await readEntity(created.id)).syncStatus).not.toBe("synced");

    // Réarmement explicite par l'utilisateur.
    await retryBlockedOperation(op1.id);
    const retried = await processSyncQueue(USER);
    expect(retried.conflicted).toBe(0);
    expect(retried.succeeded).toBe(1);
    expect(serverRow(created.id)).toMatchObject({ name: "Skyr nature", calories: 140 });
    expect((await readEntity(created.id)).syncStatus).toBe("synced");
  });

  it("une opération bloquée puis abandonnée (`discardBlockedOperation`) ne laisse aucun recalage orphelin", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);

    await repo().update(created.id, USER, { calories: 140 });
    const [op1] = await listAllOperations(USER);
    fakeSupabaseOpts.failNextWith = { message: "not_null_violation", code: "23502" };
    await processSyncQueue(USER);
    expect((await readOp(op1.id)).status).toBe("blocked");

    await discardBlockedOperation(op1.id);
    expect(await readOp(op1.id)).toBeUndefined();

    // Une synchronisation ultérieure sur la même ligne se comporte
    // normalement : plus aucune opération à recaler.
    await repo().update(created.id, USER, { name: "Skyr nature" });
    const result = await processSyncQueue(USER);
    expect(result.conflicted).toBe(0);
    expect(result.succeeded).toBe(1);
    expect((await readEntity(created.id)).syncStatus).toBe("synced");
  });
});

// ─── 8. Coexistence avec `claimOperation` / `syncing` ───────────────────

describe("coexistence avec `claimOperation` et les opérations `syncing`", () => {
  it("`claimOperation` renvoie l'état PERSISTÉ : une opération recalée part avec sa nouvelle base", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);
    const baseAfterCreate = serverRow(created.id)?.updated_at as string;

    await repo().update(created.id, USER, { calories: 140 });
    await repo().update(created.id, USER, { name: "Skyr nature" });
    const [, op2] = await listAllOperations(USER);
    expect(op2.baseUpdatedAt).toBe(baseAfterCreate);

    await processSyncQueue(USER);
    // Les deux ont abouti : la relecture atomique de `claimOperation` a bien
    // vu la base recalée (sinon la seconde serait partie en conflit).
    expect(await listConflicts(USER)).toHaveLength(0);
    expect(serverRow(created.id)).toMatchObject({ name: "Skyr nature", calories: 140 });
  });

  it("une opération `syncing` récente (autre instance) est recalée mais jamais volée", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);
    const baseAfterCreate = serverRow(created.id)?.updated_at as string;

    await repo().update(created.id, USER, { calories: 140 });
    await repo().update(created.id, USER, { name: "Skyr nature" });
    const [op1, op2] = await listAllOperations(USER);

    // Une autre instance vient de prendre op2 en charge.
    await markSyncing(op2.id, 1_000);

    const result = await processSyncQueue(USER);
    expect(result.succeeded).toBe(1); // seule op1 est partie d'ici
    expect((await readOp(op1.id)) ?? null).toBeNull();

    const op2After = await readOp(op2.id);
    // Toujours à l'autre instance — jamais volée…
    expect(op2After.status).toBe("syncing");
    // …mais recalée : quand elle repartira, elle ne se battra pas contre
    // notre propre écriture.
    expect(op2After.baseUpdatedAt).not.toBe(baseAfterCreate);
    expect(op2After.baseUpdatedAt).toBe(serverRow(created.id)?.updated_at);

    // Tant qu'elle est en vol, la donnée locale (la plus récente) est
    // conservée : la réponse partielle d'op1 ne fait pas reculer l'écran.
    expect(await repo().get(created.id)).toMatchObject({
      name: "Skyr nature",
      calories: 140,
    });
  });

  it("une opération `syncing` ORPHELINE est reprise et repart avec la base recalée, sans faux conflit", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);

    await repo().update(created.id, USER, { calories: 140 });
    await repo().update(created.id, USER, { name: "Skyr nature" });
    const [, op2] = await listAllOperations(USER);

    // L'instance qui tenait op2 a été tuée (PWA fermée) il y a longtemps.
    await markSyncing(op2.id, STALE_SYNCING_MS + 5_000);

    const result = await processSyncQueue(USER);

    expect(result.reclaimed).toBe(1);
    expect(result.conflicted).toBe(0);
    expect(result.succeeded).toBe(2);
    expect(serverRow(created.id)).toMatchObject({ name: "Skyr nature", calories: 140 });
    expect((await readEntity(created.id)).syncStatus).toBe("synced");
  });

  it("une opération déjà prise en charge ne peut pas être claim deux fois (recalage compris)", async () => {
    const created = await repo().create(USER, { name: "Skyr", calories: 120 });
    await processSyncQueue(USER);
    await repo().update(created.id, USER, { calories: 140 });
    const [op] = await listAllOperations(USER);

    const first = await claimOperation(op.id);
    const second = await claimOperation(op.id);

    expect(first).not.toBeNull();
    expect(first?.status).toBe("syncing");
    expect(second).toBeNull();
  });
});
