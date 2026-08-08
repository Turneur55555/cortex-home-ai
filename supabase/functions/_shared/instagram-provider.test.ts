import { describe, expect, it } from "vitest";
import { cleanInstagramCaption } from "./instagram-provider.ts";

describe("cleanInstagramCaption", () => {
  it("décode les entités HTML numériques (emojis) et nommées", () => {
    const raw = "NORI SUSHI &#x1f363;&#xa0;avec crevettes &#x1f990; et avocat &#x1f951;";
    expect(cleanInstagramCaption(raw)).toBe("NORI SUSHI 🍣 avec crevettes 🦐 et avocat 🥑");
  });

  it("retire le préfixe de métadonnées Instagram (likes/comments/date) sans toucher au reste", () => {
    const raw =
      "1,066 likes, 46 comments - bouffegains - July 28, 2026: NORI SUSHI &#x1f363;\n\nOn revisite la recette.";
    expect(cleanInstagramCaption(raw)).toBe("NORI SUSHI 🍣\n\nOn revisite la recette.");
  });

  it("retire aussi le format 'Likes, Comments - user (@handle) on Instagram:'", () => {
    const raw = '523 Likes, 12 Comments - Jane (@jane.cooks) on Instagram: Poulet crémeux au parmesan';
    expect(cleanInstagramCaption(raw)).toBe("Poulet crémeux au parmesan");
  });

  it("normalise les espaces insécables et les lignes vides multiples", () => {
    const raw = "NORI&#xa0;SUSHI\n\n\n\nINGRÉDIENTS\n\n\n- crevettes  ";
    expect(cleanInstagramCaption(raw)).toBe("NORI SUSHI\n\nINGRÉDIENTS\n\n- crevettes");
  });

  it("conserve les emojis, hashtags, quantités et retours à la ligne du cas réel", () => {
    const raw =
      "1,066 likes, 46 comments - bou&#8230; - July 28, 2026: NORI SUSHI &#x1f363;\n\n" +
      "On revisite la recette pour en faire une version hyperprot&#xe9;in&#xe9;e...\n\n" +
      "INGR&#xc9;DIENTS\n\n" +
      "- &#x1f990; 150g de crevettes\n" +
      "- &#x1f95a; 3 &#x153;ufs\n" +
      "- &#x1f9c5; Oignon rouge\n\n" +
      "Macros pour 1 roll :\n" +
      "495 kcal / 47g de prot / 28g de glucides / 23g de lipides\n\n" +
      "&#x23f1;&#xfe0f; Temps de pr&#xe9;paration : 15min\n\n" +
      "#nutrition #recettefacile #recetterapide";

    const cleaned = cleanInstagramCaption(raw);

    expect(cleaned).not.toBeNull();
    expect(cleaned).not.toMatch(/&#/);
    expect(cleaned).not.toMatch(/likes?,.*comments?/i);
    expect(cleaned).not.toContain("1,066");
    expect(cleaned).not.toContain("46 comments");
    expect(cleaned).not.toContain("July 28, 2026");
    expect(cleaned).toContain("NORI SUSHI 🍣");
    expect(cleaned).toContain("🦐 150g de crevettes");
    expect(cleaned).toContain("🥚 3 œufs");
    expect(cleaned).toContain("🧅 Oignon rouge");
    expect(cleaned).toContain("495 kcal / 47g de prot / 28g de glucides / 23g de lipides");
    expect(cleaned).toContain("⏱️ Temps de préparation : 15min");
    expect(cleaned).toContain("#nutrition #recettefacile #recetterapide");
  });

  it("laisse le texte intact si le format de métadonnées n'est pas reconnu", () => {
    const raw = "Une légende toute simple sans métadonnées Instagram.";
    expect(cleanInstagramCaption(raw)).toBe(raw);
  });

  it("retourne null pour une entrée vide", () => {
    expect(cleanInstagramCaption(null)).toBeNull();
    expect(cleanInstagramCaption("")).toBeNull();
    expect(cleanInstagramCaption("   ")).toBeNull();
  });
});
