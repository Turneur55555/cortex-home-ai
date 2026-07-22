import { describe, expect, it } from "vitest";
import { RANK_TIERS, type RankKey } from "@/lib/fitness/exerciseRanks";
import {
  MATERIAL_GRAIN,
  RANK_AMBIANCE,
  rankGlowShadow,
  rankRelief,
  rankRingInset,
  rankSurfaceShadow,
  rankTextGlow,
  rankThemeByKey,
  rankTierByKey,
} from "./rankTheme";

describe("rankTierByKey", () => {
  it("retrouve le bon RankTier pour chaque clé de RANK_TIERS", () => {
    for (const tier of RANK_TIERS) {
      expect(rankTierByKey(tier.key)).toBe(tier);
    }
  });

  it("lève une erreur explicite pour une clé inconnue", () => {
    expect(() => rankTierByKey("inexistant" as RankKey)).toThrow(/inconnue/);
  });
});

describe("rankThemeByKey", () => {
  it("retourne les couleurs officielles du rang (mêmes valeurs que RANK_TIERS)", () => {
    const titan = RANK_TIERS.find((t) => t.key === "titan")!;
    expect(rankThemeByKey("titan")).toEqual(titan.colors);
  });

  it("retourne un thème différent pour deux rangs différents", () => {
    expect(rankThemeByKey("mortel")).not.toEqual(rankThemeByKey("primordial"));
  });
});

describe("rankRingInset", () => {
  it("construit un liseré intérieur avec l'alpha par défaut (30)", () => {
    expect(rankRingInset("#b91c1c")).toBe("inset 0 0 0 1px #b91c1c30");
  });

  it("accepte un alpha explicite", () => {
    expect(rankRingInset("#b91c1c", "55")).toBe("inset 0 0 0 1px #b91c1c55");
  });
});

describe("rankGlowShadow", () => {
  it("assemble y/blur/spread autour de la couleur de halo", () => {
    expect(rankGlowShadow("rgba(239,68,68,0.55)", 10, 28, -14)).toBe(
      "10px 28px -14px rgba(239,68,68,0.55)",
    );
  });

  it("supporte un spread positif ou nul", () => {
    expect(rankGlowShadow("red", 0, 16, 0)).toBe("0px 16px 0px red");
  });
});

describe("rankSurfaceShadow", () => {
  it("combine liseré (alpha par défaut) et halo", () => {
    const theme = { primary: "#2563eb", glow: "rgba(234,179,8,0.6)" };
    expect(rankSurfaceShadow(theme, { y: 10, blur: 40, spread: -20 })).toBe(
      "inset 0 0 0 1px #2563eb30, 10px 40px -20px rgba(234,179,8,0.6)",
    );
  });

  it("respecte un ringAlpha personnalisé", () => {
    const theme = { primary: "#2563eb", glow: "rgba(234,179,8,0.6)" };
    expect(rankSurfaceShadow(theme, { ringAlpha: "55", y: 6, blur: 22, spread: -12 })).toBe(
      "inset 0 0 0 1px #2563eb55, 6px 22px -12px rgba(234,179,8,0.6)",
    );
  });

  it("accepte un objet partiel du thème (uniquement primary + glow)", () => {
    // Les appelants (ex. TrophyTile) ne portent pas toujours `secondary`/`text`/`gradient`.
    const partial = { primary: "#7c3aed", glow: "rgba(124,58,237,0.7)" };
    expect(() => rankSurfaceShadow(partial, { y: 1, blur: 2, spread: 3 })).not.toThrow();
  });
});

describe("rankTextGlow", () => {
  it("génère une simple lueur sans ombre secondaire", () => {
    expect(rankTextGlow("rgba(239,68,68,0.55)", 18)).toBe("0 0 18px rgba(239,68,68,0.55)");
  });

  it("ajoute l'ombre secondaire si fournie", () => {
    expect(rankTextGlow("rgba(239,68,68,0.55)", 18, "0 1px 0 rgba(0,0,0,0.4)")).toBe(
      "0 0 18px rgba(239,68,68,0.55), 0 1px 0 rgba(0,0,0,0.4)",
    );
  });
});

describe("MATERIAL_GRAIN", () => {
  it("est une seule texture partagée (data URI SVG), pas une par rang", () => {
    expect(MATERIAL_GRAIN).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(MATERIAL_GRAIN).toContain("feTurbulence");
  });

  it("ne référence aucune couleur (le grain est neutre, teinté par ce qu'il y a dessous)", () => {
    // saturate=0 : aucune teinte propre au bruit lui-même.
    expect(decodeURIComponent(MATERIAL_GRAIN)).toContain('type="saturate" values="0"');
  });
});

describe("RANK_AMBIANCE", () => {
  it("définit un profil pour chacun des 6 rangs", () => {
    for (const tier of RANK_TIERS) {
      expect(RANK_AMBIANCE[tier.key]).toBeDefined();
    }
  });

  it("donne à chaque rang un profil distinct (pas une valeur copiée-collée)", () => {
    const profiles = RANK_TIERS.map((t) => JSON.stringify(RANK_AMBIANCE[t.key]));
    expect(new Set(profiles).size).toBe(RANK_TIERS.length);
  });

  it("Primordial respire plus lentement (plus vaste) que Titan (plus nerveux)", () => {
    expect(RANK_AMBIANCE.primordial.haloDuration).toBeGreaterThan(RANK_AMBIANCE.titan.haloDuration);
    expect(RANK_AMBIANCE.primordial.shadowBlur).toBeGreaterThan(RANK_AMBIANCE.titan.shadowBlur);
  });

  it("Mortel est le plus sobre : grain le plus grossier, halo le plus discret", () => {
    const grains = RANK_TIERS.map((t) => RANK_AMBIANCE[t.key].grainScale);
    expect(RANK_AMBIANCE.mortel.grainScale).toBe(Math.max(...grains));
    const blurs = RANK_TIERS.map((t) => RANK_AMBIANCE[t.key].shadowBlur);
    expect(RANK_AMBIANCE.mortel.shadowBlur).toBe(Math.min(...blurs));
  });

  it("Primordial a le grain le plus fin (poussière d'étoiles) de tous les rangs", () => {
    const grains = RANK_TIERS.map((t) => RANK_AMBIANCE[t.key].grainScale);
    expect(RANK_AMBIANCE.primordial.grainScale).toBe(Math.min(...grains));
  });

  it("Titan a le passage de lumière le plus fréquent (braises nerveuses)", () => {
    const sweeps = RANK_TIERS.map((t) => RANK_AMBIANCE[t.key].sweepDuration);
    expect(RANK_AMBIANCE.titan.sweepDuration).toBe(Math.min(...sweeps));
  });
});

describe("rankRelief", () => {
  it("construit un bevel dont l'alpha suit le paramètre fourni", () => {
    const theme = rankThemeByKey("olympien");
    // alpha 0.14 -> 0x24 (36/255 ≈ 0.14)
    expect(rankRelief(theme, 0.14)).toBe(
      `inset 0 1px 0 ${theme.text}24, inset 0 -12px 24px -16px rgba(0,0,0,0.5)`,
    );
  });
});
