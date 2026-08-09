import { describe, expect, it } from "vitest";
import {
  shouldTriggerAscension,
  buildLegacyPromotionEvents,
  buildCortexAscensionEvents,
  mergePromotionTimeline,
} from "./ascension";

// Points médians des 6 bandes de Titre (0-4 Mortel, 5-9 Guerrier, 10-14
// Héros, 15-19 Colosse, 20-24 Olympien, 25-29 Titan).
const MORTEL = 2;
const GUERRIER = 7;
const HEROS = 12;
const COLOSSE = 17;
const OLYMPIEN = 22;
const TITAN = 27;

describe("shouldTriggerAscension — §12 tests obligatoires Ascension", () => {
  it("aucun changement de Titre (même palier) → aucun événement", () => {
    expect(shouldTriggerAscension(HEROS, HEROS)).toBe(false);
  });

  it("changement de grade sans changement de Titre → aucun événement", () => {
    // Héros II (11) -> Héros IV (13) : toujours Héros.
    expect(shouldTriggerAscension(11, 13)).toBe(false);
  });

  it("Mortel → Guerrier → événement", () => {
    expect(shouldTriggerAscension(MORTEL, GUERRIER)).toBe(true);
  });

  it("Guerrier → Héros → événement", () => {
    expect(shouldTriggerAscension(GUERRIER, HEROS)).toBe(true);
  });

  it("Héros → Colosse → événement", () => {
    expect(shouldTriggerAscension(HEROS, COLOSSE)).toBe(true);
  });

  it("Colosse → Olympien → événement", () => {
    expect(shouldTriggerAscension(COLOSSE, OLYMPIEN)).toBe(true);
  });

  it("Olympien → Titan → événement", () => {
    expect(shouldTriggerAscension(OLYMPIEN, TITAN)).toBe(true);
  });

  it("régression (baisse de Titre) → aucun événement, jamais de désascension", () => {
    expect(shouldTriggerAscension(COLOSSE, HEROS)).toBe(false);
  });

  it("premier calcul jamais enregistré (previousTierIndex = null) → toujours un événement (première classification, mirroir exact de la logique serveur)", () => {
    expect(shouldTriggerAscension(null, HEROS)).toBe(true);
    expect(shouldTriggerAscension(null, MORTEL)).toBe(true);
  });

  it("aucun paramètre XP dans la signature — l'XP ne peut structurellement pas déclencher d'Ascension", () => {
    // Vérifie que la fonction n'accepte que des tierIndex (Puissance
    // Cortex) — deux arguments, tous deux des paliers 0-29, jamais un
    // montant XP.
    expect(shouldTriggerAscension.length).toBe(2);
  });
});

describe("buildLegacyPromotionEvents — historique gelé (ère XP)", () => {
  it("projette les lignes rank_promotions sans les recalculer", () => {
    const events = buildLegacyPromotionEvents([
      { tier_index: 10, xp_at_promotion: 8000, created_at: "2026-07-01T00:00:00Z" },
    ]);
    expect(events).toEqual([
      {
        source: "legacy",
        tierIndex: 10,
        isRankUp: true,
        rankKey: "heros",
        rankLabel: "Héros",
        gradeLabel: "Célèbre",
        xp: 8000,
        date: "2026-07-01T00:00:00Z",
      },
    ]);
  });
});

describe("buildCortexAscensionEvents — nouveau moteur", () => {
  it("projette une Ascension avec Titre précédent et Puissance Cortex", () => {
    const events = buildCortexAscensionEvents([
      { tier_index: 15, previous_tier_index: 12, created_at: "2026-08-29T00:00:00Z" },
    ]);
    expect(events).toEqual([
      {
        source: "ascension",
        tierIndex: 15,
        rankKey: "colosse",
        rankLabel: "Colosse",
        previousRankKey: "heros",
        previousRankLabel: "Héros",
        cortexPower: 15,
        date: "2026-08-29T00:00:00Z",
      },
    ]);
  });

  it("première Ascension jamais enregistrée (previous_tier_index null) → pas de Titre précédent", () => {
    const events = buildCortexAscensionEvents([
      { tier_index: 5, previous_tier_index: null, created_at: "2026-08-29T00:00:00Z" },
    ]);
    expect(events[0].source === "ascension" && events[0].previousRankKey).toBeNull();
  });
});

describe("mergePromotionTimeline — §12 tests obligatoires Historique", () => {
  it("une Ascension réelle apparaît dans l'historique fusionné", () => {
    const merged = mergePromotionTimeline(
      [{ tier_index: 8, xp_at_promotion: 5000, created_at: "2026-06-01T00:00:00Z" }],
      [{ tier_index: 15, previous_tier_index: 12, created_at: "2026-08-29T00:00:00Z" }],
    );
    expect(merged).toHaveLength(2);
    expect(merged.some((e) => e.source === "ascension" && e.tierIndex === 15)).toBe(true);
    expect(merged.some((e) => e.source === "legacy" && e.tierIndex === 8)).toBe(true);
  });

  it("trie du plus récent au plus ancien, toutes sources confondues", () => {
    const merged = mergePromotionTimeline(
      [{ tier_index: 8, xp_at_promotion: 5000, created_at: "2026-01-01T00:00:00Z" }],
      [{ tier_index: 15, previous_tier_index: 12, created_at: "2026-08-29T00:00:00Z" }],
    );
    expect(merged[0].date).toBe("2026-08-29T00:00:00Z");
    expect(merged[1].date).toBe("2026-01-01T00:00:00Z");
  });

  it("aucune donnée des deux côtés → historique vide, pas d'événement fabriqué", () => {
    expect(mergePromotionTimeline([], [])).toEqual([]);
  });
});
