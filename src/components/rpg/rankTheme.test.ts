import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RANK_TIERS, type RankKey } from "@/lib/fitness/exerciseRanks";
import {
  MATERIAL_GRAIN,
  RANK_AMBIANCE,
  applyRankTheme,
  rankButtonGlowShadow,
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
    expect(rankThemeByKey("mortel")).not.toEqual(rankThemeByKey("titan"));
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

/**
 * Lecture d'une valeur `box-shadow` selon la grammaire CSS (`inset? && <length>{2,4} && <color>?`,
 * calques séparés par des virgules hors parenthèses). Renvoie `null` si un calque est invalide —
 * exactement le cas où le navigateur ignore la propriété ENTIÈRE.
 */
interface ShadowLayer {
  inset: boolean;
  lengths: number[];
  color: string | null;
}

function splitTopLevel(value: string, separator: "," | " "): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    const isSeparator = separator === " " ? /\s/.test(char) : char === separator;
    if (isSeparator && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))(px)?$/;

function parseBoxShadow(value: string): ShadowLayer[] | null {
  const layers: ShadowLayer[] = [];
  for (const raw of splitTopLevel(value, ",")) {
    const layer: ShadowLayer = { inset: false, lengths: [], color: null };
    for (const token of splitTopLevel(raw, " ")) {
      const length = LENGTH.exec(token);
      if (token === "inset" && !layer.inset) {
        layer.inset = true;
      } else if (length) {
        // Une longueur non nulle exige son unité ; les longueurs forment un bloc contigu.
        const n = Number(length[1]);
        if (n !== 0 && !length[2]) return null;
        if (layer.color !== null && layer.lengths.length === 0) return null;
        layer.lengths.push(n);
      } else if (layer.color === null) {
        layer.color = token;
      } else {
        return null;
      }
    }
    if (layer.lengths.length < 2 || layer.lengths.length > 4) return null;
    // Le flou (3e longueur) ne peut jamais être négatif.
    if (layer.lengths.length >= 3 && layer.lengths[2] < 0) return null;
    layers.push(layer);
  }
  return layers.length > 0 ? layers : null;
}

describe("parseBoxShadow (outil du test)", () => {
  it("rejette l'ancienne sortie à trois longueurs avec un étalement négatif (flou négatif)", () => {
    expect(parseBoxShadow("0px 24px -12px rgba(0,0,0,0.5)")).toBeNull();
  });

  it("rejette toute la déclaration quand un seul calque est invalide", () => {
    expect(parseBoxShadow("inset 0 0 0 1px #fff, 0px 22px -10px red")).toBeNull();
  });

  it("accepte une ombre à quatre longueurs avec un étalement négatif", () => {
    expect(parseBoxShadow("0 -10px 60px -28px rgba(239,68,68,0.55)")).toEqual([
      { inset: false, lengths: [0, -10, 60, -28], color: "rgba(239,68,68,0.55)" },
    ]);
  });
});

describe("rankGlowShadow", () => {
  it("produit quatre longueurs : décalage x nul, puis y, flou, étalement", () => {
    expect(rankGlowShadow("rgba(239,68,68,0.55)", 10, 28, -14)).toBe(
      "0 10px 28px -14px rgba(239,68,68,0.55)",
    );
  });

  it("garde une ombre VALIDE quand l'étalement est négatif (régression du 02/11/2026)", () => {
    const layers = parseBoxShadow(rankGlowShadow("rgba(239,68,68,0.55)", -20, 80, -24));
    expect(layers).not.toBeNull();
    expect(layers![0].lengths).toEqual([0, -20, 80, -24]);
    expect(layers![0].color).toBe("rgba(239,68,68,0.55)");
  });

  it("reste valide une fois concaténée à un liseré (le liseré ne disparaît plus avec elle)", () => {
    const value = `${rankRingInset("#b91c1c", "55")}, ${rankGlowShadow("red", 0, 22, -10)}`;
    expect(parseBoxShadow(value)).toHaveLength(2);
  });

  it("supporte un étalement positif ou nul", () => {
    expect(rankGlowShadow("red", 0, 16, 0)).toBe("0 0px 16px 0px red");
    expect(parseBoxShadow(rankGlowShadow("red", 0, 16, 6))).not.toBeNull();
  });

  it("borne un flou négatif à 0 au lieu de produire une déclaration invalide", () => {
    const value = rankGlowShadow("red", 0, -8, -4);
    expect(value).toBe("0 0px 0px -4px red");
    expect(parseBoxShadow(value)).not.toBeNull();
  });
});

describe("applyRankTheme — ombres injectées dans les variables CSS", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(RANK_TIERS.map((tier) => tier.key))(
    "%s : --shadow-glow, --shadow-card et --shadow-elevated sont des box-shadow valides",
    (key) => {
      const props = new Map<string, string>();
      vi.stubGlobal("document", {
        documentElement: {
          style: { setProperty: (name: string, v: string) => props.set(name, v) },
        },
      });

      applyRankTheme(key);

      for (const name of ["--shadow-glow", "--shadow-card", "--shadow-elevated"]) {
        expect(props.get(name), name).toBeDefined();
        expect(parseBoxShadow(props.get(name)!), `${name} = ${props.get(name)}`).not.toBeNull();
      }
      // Le halo partagé (`.shadow-glow`) suit la forme de la valeur par défaut de styles.css :
      // `0 0 <flou> <étalement> <couleur>`.
      expect(props.get("--shadow-glow")).toBe(rankButtonGlowShadow(key));
      expect(parseBoxShadow(props.get("--shadow-glow")!)![0].lengths.slice(0, 2)).toEqual([0, 0]);
    },
  );
});

describe("rankButtonGlowShadow — lueur des boutons principaux", () => {
  it("garde le halo d'ambiance des rangs jusqu'à l'Olympien", () => {
    for (const key of ["mortel", "guerrier", "heros", "colosse", "olympien"] as const) {
      const { shadowBlur, shadowSpread } = RANK_AMBIANCE[key];
      expect(rankButtonGlowShadow(key)).toBe(
        rankGlowShadow(rankThemeByKey(key).glow, 0, shadowBlur, shadowSpread),
      );
    }
  });

  it("borne Titan au halo le plus large des autres rangs (pas de voile blanc sous les boutons)", () => {
    const [titan] = parseBoxShadow(rankButtonGlowShadow("titan"))!;
    const others = (["mortel", "guerrier", "heros", "colosse", "olympien"] as const).map(
      (key) => parseBoxShadow(rankButtonGlowShadow(key))![0].lengths,
    );
    expect(titan.lengths[2]).toBe(Math.max(...others.map((l) => l[2])));
    expect(titan.lengths[3]).toBe(Math.max(...others.map((l) => l[3])));
    expect(titan.lengths[2]).toBeLessThan(RANK_AMBIANCE.titan.shadowBlur);
    expect(titan.color).toBe(rankThemeByKey("titan").glow);
  });
});

describe("rankGlowShadow — appels dans src/", () => {
  // Avant le 02/11/2026, la sortie à trois longueurs décalait la lecture d'un cran :
  // `rankGlowShadow(glow, 0, 0, 12)` se lisait « flou 12 » et `rankGlowShadow(glow, 0, 14, 32)`
  // « y 14, flou 32 ». Relus avec la signature réelle, ces appels deviennent un anneau plein ou un
  // étalement de 32 px. Signature commune : un étalement positif, que les halos de rang n'utilisent
  // jamais. Un halo doux s'écrit `rankGlowShadow(glow, 0, 12, 0)`, une ombre portée
  // `rankGlowShadow(glow, 14, 32, 0)`.
  const SRC = resolve(process.cwd(), "src");

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  it("aucun appel ne passe un étalement positif (ancienne lecture à trois longueurs)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/rankGlowShadow\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
        const args = splitTopLevel(match[1], ",");
        if (args.length !== 4) continue;
        const blur = args[2].trim();
        const spread = args[3].trim();
        const positiveLiteral = /^\d*\.?\d+$/.test(spread) && Number(spread) > 0;
        const spreadWithoutBlur = blur === "0" && spread !== "0" && !spread.startsWith("-");
        if (positiveLiteral || spreadWithoutBlur) {
          offenders.push(`${relative(SRC, file)} : ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("rankSurfaceShadow", () => {
  it("combine liseré (alpha par défaut) et halo", () => {
    const theme = { primary: "#2563eb", glow: "rgba(234,179,8,0.6)" };
    expect(rankSurfaceShadow(theme, { y: 10, blur: 40, spread: -20 })).toBe(
      "inset 0 0 0 1px #2563eb30, 0 10px 40px -20px rgba(234,179,8,0.6)",
    );
  });

  it("respecte un ringAlpha personnalisé", () => {
    const theme = { primary: "#2563eb", glow: "rgba(234,179,8,0.6)" };
    expect(rankSurfaceShadow(theme, { ringAlpha: "55", y: 6, blur: 22, spread: -12 })).toBe(
      "inset 0 0 0 1px #2563eb55, 0 6px 22px -12px rgba(234,179,8,0.6)",
    );
  });

  it("reste une déclaration valide (liseré + halo) avec un étalement négatif", () => {
    const theme = { primary: "#2563eb", glow: "rgba(234,179,8,0.6)" };
    expect(parseBoxShadow(rankSurfaceShadow(theme, { y: 30, blur: 80, spread: -30 }))).toHaveLength(
      2,
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

  it("Titan respire plus lentement (plus vaste) que Colosse (plus nerveux)", () => {
    expect(RANK_AMBIANCE.titan.haloDuration).toBeGreaterThan(RANK_AMBIANCE.colosse.haloDuration);
    expect(RANK_AMBIANCE.titan.shadowBlur).toBeGreaterThan(RANK_AMBIANCE.colosse.shadowBlur);
  });

  it("Mortel est le plus sobre : grain le plus grossier, halo le plus discret", () => {
    const grains = RANK_TIERS.map((t) => RANK_AMBIANCE[t.key].grainScale);
    expect(RANK_AMBIANCE.mortel.grainScale).toBe(Math.max(...grains));
    const blurs = RANK_TIERS.map((t) => RANK_AMBIANCE[t.key].shadowBlur);
    expect(RANK_AMBIANCE.mortel.shadowBlur).toBe(Math.min(...blurs));
  });

  it("Titan a le grain le plus fin (poussière d'étoiles) de tous les rangs", () => {
    const grains = RANK_TIERS.map((t) => RANK_AMBIANCE[t.key].grainScale);
    expect(RANK_AMBIANCE.titan.grainScale).toBe(Math.min(...grains));
  });

  it("Colosse a le passage de lumière le plus fréquent (braises nerveuses)", () => {
    const sweeps = RANK_TIERS.map((t) => RANK_AMBIANCE[t.key].sweepDuration);
    expect(RANK_AMBIANCE.colosse.sweepDuration).toBe(Math.min(...sweeps));
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
