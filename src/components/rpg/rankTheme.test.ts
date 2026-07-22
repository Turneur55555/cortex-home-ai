import { describe, expect, it } from "vitest";
import { RANK_TIERS, type RankKey } from "@/lib/fitness/exerciseRanks";
import {
  rankGlowShadow,
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
