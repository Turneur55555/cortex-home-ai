import { describe, expect, it } from "vitest";
import { isTabActive, type TabRoute } from "./navigationTabs";

const TABS: TabRoute[] = ["/", "/seances", "/nutrition", "/profil"];
const activeTabs = (pathname: string) => TABS.filter((tab) => isTabActive(tab, pathname));

describe("isTabActive — quel onglet est allumé", () => {
  it("un seul onglet à la fois sur chaque écran d'onglet", () => {
    expect(activeTabs("/")).toEqual(["/"]);
    expect(activeTabs("/seances")).toEqual(["/seances"]);
    expect(activeTabs("/nutrition")).toEqual(["/nutrition"]);
    expect(activeTabs("/profil")).toEqual(["/profil"]);
  });

  it("Séances reste allumé sur ses deux étages et sur les bilans de semaine", () => {
    for (const path of [
      "/seances",
      "/chroniques",
      "/semaine",
      "/semaine/2026-09-28",
      "/chroniques/quelque-chose",
    ]) {
      expect(activeTabs(path), path).toEqual(["/seances"]);
    }
  });

  it("jamais un simple préfixe de texte : « /seancesX » n'est pas « /seances »", () => {
    expect(activeTabs("/seances-archive")).toEqual([]);
    expect(activeTabs("/chroniques2")).toEqual([]);
    expect(activeTabs("/semaines")).toEqual([]);
    expect(activeTabs("/profilage")).toEqual([]);
  });

  it("les sous-pages d'un onglet restent à lui", () => {
    expect(activeTabs("/nutrition/recettes")).toEqual(["/nutrition"]);
    expect(activeTabs("/profil/reglages")).toEqual(["/profil"]);
  });

  it("Corps appartient à Profil (E19) : l'onglet Profil reste allumé pendant toute la visite", () => {
    expect(activeTabs("/corps")).toEqual(["/profil"]);
    expect(activeTabs("/corps/quelque-chose")).toEqual(["/profil"]);
    expect(activeTabs("/corpsX")).toEqual([]); // jamais un simple préfixe de texte
  });

  it("un écran qui n'est dans aucun onglet n'en allume aucun (Rapports, Documents…)", () => {
    expect(activeTabs("/rapports")).toEqual([]);
    expect(activeTabs("/rapports/abc")).toEqual([]);
    expect(activeTabs("/documents")).toEqual([]);
  });

  it("l'accueil n'est allumé QUE sur « / »", () => {
    expect(isTabActive("/", "/seances")).toBe(false);
    expect(isTabActive("/", "/corps")).toBe(false);
  });
});
