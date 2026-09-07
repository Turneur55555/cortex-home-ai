import { describe, expect, it } from "vitest";
import {
  REWARD_POLL_FAST_MS,
  REWARD_POLL_IDLE_MS,
  REWARD_POLL_SLOW_MS,
  rewardSnapshotPollIntervalMs,
} from "./rewardPolling";

/**
 * CHANTIER FINAL (AUD-12) — cadence de relecture de la récompense.
 *
 * Ce qui compte ici tient en deux règles, et rien d'autre ne doit changer :
 * la cadence NOMINALE des premières secondes est intacte (le cas courant,
 * celui où la récompense arrive normalement), et la relecture ne s'arrête
 * JAMAIS d'elle-même — sinon une récompense versée tardivement (réseau
 * revenu, opération débloquée à la main) ne s'afficherait plus.
 */

describe("rewardSnapshotPollIntervalMs", () => {
  it("cadence nominale inchangée pendant les 30 premières secondes", () => {
    expect(rewardSnapshotPollIntervalMs(0)).toBe(REWARD_POLL_FAST_MS);
    expect(rewardSnapshotPollIntervalMs(1_500)).toBe(REWARD_POLL_FAST_MS);
    expect(rewardSnapshotPollIntervalMs(29_999)).toBe(REWARD_POLL_FAST_MS);
  });

  it("s'espace au-delà de 30 s d'attente", () => {
    expect(rewardSnapshotPollIntervalMs(30_000)).toBe(REWARD_POLL_SLOW_MS);
    expect(rewardSnapshotPollIntervalMs(119_999)).toBe(REWARD_POLL_SLOW_MS);
  });

  it("s'espace encore au-delà de 2 min — mais ne s'arrête pas", () => {
    expect(rewardSnapshotPollIntervalMs(120_000)).toBe(REWARD_POLL_IDLE_MS);
    expect(rewardSnapshotPollIntervalMs(60 * 60 * 1000)).toBe(REWARD_POLL_IDLE_MS);
  });

  it("ne renvoie JAMAIS 0, une valeur négative ou l'arrêt", () => {
    for (const elapsed of [
      -1,
      0,
      10,
      30_000,
      120_000,
      10 ** 9,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const interval = rewardSnapshotPollIntervalMs(elapsed);
      expect(Number.isFinite(interval), `elapsed=${elapsed}`).toBe(true);
      expect(interval, `elapsed=${elapsed}`).toBeGreaterThan(0);
    }
  });

  it("la cadence est monotone : elle ne se réaccélère jamais avec le temps", () => {
    let previous = 0;
    for (let elapsed = 0; elapsed <= 300_000; elapsed += 1_000) {
      const interval = rewardSnapshotPollIntervalMs(elapsed);
      expect(interval, `elapsed=${elapsed}`).toBeGreaterThanOrEqual(previous);
      previous = interval;
    }
  });
});
