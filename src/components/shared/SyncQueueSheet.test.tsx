// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OfflineSyncState } from "@/hooks/useOfflineSync";
import type { ConflictRecord, SyncOperation } from "@/lib/offline/types";

/**
 * CHANTIER 4, section 5 — vocabulaire utilisateur des conflits, et garde-fou
 * `server_row_deleted` : jamais d'option « garder ma version » (cas 12 du
 * chantier). Le refus côté MOTEUR est déjà couvert par
 * `lib/offline/pgrst116DeletedRowConflict.test.ts` ; ceci vérifie que l'UI ne
 * propose même pas le choix.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SyncQueueSheet } from "./SyncQueueSheet";

function makeConflict(overrides: Partial<ConflictRecord> = {}): ConflictRecord {
  return {
    id: "conflict-1",
    userId: "user-1",
    table: "exercises",
    recordLocalId: "ex-1",
    opType: "update",
    reason: "updated_at_mismatch",
    localData: { name: "Ma version" },
    serverData: { name: "Version serveur" },
    localUpdatedAt: "2026-09-01T06:00:00.000Z",
    serverUpdatedAt: "2026-09-01T06:05:00.000Z",
    detectedAt: "2026-09-01T06:06:00.000Z",
    ...overrides,
  };
}

function makeOperation(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    id: "op-1",
    userId: "user-1",
    table: "exercise_sets",
    recordLocalId: "set-1",
    opType: "update",
    payload: { reps: 10 },
    baseUpdatedAt: "2026-09-01T06:00:00.000Z",
    createdAt: "2026-09-01T06:01:00.000Z",
    status: "pending",
    retryCount: 0,
    lastError: null,
    lastErrorCode: null,
    lastAttemptAt: null,
    ...overrides,
  };
}

function makeSyncState(overrides: Partial<OfflineSyncState> = {}): OfflineSyncState {
  return {
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    blockedCount: 0,
    operations: [],
    conflicts: [],
    syncNow: vi.fn().mockResolvedValue(undefined),
    resolveConflict: vi.fn().mockResolvedValue(undefined),
    retryOperation: vi.fn().mockResolvedValue(undefined),
    discardOperation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function findButtons(label: string | RegExp): HTMLButtonElement[] {
  const matches = (value: string) =>
    typeof label === "string" ? value.includes(label) : label.test(value);
  return Array.from(document.body.querySelectorAll("button")).filter((el) =>
    matches(el.textContent ?? ""),
  );
}

function render(sync: OfflineSyncState) {
  act(() => {
    root.render(<SyncQueueSheet onClose={() => {}} sync={sync} />);
  });
}

describe("SyncQueueSheet — conflits (cas 12 du chantier)", () => {
  it("updated_at_mismatch — « Garder ma version » est proposé", () => {
    render(makeSyncState({ conflicts: [makeConflict({ reason: "updated_at_mismatch" })] }));
    expect(findButtons("Garder ma version")).toHaveLength(1);
    expect(findButtons("Garder la version serveur")).toHaveLength(1);
  });

  it("server_row_deleted — AUCUNE option « garder ma version »", () => {
    render(
      makeSyncState({
        conflicts: [
          makeConflict({
            reason: "server_row_deleted",
            serverData: null,
            serverUpdatedAt: null,
          }),
        ],
      }),
    );
    expect(findButtons("Garder ma version")).toHaveLength(0);
    expect(findButtons("Abandonner ma modification")).toHaveLength(1);
  });

  it("le vocabulaire affiché ne mentionne jamais de nom technique", () => {
    render(
      makeSyncState({
        conflicts: [makeConflict({ reason: "updated_at_mismatch" })],
      }),
    );
    expect(document.body.textContent).not.toMatch(/updated_at_mismatch|server_row_deleted/);
  });
});

describe("SyncQueueSheet — libellés de table en français (MIN-08, chantier 6)", () => {
  it("le nom technique de la table n'apparaît jamais brut — un libellé français lisible est affiché à la place", () => {
    render(
      makeSyncState({
        pendingCount: 1,
        operations: [makeOperation({ table: "exercise_sets", opType: "update" })],
      }),
    );
    expect(document.body.textContent).toContain("Séries");
    // Ni le nom technique brut, ni la capitalisation mot-à-mot anglaise
    // affichée avant correctif ("Exercise sets").
    expect(document.body.textContent).not.toMatch(/exercise_sets|Exercise sets/i);
  });

  it("couvre toutes les tables du domaine offline-first par un libellé français distinct", () => {
    const tables: SyncOperation["table"][] = [
      "exercises",
      "exercise_sets",
      "workouts",
      "workout_segments",
      "workout_templates",
      "workout_analyses",
      "physical_goals",
      "supplements",
      "recipes",
      "recipe_ingredients",
      "recipe_collections",
      "meal_plans",
      "shopping_list",
      "saved_meals",
      "food_custom_foods",
      "nutrition",
      "nutrition_favorites",
    ];
    render(
      makeSyncState({
        pendingCount: tables.length,
        operations: tables.map((table, i) =>
          makeOperation({ id: `op-${i}`, table, recordLocalId: `rec-${i}` }),
        ),
      }),
    );
    for (const table of tables) {
      // Le nom technique AVEC underscore (jamais un mot français) ne doit
      // jamais apparaître brut dans le texte affiché.
      if (table.includes("_")) {
        expect(document.body.textContent).not.toContain(table);
      }
    }
    // Cas concrets avant/après le plus parlants : plus de mot-à-mot anglais
    // capitalisé pour les tables composées.
    expect(document.body.textContent).not.toMatch(/Exercise sets|Nutrition favorites/);
  });

  it("le libellé de repli d'un conflit (sans nom d'entité) reste en français, jamais le nom technique de la table", () => {
    render(
      makeSyncState({
        conflicts: [
          makeConflict({
            table: "nutrition_favorites",
            localData: { calories: 200 }, // pas de champ `name`
          }),
        ],
      }),
    );
    expect(document.body.textContent).toContain("Favoris nutrition");
    expect(document.body.textContent).not.toMatch(/nutrition_favorites/);
  });

  it("les noms de colonnes affichés dans la comparaison de conflit sont en français, pas des clés techniques brutes", () => {
    render(
      makeSyncState({
        conflicts: [
          makeConflict({
            table: "exercise_sets",
            localData: { name: "Développé couché", rest_seconds: 90, set_number: 3 },
            serverData: { name: "Développé couché", rest_seconds: 120, set_number: 3 },
          }),
        ],
      }),
    );
    expect(document.body.textContent).toContain("Repos (s)");
    expect(document.body.textContent).toContain("N° de série");
    expect(document.body.textContent).not.toMatch(/rest_seconds|set_number/);
  });
});
