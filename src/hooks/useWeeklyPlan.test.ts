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
 * B06 — l'écriture du plan de la semaine, HORS LIGNE puis synchronisée.
 *
 * Même infrastructure que `bodyHealthOffline.test.ts` : fausse IndexedDB et
 * simulateur Supabase en mémoire. On teste `writePlanDay` (le chemin réel des
 * mutations de l'écran), pas la logique pure de `weeklyPlan.ts` — déjà couverte
 * par `lib/fitness/weeklyPlan.test.ts`. Ce qui est vérifié ICI, c'est ce que
 * seule la couche données peut prouver : ce qui part réellement vers le
 * serveur, et ce qui ne doit surtout pas y partir.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

function createFakeSupabase(server: Map<string, Map<string, Row>>) {
  return {
    from(table: string) {
      if (!server.has(table)) server.set(table, new Map());
      const store = server.get(table) as Map<string, Row>;
      let op: { type: "insert" | "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;

      const exec = async (): Promise<{ data: unknown; error: Error | null }> => {
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
          const updated: Row = {
            ...(store.get(idFilter) as Row),
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

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase(serverStore);
  },
}));

// Imports après le mock (obligatoire avec vi.mock hoisté).
import { resetOfflineDbForTests } from "@/lib/offline/db";
import { listAllOperations } from "@/lib/offline/syncQueue";
import { processSyncQueue } from "@/lib/offline/syncEngine";
import { PLAN_INPUT_ERRORS, weeklyPlanDaysRepo, writePlanDay } from "./useWeeklyPlan";

const USER_A = "user-a";
const USER_B = "user-b";
const TABLE = "weekly_plan_days";

function serverRows(): Row[] {
  return Array.from(serverStore.get(TABLE)?.values() ?? []);
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writePlanDay — écriture locale d'abord, hors ligne", () => {
  it("crée la ligne en local sans toucher au serveur ; la synchronisation l'y envoie ensuite", async () => {
    await expect(writePlanDay(USER_A, 1, { kind: "rest" })).resolves.toBe("create");

    // Hors ligne : écrit en local, rien n'est parti.
    expect(await weeklyPlanDaysRepo.list(USER_A)).toHaveLength(1);
    expect(serverRows()).toHaveLength(0);
    expect(await listAllOperations(USER_A)).toHaveLength(1);

    await processSyncQueue(USER_A);

    expect(serverRows()).toHaveLength(1);
    expect(serverRows()[0]).toMatchObject({
      user_id: USER_A,
      day_of_week: 1,
      kind: "rest",
      muscle_groups: [],
      template_id: null,
    });
    expect(await listAllOperations(USER_A)).toHaveLength(0);
  });

  it("modifier un jour met à jour SA ligne : jamais de seconde ligne pour le même jour", async () => {
    await writePlanDay(USER_A, 2, { kind: "rest" });
    await expect(writePlanDay(USER_A, 2, { kind: "muscles", groups: ["jambes"] })).resolves.toBe(
      "update",
    );

    const local = await weeklyPlanDaysRepo.list(USER_A);
    expect(local).toHaveLength(1);
    expect(local[0]).toMatchObject({ day_of_week: 2, kind: "muscles", muscle_groups: ["jambes"] });

    await processSyncQueue(USER_A);
    expect(serverRows()).toHaveLength(1);
    expect(serverRows()[0]).toMatchObject({ kind: "muscles", muscle_groups: ["jambes"] });
  });

  it("passer d'une séance sauvegardée à « repos » envoie template_id: null DANS LE MÊME PATCH que kind", async () => {
    await writePlanDay(USER_A, 3, { kind: "template", templateId: "tpl-1" });
    await processSyncQueue(USER_A); // la ligne existe désormais côté serveur
    expect(serverRows()[0]).toMatchObject({ kind: "template", template_id: "tpl-1" });

    await writePlanDay(USER_A, 3, { kind: "rest" });
    const [operation] = await listAllOperations(USER_A);
    // Sans ces deux champs dans le patch, le CHECK `weekly_plan_days_template_only_check`
    // refuserait un « repos » portant encore un template_id : opération blocked,
    // donc point d'attention sur le Profil, pour un simple changement de planning.
    expect(operation.payload).toMatchObject({ kind: "rest", template_id: null, muscle_groups: [] });

    await processSyncQueue(USER_A);
    expect(serverRows()[0]).toMatchObject({ kind: "rest", template_id: null, muscle_groups: [] });
  });

  it("passer de « groupes » à une séance sauvegardée efface les groupes dans le même patch", async () => {
    await writePlanDay(USER_A, 4, { kind: "muscles", groups: ["dos", "pecs"] });
    await processSyncQueue(USER_A);

    await writePlanDay(USER_A, 4, { kind: "template", templateId: "tpl-2" });
    const [operation] = await listAllOperations(USER_A);
    expect(operation.payload).toMatchObject({
      kind: "template",
      template_id: "tpl-2",
      muscle_groups: [],
    });
  });

  it("un contenu identique n'émet AUCUNE opération de synchronisation", async () => {
    await writePlanDay(USER_A, 5, { kind: "muscles", groups: ["dos", "pecs"] });
    await processSyncQueue(USER_A);
    expect(await listAllOperations(USER_A)).toHaveLength(0);

    // Mêmes groupes, saisis dans un autre ordre : c'est le même plan.
    await expect(
      writePlanDay(USER_A, 5, { kind: "muscles", groups: ["pecs", "dos"] }),
    ).resolves.toBe("update");
    expect(await listAllOperations(USER_A)).toHaveLength(0);
  });

  it("effacer un jour supprime sa ligne, localement puis sur le serveur", async () => {
    await writePlanDay(USER_A, 6, { kind: "rest" });
    await processSyncQueue(USER_A);
    expect(serverRows()).toHaveLength(1);

    await expect(writePlanDay(USER_A, 6, null)).resolves.toBe("clear");
    expect(await weeklyPlanDaysRepo.list(USER_A)).toHaveLength(0);

    await processSyncQueue(USER_A);
    expect(serverRows()).toHaveLength(0);
  });

  it("effacer un jour déjà libre : rien à faire, rien dans la file", async () => {
    await expect(writePlanDay(USER_A, 7, null)).resolves.toBe("noop");
    expect(await listAllOperations(USER_A)).toHaveLength(0);
  });

  it("nettoie un doublon (deux appareils ont créé le même jour hors ligne) en gardant la ligne la plus récente", async () => {
    const older = await weeklyPlanDaysRepo.create(USER_A, {
      day_of_week: 1,
      kind: "rest",
      muscle_groups: [],
      template_id: null,
    });
    // La création horodate par une horloge monotone : la seconde est strictement plus récente.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await weeklyPlanDaysRepo.create(USER_A, {
      day_of_week: 1,
      kind: "muscles",
      muscle_groups: ["dos"],
      template_id: null,
    });
    await processSyncQueue(USER_A);
    expect(serverRows()).toHaveLength(2);

    await writePlanDay(USER_A, 1, { kind: "muscles", groups: ["bras"] });

    const local = await weeklyPlanDaysRepo.list(USER_A);
    expect(local.map((r) => r.id)).toEqual([newer.id]);
    expect(local[0]).toMatchObject({ kind: "muscles", muscle_groups: ["bras"] });
    expect(local.some((r) => r.id === older.id)).toBe(false);

    await processSyncQueue(USER_A);
    expect(serverRows().map((r) => r.id)).toEqual([newer.id]);
  });
});

describe("writePlanDay — exclusion et validation", () => {
  it("deux écritures simultanées du MÊME jour ne créent qu'UNE ligne", async () => {
    // Le motif exact que le verrou protège : sans lui, les deux lisent « aucune
    // ligne pour ce jour » et créent chacune la leur.
    await Promise.all([
      writePlanDay(USER_A, 1, { kind: "rest" }),
      writePlanDay(USER_A, 1, { kind: "muscles", groups: ["dos"] }),
    ]);

    const local = await weeklyPlanDaysRepo.list(USER_A);
    expect(local).toHaveLength(1);
    // La dernière demandée l'emporte : l'ordre d'appel est respecté.
    expect(local[0]).toMatchObject({ kind: "muscles", muscle_groups: ["dos"] });
  });

  it("des jours différents s'écrivent indépendamment", async () => {
    await Promise.all([
      writePlanDay(USER_A, 1, { kind: "rest" }),
      writePlanDay(USER_A, 2, { kind: "muscles", groups: ["pecs"] }),
      writePlanDay(USER_A, 3, { kind: "template", templateId: "tpl-1" }),
    ]);
    const local = await weeklyPlanDaysRepo.list(USER_A);
    expect(local.map((r) => r.day_of_week).sort()).toEqual([1, 2, 3]);
  });

  it("refuse des groupes vides SANS rien écrire", async () => {
    await expect(writePlanDay(USER_A, 1, { kind: "muscles", groups: [] })).rejects.toThrow(
      PLAN_INPUT_ERRORS["no-groups"],
    );
    expect(await weeklyPlanDaysRepo.list(USER_A)).toHaveLength(0);
    expect(await listAllOperations(USER_A)).toHaveLength(0);
  });

  it("refuse une séance sauvegardée sans identifiant SANS rien écrire", async () => {
    await expect(writePlanDay(USER_A, 1, { kind: "template", templateId: " " })).rejects.toThrow(
      PLAN_INPUT_ERRORS["no-template"],
    );
    expect(await weeklyPlanDaysRepo.list(USER_A)).toHaveLength(0);
  });

  it("une saisie refusée n'empoisonne pas les écritures suivantes", async () => {
    await expect(writePlanDay(USER_A, 1, { kind: "muscles", groups: [] })).rejects.toThrow();
    await expect(writePlanDay(USER_A, 1, { kind: "rest" })).resolves.toBe("create");
  });

  it("le plan d'un utilisateur n'est jamais touché par un autre", async () => {
    await writePlanDay(USER_A, 1, { kind: "rest" });
    await writePlanDay(USER_B, 1, { kind: "muscles", groups: ["tronc"] });

    expect(await weeklyPlanDaysRepo.list(USER_A)).toHaveLength(1);
    expect((await weeklyPlanDaysRepo.list(USER_A))[0]).toMatchObject({ kind: "rest" });
    expect((await weeklyPlanDaysRepo.list(USER_B))[0]).toMatchObject({
      kind: "muscles",
      muscle_groups: ["tronc"],
    });

    await processSyncQueue(USER_A);
    expect(serverRows()).toHaveLength(1);
    expect(serverRows()[0]).toMatchObject({ user_id: USER_A });
  });
});
