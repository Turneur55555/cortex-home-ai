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
 * Bug prod du 01/09/2026 — la file « Modification · Exercises » s'accumule et
 * plus rien ne part.
 *
 * CAUSE RACINE : `@supabase/supabase-js` ne pose aucun `AbortSignal` ni
 * timeout, et chaque appel PostgREST commence par un `await
 * auth.getSession()` AVANT le fetch HTTP. Sur une socket morte (réseau
 * mobile, `navigator.onLine` reste `true`), la promesse ne se règle JAMAIS :
 * ni résultat, ni erreur. `applyOperation` restait suspendu pour toujours,
 * `processSyncQueue` ne rendait plus la main, et le verrou de ré-entrance de
 * `useOfflineSync` n'était jamais relâché — toute la synchronisation était
 * gelée jusqu'au rechargement de l'app, chaque nouvelle action s'empilant en
 * `pending` (jamais `failed`, jamais `blocked`, `retryCount: 0`).
 *
 * Ces tests verrouillent le correctif (`withTimeout` dans `syncEngine.ts`) :
 * une requête sans réponse devient une erreur ORDINAIRE, qui suit le chemin
 * d'échec DÉJÀ en place (chantier 1) — `failed` + backoff + erreur visible —
 * et `processSyncQueue` rend toujours la main.
 *
 * NB timers : `vi.useFakeTimers()` complet gèlerait aussi fake-indexeddb (ses
 * IDBRequest ne résoudraient plus jamais, cf. la même remarque dans
 * `offlineSync.test.ts`). On ne truque donc QUE `setTimeout`/`clearTimeout`/
 * `Date` — fake-indexeddb, lui, s'ordonnance sur `setImmediate`
 * (`fake-indexeddb/lib/scheduling`), qui reste réel.
 */

type Row = Record<string, unknown> & { id: string; updated_at?: string };

interface FakeSupabaseControl {
  /** Nombre de prochaines requêtes qui ne se règlent JAMAIS (socket morte). */
  hangNext: number;
  /** Passe à `true` dès qu'une requête suspendue a réellement été émise. */
  hangIssued: boolean;
  /** Requêtes réellement parties au « serveur » (les suspendues comprises). */
  issued: string[];
}

const control: FakeSupabaseControl = { hangNext: 0, hangIssued: false, issued: [] };
const serverRows = new Map<string, Row>();
let serverClock = 0;

function nextServerTimestamp(): string {
  serverClock += 1;
  return new Date(Date.UTC(2026, 8, 1, 7, 0, serverClock)).toISOString();
}

/** Simulateur PostgREST minimal mais fidèle sur les points qui comptent ici :
 *  trigger serveur `set_updated_at` à chaque UPDATE, et `.single()` qui rend
 *  `PGRST116` quand la clause `eq("id", …)` ne matche aucune ligne. */
function createFakeSupabase() {
  return {
    from(table: string) {
      let op: { type: "upsert" | "update" | "delete"; payload?: Row } | null = null;
      let idFilter: string | null = null;
      let wantsSingle = false;

      const exec = async (): Promise<{ data: unknown; error: unknown }> => {
        const label = `${op?.type ?? "select"} ${table}`;
        control.issued.push(label);
        if (control.hangNext > 0) {
          control.hangNext -= 1;
          control.hangIssued = true;
          // Ni résolution, ni rejet : exactement une socket morte.
          return new Promise<never>(() => {});
        }
        if (!op) {
          return { data: (idFilter ? serverRows.get(idFilter) : null) ?? null, error: null };
        }
        if (op.type === "upsert") {
          const row = { ...(op.payload as Row) };
          serverRows.set(row.id, row);
          return { data: row, error: null };
        }
        if (op.type === "update") {
          const existing = idFilter ? serverRows.get(idFilter) : undefined;
          if (!existing) {
            return wantsSingle
              ? {
                  data: null,
                  error: {
                    message: "JSON object requested, multiple (or no) rows returned",
                    code: "PGRST116",
                    details: "The result contains 0 rows",
                    hint: null,
                  },
                }
              : { data: null, error: null };
          }
          const updated: Row = {
            ...existing,
            ...(op.payload as Row),
            updated_at: nextServerTimestamp(),
          };
          serverRows.set(updated.id, updated);
          return { data: updated, error: null };
        }
        if (idFilter) serverRows.delete(idFilter);
        return { data: null, error: null };
      };

      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (column === "id") idFilter = value;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        upsert: (payload: Row) => {
          op = { type: "upsert", payload };
          return builder;
        },
        update: (payload: Row) => {
          op = { type: "update", payload };
          return builder;
        },
        delete: () => {
          op = { type: "delete" };
          return builder;
        },
        maybeSingle: () => exec(),
        single: () => {
          wantsSingle = true;
          return exec();
        },
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          exec().then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase();
  },
}));

// Imports après le mock (obligatoire avec vi.mock hoisté).
import { resetOfflineDbForTests } from "./db";
import { createOfflineRepository, hydrateEntitiesFromServer } from "./repository";
import { listAllOperations } from "./syncQueue";
import { processSyncQueue, REQUEST_TIMEOUT_MS } from "./syncEngine";

interface ExerciseRow extends Row {
  id: string;
  user_id: string;
  workout_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

const USER = "user-timeout";
const exercisesRepo = createOfflineRepository<ExerciseRow>("exercises");

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
  serverRows.clear();
  serverClock = 0;
  control.hangNext = 0;
  control.hangIssued = false;
  control.issued = [];
});

afterEach(() => {
  vi.useRealTimers();
});

/** Rend la main à la boucle d'événements réelle (fake-indexeddb utilise
 *  `setImmediate`, jamais truqué ici) jusqu'à ce que `condition` soit vraie. */
async function waitFor(condition: () => boolean, maxTicks = 200): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("waitFor: condition jamais satisfaite");
}

async function seedServerExercises(count: number): Promise<ExerciseRow[]> {
  const rows: ExerciseRow[] = [];
  for (let i = 0; i < count; i++) {
    const row: ExerciseRow = {
      id: `ex-${i}`,
      user_id: USER,
      workout_id: "workout-1",
      name: `Exercice ${i}`,
      position: i,
      created_at: "2026-09-01T06:00:00.000Z",
      updated_at: "2026-09-01T06:00:00.000Z",
    };
    serverRows.set(row.id, row);
    rows.push(row);
  }
  await hydrateEntitiesFromServer("exercises", USER, rows);
  return rows;
}

describe("syncEngine — bornage des appels réseau (bug file bloquée du 01/09/2026)", () => {
  it("TEST 1 — un appel réseau qui ne se résout JAMAIS devient un échec ordinaire, et la file continue", async () => {
    await seedServerExercises(2);

    // Deux modifications d'exercices, comme dans le scénario réel.
    await exercisesRepo.update("ex-0", USER, { name: "Développé couché" });
    await exercisesRepo.update("ex-1", USER, { name: "Écarté poulie haute" });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-09-01T07:00:00.000Z"));

    // La toute première requête (la lecture serveur du détecteur de conflit
    // de la 1re opération) part et ne revient jamais.
    control.hangNext = 1;

    const pass = processSyncQueue(USER, { respectBackoff: true });

    // On attend que la requête suspendue soit réellement partie, PUIS on
    // fait expirer le délai du moteur.
    await waitFor(() => control.hangIssued);
    vi.advanceTimersByTime(REQUEST_TIMEOUT_MS + 1);

    // ── L'ESSENTIEL : la passe rend la main. Avant le correctif, ce `await`
    //    ne se résolvait jamais et tout le moteur restait gelé.
    const result = await pass;

    expect(result.retried).toBe(1);
    // …et la file a CONTINUÉ : la 2e opération est bien partie au serveur.
    expect(result.succeeded).toBe(1);
    expect(serverRows.get("ex-1")?.name).toBe("Écarté poulie haute");

    const afterTimeout = await listAllOperations(USER);
    expect(afterTimeout).toHaveLength(1);
    const failed = afterTimeout[0];
    expect(failed.recordLocalId).toBe("ex-0");
    // Échec ORDINAIRE : `failed` (retryable), jamais `blocked`.
    expect(failed.status).toBe("failed");
    expect(failed.retryCount).toBe(1);
    // Erreur visible par l'utilisateur dans le panneau de synchronisation.
    expect(failed.lastError).toMatch(/n'a pas répondu/);
    // Pas de code Postgres : c'est bien ce qui garantit `failed` et non
    // `blocked` (cf. `isBlockingSyncError`).
    expect(failed.lastErrorCode).toBeNull();

    // Le backoff du chantier 1 s'applique tel quel : 2 000 × 2^1 = 4 000 ms.
    control.issued = [];
    vi.advanceTimersByTime(1_000);
    await processSyncQueue(USER, { respectBackoff: true });
    expect(control.issued).toEqual([]); // trop tôt : rien n'est retenté
    expect((await listAllOperations(USER))[0].status).toBe("failed");

    // Backoff expiré : la tentative ultérieure a bien lieu et aboutit.
    vi.advanceTimersByTime(5_000);
    const retryResult = await processSyncQueue(USER, { respectBackoff: true });
    expect(retryResult.succeeded).toBe(1);
    expect(await listAllOperations(USER)).toHaveLength(0);
    expect(serverRows.get("ex-0")?.name).toBe("Développé couché");
  });

  it("TEST 2 — ligne absente du serveur : comportement existant inchangé (PGRST116, retryable)", async () => {
    // Entité connue localement comme synchronisée, mais absente du serveur.
    await seedServerExercises(1);
    serverRows.delete("ex-0");

    await exercisesRepo.update("ex-0", USER, { name: "Fantôme" });

    for (let pass = 0; pass < 3; pass++) {
      await processSyncQueue(USER, {});
    }

    const ops = await listAllOperations(USER);
    expect(ops).toHaveLength(1);
    expect(ops[0].status).toBe("failed");
    expect(ops[0].lastErrorCode).toBe("PGRST116");
    expect(ops[0].retryCount).toBe(3);
    // Inchangé : PGRST116 n'est pas classé comme définitif, l'opération
    // reste retryable (elle n'est jamais passée `blocked`).
    expect(ops[0].lastError).toMatch(/PGRST116/);
  });

  it("TEST 2 bis — une requête qui répond normalement n'est jamais coupée", async () => {
    await seedServerExercises(1);
    await exercisesRepo.update("ex-0", USER, { name: "Rapide" });

    const result = await processSyncQueue(USER, { respectBackoff: true });

    expect(result.succeeded).toBe(1);
    expect(result.retried).toBe(0);
    expect(await listAllOperations(USER)).toHaveLength(0);
    expect(serverRows.get("ex-0")?.name).toBe("Rapide");
  });
});
