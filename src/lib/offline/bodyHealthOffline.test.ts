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

/**
 * Couverture offline-first de la vague finale — Corps/Santé/Objectifs
 * (`src/hooks/usePhysicalGoal.ts`, table `physical_goals`) et Suppléments
 * (`src/hooks/use-supplements.ts`, table `supplements` — le catalogue perso
 * uniquement, `supplement_logs` reste online-only, cf. commentaire d'en-tête
 * du hook). Même infra générique et même simulateur Supabase in-memory que
 * `wave3Offline.test.ts`.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface FakeSupabaseOptions {
  failNext?: boolean;
}

function createFakeSupabase(server: Map<string, Map<string, Row>>, opts: FakeSupabaseOptions) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "insert" | "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: Error | null }> => {
        if (opts.failNext) {
          opts.failNext = false;
          return { data: null, error: new Error("network down") };
        }
        if (!op) {
          if (idFilter) return { data: store.get(idFilter) ?? null, error: null };
          return { data: Array.from(store.values()), error: null };
        }
        if (op.type === "insert" || op.type === "upsert") {
          const row = { ...(op.payload as Row) };
          store.set(row.id, row);
          return { data: row, error: null };
        }
        if (op.type === "update") {
          if (!idFilter || !store.has(idFilter)) {
            return { data: null, error: new Error("row not found") };
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
        select() {
          return builder;
        },
        eq(col: string, val: string) {
          if (col === "id") idFilter = val;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        insert(payload: Row) {
          op = { type: "insert", payload };
          return builder;
        },
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
import { getOfflineDb, purgeUserOfflineData, resetOfflineDbForTests } from "./db";
import { createOfflineRepository } from "./repository";
import { listAllOperations } from "./syncQueue";
import { processSyncQueue, resolveConflict, listConflicts } from "./syncEngine";

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
  serverStore.clear();
  fakeSupabaseOpts.failNext = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Physical Goals (table `physical_goals`) ───────────────────────────────

interface PhysicalGoalRow extends Row {
  user_id: string;
  goal: string;
  target_rate: string | null;
  started_at: string;
  starting_weight_kg: number | null;
  starting_body_fat_percent: number | null;
  starting_body_fat_method: string | null;
  starting_lean_mass_kg: number | null;
  target_weight_kg: number | null;
  target_body_fat_percent: number | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

const goalRow = (overrides: Partial<PhysicalGoalRow> = {}) => ({
  goal: "fat_loss",
  target_rate: "moderate",
  started_at: "2026-08-01",
  starting_weight_kg: 80,
  starting_body_fat_percent: null,
  starting_body_fat_method: null,
  starting_lean_mass_kg: null,
  target_weight_kg: 75,
  target_body_fat_percent: null,
  status: "active",
  completed_at: null,
  ...overrides,
});

describe("Physical Goals — lecture/écriture hors connexion", () => {
  it("lecture hors connexion : objectif déjà synchronisé reste visible", async () => {
    const repo = createOfflineRepository<PhysicalGoalRow>("physical_goals");
    const created = await repo.create(USER_A, goalRow());
    await processSyncQueue(USER_A);

    const all = await repo.list(USER_A);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].status).toBe("active");
  });

  it("création hors connexion : visible immédiatement en local, rien envoyé au serveur", async () => {
    const repo = createOfflineRepository<PhysicalGoalRow>("physical_goals");
    const created = await repo.create(USER_A, goalRow());
    expect(created.id).toBeTruthy();
    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(serverStore.get("physical_goals")?.size ?? 0).toBe(0);
  });

  it("suppression hors connexion : disparaît de list() (tombstone local)", async () => {
    const repo = createOfflineRepository<PhysicalGoalRow>("physical_goals");
    const created = await repo.create(USER_A, goalRow());
    await repo.remove(created.id, USER_A);
    expect(await repo.list(USER_A)).toEqual([]);
  });

  it("un seul objectif ACTIF à la fois : créer un nouvel objectif clôture l'ancien localement, hors connexion", async () => {
    const repo = createOfflineRepository<PhysicalGoalRow>("physical_goals");
    const first = await repo.create(USER_A, goalRow({ goal: "fat_loss" }));

    // Reproduit la logique de useCreatePhysicalGoal : clôture l'actif avant de créer le nouveau.
    const local = await repo.list(USER_A);
    const existingActive = local.find((g) => g.status === "active");
    if (existingActive) {
      await repo.update(existingActive.id, USER_A, { status: "cancelled" });
    }
    const second = await repo.create(USER_A, goalRow({ goal: "muscle_gain" }));

    const all = await repo.list(USER_A);
    expect(all).toHaveLength(2);
    const actives = all.filter((g) => g.status === "active");
    expect(actives).toHaveLength(1);
    expect(actives[0].id).toBe(second.id);
    const cancelled = all.find((g) => g.id === first.id);
    expect(cancelled?.status).toBe("cancelled");
  });

  it("plusieurs opérations enchaînées avant reconnexion : toutes reflétées en local", async () => {
    const repo = createOfflineRepository<PhysicalGoalRow>("physical_goals");
    const a = await repo.create(USER_A, goalRow({ status: "cancelled" }));
    const b = await repo.create(USER_A, goalRow({ status: "active" }));
    await repo.update(a.id, USER_A, { target_rate: "slow" });

    const list = await repo.list(USER_A);
    expect(list).toHaveLength(2);
    expect(list.find((g) => g.id === a.id)?.target_rate).toBe("slow");
    expect(list.find((g) => g.id === b.id)?.status).toBe("active");
  });
});

describe("Physical Goals — synchronisation au retour réseau", () => {
  it("une création locale est poussée vers le serveur (mock) au processSyncQueue", async () => {
    const repo = createOfflineRepository<PhysicalGoalRow>("physical_goals");
    const created = await repo.create(USER_A, goalRow());

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("physical_goals")?.has(created.id)).toBe(true);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("Physical Goals — coupure réseau pendant la synchronisation + retry", () => {
  it("un échec réseau garde l'opération (status failed), et le retry suivant la termine", async () => {
    const repo = createOfflineRepository<PhysicalGoalRow>("physical_goals");
    const created = await repo.create(USER_A, goalRow());

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(first.succeeded).toBe(0);

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(serverStore.get("physical_goals")?.has(created.id)).toBe(true);
  });

  it("idempotence : un create rejoué après coupure ne crée pas de doublon (upsert par id)", async () => {
    const repo = createOfflineRepository<PhysicalGoalRow>("physical_goals");
    const created = await repo.create(USER_A, goalRow());

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A);
    await processSyncQueue(USER_A);

    expect(serverStore.get("physical_goals")?.size).toBe(1);
  });
});

describe("Physical Goals — conflit local/serveur", () => {
  async function seedSyncedEntry(userId: string) {
    const repo = createOfflineRepository<PhysicalGoalRow>("physical_goals");
    const created = await repo.create(userId, goalRow({ target_rate: "moderate" }));
    await processSyncQueue(userId);
    return { repo, created };
  }

  it("détecte un conflit quand le serveur a changé ET la donnée locale aussi, sans écraser silencieusement", async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);

    const serverRow = serverStore.get("physical_goals")!.get(created.id)!;
    serverStore.get("physical_goals")!.set(created.id, {
      ...serverRow,
      target_rate: "fast",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    await repo.update(created.id, USER_A, { target_rate: "slow" });

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(1);
    expect(result.succeeded).toBe(0);

    const conflicts = await listConflicts(USER_A);
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].localData as PhysicalGoalRow).target_rate).toBe("slow");
    expect((conflicts[0].serverData as PhysicalGoalRow).target_rate).toBe("fast");
  });

  it('résolution "Garder ma version" : ré-envoie la version locale et écrase le serveur', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("physical_goals")!.get(created.id)!;
    serverStore.get("physical_goals")!.set(created.id, {
      ...serverRow,
      target_rate: "fast",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { target_rate: "slow" });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-local");
    expect(await listConflicts(USER_A)).toEqual([]);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("physical_goals")!.get(created.id)!.target_rate).toBe("slow");
  });

  it('résolution "Garder la version serveur" : applique la version serveur en local, rien à renvoyer', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("physical_goals")!.get(created.id)!;
    serverStore.get("physical_goals")!.set(created.id, {
      ...serverRow,
      target_rate: "fast",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { target_rate: "slow" });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-server");
    expect(await listConflicts(USER_A)).toEqual([]);

    const local = await repo.get(created.id);
    expect(local?.target_rate).toBe("fast");
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("Physical Goals — changement de compte", () => {
  it("purge le store offline par userId : aucune fuite d'objectif entre comptes", async () => {
    const repo = createOfflineRepository<PhysicalGoalRow>("physical_goals");
    await repo.create(USER_A, goalRow());
    await repo.create(USER_B, goalRow());

    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(await repo.list(USER_B)).toHaveLength(1);

    await purgeUserOfflineData(USER_A);

    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.list(USER_B)).toHaveLength(1);

    const db = await getOfflineDb();
    const remainingOpsA = await db.getAllFromIndex("syncQueue", "by-user", USER_A);
    expect(remainingOpsA).toEqual([]);
  });
});

// ─── Supplements (table `supplements`) ─────────────────────────────────────

interface SupplementRow extends Row {
  user_id: string;
  name: string;
  dosage: string | null;
  unit: string | null;
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

const supplementRow = (overrides: Partial<SupplementRow> = {}) => ({
  name: "Créatine",
  dosage: "5g",
  unit: null,
  notes: null,
  sort_order: 0,
  is_active: true,
  ...overrides,
});

describe("Supplements — lecture/écriture hors connexion", () => {
  it("lecture hors connexion : complément déjà synchronisé reste visible", async () => {
    const repo = createOfflineRepository<SupplementRow>("supplements");
    const created = await repo.create(USER_A, supplementRow());
    await processSyncQueue(USER_A);

    const all = await repo.list(USER_A);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Créatine");
  });

  it("création hors connexion : visible immédiatement en local, rien envoyé au serveur", async () => {
    const repo = createOfflineRepository<SupplementRow>("supplements");
    const created = await repo.create(USER_A, supplementRow({ name: "Vitamine D" }));
    expect(created.id).toBeTruthy();
    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(serverStore.get("supplements")?.size ?? 0).toBe(0);
  });

  it("modification hors connexion (désactivation) reflétée immédiatement en local", async () => {
    const repo = createOfflineRepository<SupplementRow>("supplements");
    const created = await repo.create(USER_A, supplementRow());
    await repo.update(created.id, USER_A, { is_active: false });
    const updated = await repo.get(created.id);
    expect(updated?.is_active).toBe(false);
  });

  it("suppression hors connexion : disparaît de list() (tombstone local)", async () => {
    const repo = createOfflineRepository<SupplementRow>("supplements");
    const created = await repo.create(USER_A, supplementRow());
    await repo.remove(created.id, USER_A);
    expect(await repo.list(USER_A)).toEqual([]);
  });

  it("plusieurs opérations enchaînées avant reconnexion : toutes reflétées en local", async () => {
    const repo = createOfflineRepository<SupplementRow>("supplements");
    const a = await repo.create(USER_A, supplementRow({ name: "A" }));
    const b = await repo.create(USER_A, supplementRow({ name: "B" }));
    await repo.remove(b.id, USER_A);
    await repo.create(USER_A, supplementRow({ name: "C" }));

    const list = await repo.list(USER_A);
    expect(list.map((r) => r.name).sort()).toEqual(["A", "C"]);
  });
});

describe("Supplements — synchronisation au retour réseau", () => {
  it("une création locale est poussée vers le serveur (mock) au processSyncQueue", async () => {
    const repo = createOfflineRepository<SupplementRow>("supplements");
    const created = await repo.create(USER_A, supplementRow());

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("supplements")?.has(created.id)).toBe(true);
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("Supplements — coupure réseau pendant la synchronisation + retry", () => {
  it("un échec réseau garde l'opération (status failed), et le retry suivant la termine", async () => {
    const repo = createOfflineRepository<SupplementRow>("supplements");
    const created = await repo.create(USER_A, supplementRow());

    fakeSupabaseOpts.failNext = true;
    const first = await processSyncQueue(USER_A);
    expect(first.retried).toBe(1);
    expect(first.succeeded).toBe(0);

    const second = await processSyncQueue(USER_A);
    expect(second.succeeded).toBe(1);
    expect(serverStore.get("supplements")?.has(created.id)).toBe(true);
  });

  it("idempotence : un create rejoué après coupure ne crée pas de doublon (upsert par id)", async () => {
    const repo = createOfflineRepository<SupplementRow>("supplements");
    const created = await repo.create(USER_A, supplementRow());

    fakeSupabaseOpts.failNext = true;
    await processSyncQueue(USER_A);
    await processSyncQueue(USER_A);

    expect(serverStore.get("supplements")?.size).toBe(1);
  });
});

describe("Supplements — conflit local/serveur", () => {
  async function seedSyncedEntry(userId: string) {
    const repo = createOfflineRepository<SupplementRow>("supplements");
    const created = await repo.create(userId, supplementRow({ dosage: "5g" }));
    await processSyncQueue(userId);
    return { repo, created };
  }

  it("détecte un conflit quand le serveur a changé ET la donnée locale aussi, sans écraser silencieusement", async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);

    const serverRow = serverStore.get("supplements")!.get(created.id)!;
    serverStore.get("supplements")!.set(created.id, {
      ...serverRow,
      dosage: "10g",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });

    await repo.update(created.id, USER_A, { dosage: "7g" });

    const result = await processSyncQueue(USER_A);
    expect(result.conflicted).toBe(1);
    expect(result.succeeded).toBe(0);

    const conflicts = await listConflicts(USER_A);
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].localData as SupplementRow).dosage).toBe("7g");
    expect((conflicts[0].serverData as SupplementRow).dosage).toBe("10g");
  });

  it('résolution "Garder ma version" : ré-envoie la version locale et écrase le serveur', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("supplements")!.get(created.id)!;
    serverStore.get("supplements")!.set(created.id, {
      ...serverRow,
      dosage: "10g",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { dosage: "7g" });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-local");
    expect(await listConflicts(USER_A)).toEqual([]);

    const result = await processSyncQueue(USER_A);
    expect(result.succeeded).toBe(1);
    expect(serverStore.get("supplements")!.get(created.id)!.dosage).toBe("7g");
  });

  it('résolution "Garder la version serveur" : applique la version serveur en local, rien à renvoyer', async () => {
    const { repo, created } = await seedSyncedEntry(USER_A);
    const serverRow = serverStore.get("supplements")!.get(created.id)!;
    serverStore.get("supplements")!.set(created.id, {
      ...serverRow,
      dosage: "10g",
      updated_at: new Date(Date.now() + 10_000).toISOString(),
    });
    await repo.update(created.id, USER_A, { dosage: "7g" });
    await processSyncQueue(USER_A);

    const [conflict] = await listConflicts(USER_A);
    await resolveConflict(conflict.id, "keep-server");
    expect(await listConflicts(USER_A)).toEqual([]);

    const local = await repo.get(created.id);
    expect(local?.dosage).toBe("10g");
    expect(await listAllOperations(USER_A)).toEqual([]);
  });
});

describe("Supplements — changement de compte", () => {
  it("purge le store offline par userId : aucune fuite de complément entre comptes", async () => {
    const repo = createOfflineRepository<SupplementRow>("supplements");
    await repo.create(USER_A, supplementRow({ name: "Compte A" }));
    await repo.create(USER_B, supplementRow({ name: "Compte B" }));

    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(await repo.list(USER_B)).toHaveLength(1);

    await purgeUserOfflineData(USER_A);

    expect(await repo.list(USER_A)).toEqual([]);
    expect(await repo.list(USER_B)).toHaveLength(1);

    const db = await getOfflineDb();
    const remainingOpsA = await db.getAllFromIndex("syncQueue", "by-user", USER_A);
    expect(remainingOpsA).toEqual([]);
  });
});
