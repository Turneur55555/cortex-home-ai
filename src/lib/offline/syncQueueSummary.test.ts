import { describe, expect, it } from "vitest";
import { summarizeSyncQueue, type SyncQueueSummaryInput } from "./syncQueueSummary";

/**
 * Résumé affiché par le bloc « Synchronisation » du Profil
 * (`components/profile/SyncStatusCard.tsx`), qui remplace l'indicateur
 * flottant monté globalement (audit UI du 01/09/2026).
 *
 * Logique pure : ces tests couvrent les 5 états demandés + le hors-connexion,
 * l'ordre de priorité entre eux, et surtout le COMPTEUR — il doit refléter
 * exactement les opérations encore dans la file, avec la même définition que
 * le pied du panneau détaillé (`SyncQueueSheet`), sinon les deux se
 * contrediraient à l'écran.
 */

const BASE: SyncQueueSummaryInput = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  blockedCount: 0,
  conflictCount: 0,
};

describe("summarizeSyncQueue — états du bloc Profil", () => {
  it("état 1 — tout est synchronisé", () => {
    const summary = summarizeSyncQueue(BASE);
    expect(summary.label).toBe("Synchronisé");
    expect(summary.tone).toBe("ok");
    expect(summary.needsAttention).toBe(false);
    expect(summary.queuedCount).toBe(0);
    expect(summary.hasDetails).toBe(false);
  });

  it("état 2 — synchronisation en cours", () => {
    const summary = summarizeSyncQueue({ ...BASE, isSyncing: true, pendingCount: 2 });
    expect(summary.label).toBe("Synchronisation…");
    expect(summary.tone).toBe("syncing");
    expect(summary.needsAttention).toBe(false);
  });

  it("état 3 — actions en attente (TEST UI 3 : le compteur est réel)", () => {
    expect(summarizeSyncQueue({ ...BASE, pendingCount: 3 }).label).toBe("3 actions en attente");
    expect(summarizeSyncQueue({ ...BASE, pendingCount: 1 }).label).toBe("1 action en attente");
    expect(summarizeSyncQueue({ ...BASE, pendingCount: 3 }).tone).toBe("pending");
  });

  it("état 4 — échec temporaire", () => {
    const summary = summarizeSyncQueue({ ...BASE, failedCount: 2 });
    expect(summary.label).toBe("Synchronisation en attente");
    expect(summary.detail).toMatch(/2 actions en échec temporaire/);
    expect(summary.tone).toBe("warning");
    expect(summary.needsAttention).toBe(false);
  });

  it("état 5 — action bloquée (TEST UI 5 : état d'attention)", () => {
    const one = summarizeSyncQueue({ ...BASE, blockedCount: 1 });
    expect(one.label).toBe("1 action nécessite votre attention");
    expect(one.tone).toBe("attention");
    expect(one.needsAttention).toBe(true);

    const many = summarizeSyncQueue({ ...BASE, blockedCount: 4 });
    expect(many.label).toBe("4 actions nécessitent votre attention");
    expect(many.needsAttention).toBe(true);
  });

  it("hors connexion — les actions partiront au retour du réseau", () => {
    const idle = summarizeSyncQueue({ ...BASE, isOnline: false });
    expect(idle.label).toBe("Hors connexion");
    expect(idle.tone).toBe("offline");

    const queued = summarizeSyncQueue({ ...BASE, isOnline: false, pendingCount: 2 });
    expect(queued.detail).toMatch(/2 actions partiront au retour du réseau/);
  });

  it("un conflit passe avant tout le reste et demande une intervention", () => {
    const summary = summarizeSyncQueue({
      ...BASE,
      conflictCount: 1,
      blockedCount: 2,
      pendingCount: 5,
      isSyncing: true,
    });
    expect(summary.label).toBe("Conflit à résoudre");
    expect(summary.tone).toBe("attention");
    expect(summary.needsAttention).toBe(true);
  });

  it("ordre de priorité : bloquée > hors connexion > en cours > échec > en attente", () => {
    expect(summarizeSyncQueue({ ...BASE, blockedCount: 1, isOnline: false }).tone).toBe(
      "attention",
    );
    expect(summarizeSyncQueue({ ...BASE, isOnline: false, isSyncing: true }).tone).toBe("offline");
    expect(summarizeSyncQueue({ ...BASE, isSyncing: true, failedCount: 1 }).tone).toBe("syncing");
    expect(summarizeSyncQueue({ ...BASE, failedCount: 1, pendingCount: 3 }).tone).toBe("warning");
  });

  it("TEST UI 3 — `queuedCount` = pending + failed + blocked, comme le pied du panneau détaillé", () => {
    const summary = summarizeSyncQueue({
      ...BASE,
      pendingCount: 3,
      failedCount: 2,
      blockedCount: 1,
    });
    expect(summary.queuedCount).toBe(6);
    expect(summary.hasDetails).toBe(true);
  });
});
