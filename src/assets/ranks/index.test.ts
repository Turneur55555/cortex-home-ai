import { describe, expect, it } from "vitest";
import { getPlaceholderIllustration, getRankIllustration } from "./index";

describe("getRankIllustration", () => {
  it("retourne l'illustration du rang quand le fichier existe", () => {
    expect(getRankIllustration("guerrier")).toEqual(expect.stringContaining("guerrier"));
  });

  it("ne retombe jamais sur l'illustration d'un autre rang", () => {
    // Aucun de ces rangs n'a de fichier dédié à ce jour : ne doit jamais
    // renvoyer l'illustration de "guerrier" (ou de tout autre rang).
    for (const key of ["mortel", "heros", "titan", "olympien", "primordial"] as const) {
      expect(getRankIllustration(key)).toBeNull();
    }
  });

  it("n'a pas de placeholder.webp déposé à ce jour", () => {
    expect(getPlaceholderIllustration()).toBeNull();
  });
});
