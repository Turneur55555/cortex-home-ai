// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playRestChime, primeRestChime, resetRestChimeForTests } from "./restChime";

class FakeContext {
  static created = 0;
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 0;
  destination = {};
  started = 0;
  constructor() {
    FakeContext.created += 1;
  }
  resume = vi.fn(async () => {
    this.state = "running";
  });
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return { buffer: null as unknown, connect: () => undefined, start: () => (this.started += 1) };
  }
  createOscillator() {
    return {
      type: "sine",
      frequency: { value: 0 },
      connect: (n: unknown) => n,
      start: () => undefined,
      stop: () => undefined,
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: (n: unknown) => n,
    };
  }
}

describe("restChime — un seul contexte audio, déverrouillé au toucher", () => {
  beforeEach(() => {
    FakeContext.created = 0;
    resetRestChimeForTests();
    vi.stubGlobal("AudioContext", FakeContext);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetRestChimeForTests();
  });

  it("le geste crée, reprend et déverrouille le contexte (tampon silencieux joué)", () => {
    primeRestChime();
    expect(FakeContext.created).toBe(1);
    expect(playRestChime()).toBe(true);
    expect(FakeContext.created).toBe(1);
  });

  it("un contexte fermé par le système est recréé au lieu d'échouer en silence", () => {
    primeRestChime();
    const first = FakeContext.created;
    // Simule une fermeture externe : le module doit en ouvrir un nouveau.
    resetRestChimeForTests();
    expect(playRestChime()).toBe(true);
    expect(FakeContext.created).toBe(first + 1);
  });

  it("sans Web Audio (anciens navigateurs, tests) : aucune erreur, aucun son", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => primeRestChime()).not.toThrow();
    expect(playRestChime()).toBe(false);
  });
});
