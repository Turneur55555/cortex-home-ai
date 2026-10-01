import { describe, expect, it } from "vitest";
import { CORPS_TAB_KEYS, CORPS_TAB_LABELS, corpsSearchSchema, resolveCorpsTab } from "./corpsTabs";

describe("corpsTabs", () => {
  it("trois onglets, dans l'ordre de la maquette : Objectif | Mesures | Santé", () => {
    expect(CORPS_TAB_KEYS.map((key) => CORPS_TAB_LABELS[key])).toEqual([
      "Objectif",
      "Mesures",
      "Santé",
    ]);
  });

  describe("resolveCorpsTab", () => {
    it("un onglet demandé dans l'URL l'emporte toujours", () => {
      expect(resolveCorpsTab("sante", false)).toBe("sante");
      expect(resolveCorpsTab("mesures", true)).toBe("mesures");
      expect(resolveCorpsTab("objectif", false)).toBe("objectif");
    });

    it("sans onglet demandé : « Objectif » pour qui a un objectif actif", () => {
      expect(resolveCorpsTab(undefined, true)).toBe("objectif");
    });

    it("sans onglet ni objectif : « Mesures » — jamais un écran de configuration vide", () => {
      expect(resolveCorpsTab(undefined, false)).toBe("mesures");
    });
  });

  describe("corpsSearchSchema — une valeur invalide est ignorée, jamais fatale", () => {
    it("accepte les trois onglets", () => {
      for (const onglet of CORPS_TAB_KEYS) {
        expect(corpsSearchSchema.parse({ onglet }).onglet).toBe(onglet);
      }
    });

    it("onglet inconnu ou non textuel : ignoré", () => {
      expect(corpsSearchSchema.parse({ onglet: "n-importe-quoi" }).onglet).toBeUndefined();
      expect(corpsSearchSchema.parse({ onglet: 3 }).onglet).toBeUndefined();
    });

    it("aucun paramètre : tout est facultatif", () => {
      expect(corpsSearchSchema.parse({})).toEqual({});
    });
  });
});
