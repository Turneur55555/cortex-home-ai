import { describe, expect, it, vi } from "vitest";
import { createServerRefreshGate } from "./serverRefreshWindow";

/**
 * CHANTIER 4 — MAJ-04. La garde ne doit JAMAIS remplacer une lecture par une
 * supposition : elle ne fait que supprimer une relecture serveur redondante.
 * Ces tests fixent son contrat exact (déduplication, fenêtre, réouverture,
 * comportement en cas d'échec réseau).
 */

function gateWithClock(windowMs: number) {
  let now = 1_000;
  const gate = createServerRefreshGate({ windowMs, now: () => now });
  return { gate, advance: (ms: number) => (now += ms) };
}

describe("createServerRefreshGate", () => {
  it("exécute la tâche au premier appel (fenêtre vide = premier montage)", async () => {
    const { gate } = gateWithClock(60_000);
    const task = vi.fn().mockResolvedValue(undefined);
    await gate.run("user-a", task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("ignore un second appel dans la fenêtre (validation de série)", async () => {
    const { gate } = gateWithClock(60_000);
    const task = vi.fn().mockResolvedValue(undefined);
    await gate.run("user-a", task);
    await gate.run("user-a", task);
    await gate.run("user-a", task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("réexécute une fois la fenêtre écoulée", async () => {
    const { gate, advance } = gateWithClock(60_000);
    const task = vi.fn().mockResolvedValue(undefined);
    await gate.run("user-a", task);
    advance(59_999);
    await gate.run("user-a", task);
    expect(task).toHaveBeenCalledTimes(1);
    advance(2);
    await gate.run("user-a", task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("déduplique les appels CONCURRENTS : les 4 queries montées partagent un aller-retour", async () => {
    const { gate } = gateWithClock(60_000);
    let resolveTask: () => void = () => undefined;
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTask = resolve;
        }),
    );
    const all = Promise.all([
      gate.run("user-a", task),
      gate.run("user-a", task),
      gate.run("user-a", task),
      gate.run("user-a", task),
    ]);
    expect(task).toHaveBeenCalledTimes(1);
    resolveTask();
    await all;
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("chaque utilisateur a sa propre fenêtre — aucune fuite entre comptes", async () => {
    const { gate } = gateWithClock(60_000);
    const task = vi.fn().mockResolvedValue(undefined);
    await gate.run("user-a", task);
    await gate.run("user-b", task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("markStale rouvre la fenêtre (retour réseau, changement de compte)", async () => {
    const { gate } = gateWithClock(60_000);
    const task = vi.fn().mockResolvedValue(undefined);
    await gate.run("user-a", task);
    await gate.run("user-a", task);
    expect(task).toHaveBeenCalledTimes(1);
    gate.markStale();
    await gate.run("user-a", task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("force ignore la fenêtre sans la court-circuiter pour les autres", async () => {
    const { gate } = gateWithClock(60_000);
    const task = vi.fn().mockResolvedValue(undefined);
    await gate.run("user-a", task);
    await gate.run("user-a", task, { force: true });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("un échec réseau NE referme PAS la fenêtre — la lecture est retentée", async () => {
    const { gate } = gateWithClock(60_000);
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(undefined);
    await expect(gate.run("user-a", task)).rejects.toThrow("network down");
    await gate.run("user-a", task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("un échec ne laisse pas de promesse en vol qui bloquerait les appels suivants", async () => {
    const { gate } = gateWithClock(60_000);
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(gate.run("user-a", failing)).rejects.toThrow("boom");
    const ok = vi.fn().mockResolvedValue(undefined);
    await gate.run("user-a", ok);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
