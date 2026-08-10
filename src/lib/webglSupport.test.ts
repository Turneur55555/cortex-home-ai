import { describe, expect, it } from "vitest";
import { isWebGLAvailable } from "./webglSupport";

describe("isWebGLAvailable", () => {
  it("ne lève jamais d'exception, quel que soit l'environnement", () => {
    expect(() => isWebGLAvailable()).not.toThrow();
  });

  it("retourne un booléen (jsdom n'implémente pas WebGL → false attendu ici)", () => {
    expect(typeof isWebGLAvailable()).toBe("boolean");
    expect(isWebGLAvailable()).toBe(false);
  });
});
