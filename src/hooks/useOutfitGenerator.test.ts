import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `saveOutfitRecord` / `saveOutfitFeedbackRecord` — persistance de l'Outfit
 * Engine (Dressing Part B), extraites en fonctions pures testables, comme
 * `createWardrobeItemRecord` (cf. src/hooks/createWardrobeItemRecord.test.ts).
 */

const outfitsInsertMock = vi.fn();
const outfitsDeleteMock = vi.fn();
const outfitItemsInsertMock = vi.fn();
const feedbackUpsertMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "outfits") {
        return {
          insert: (...args: unknown[]) => outfitsInsertMock(...args),
          delete: () => ({
            eq: (...args: unknown[]) => outfitsDeleteMock(...args),
          }),
        };
      }
      if (table === "outfit_items") {
        return { insert: (...args: unknown[]) => outfitItemsInsertMock(...args) };
      }
      if (table === "outfit_feedback") {
        return { upsert: (...args: unknown[]) => feedbackUpsertMock(...args) };
      }
      throw new Error(`Table non mockée: ${table}`);
    },
  },
}));

// Import après le mock (obligatoire avec vi.mock hoisté).
import {
  saveOutfitFeedbackRecord,
  saveOutfitRecord,
  mapWardrobeItemToScoringItem,
} from "./useOutfitGenerator";
import type { GeneratedOutfit, OutfitScoringItem } from "@/lib/wardrobe/outfitEngine";
import type { WardrobeItemView } from "./useWardrobe";

function makeOutfit(items: OutfitScoringItem[]): GeneratedOutfit {
  return {
    items,
    score: 87,
    breakdown: { category: 1, usage: 0.9, formality: 0.8, color: 0.85, pattern: 1, season: 1 },
    explanation: "Palette cohérente et pièces adaptées au contexte quotidien.",
  };
}

const TOP: OutfitScoringItem = {
  id: "top-1",
  category: "top",
  subcategory: "tshirt",
  primary_color: "noir",
  secondary_colors: [],
  pattern: "uni",
  material: null,
  fit: null,
  formality: "casual",
  seasons: [],
  usage: ["quotidien"],
};
const BOTTOM: OutfitScoringItem = {
  ...TOP,
  id: "bottom-1",
  category: "bottom",
  subcategory: "jean",
};

beforeEach(() => {
  outfitsInsertMock.mockReset().mockResolvedValue({ error: null });
  outfitsDeleteMock.mockReset().mockResolvedValue({ error: null });
  outfitItemsInsertMock.mockReset().mockResolvedValue({ error: null });
  feedbackUpsertMock.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveOutfitRecord", () => {
  it("insère une ligne outfits puis une ligne outfit_items par pièce réelle", async () => {
    const outfit = makeOutfit([TOP, BOTTOM]);
    const outfitId = await saveOutfitRecord("user-1", { outfit, context: "quotidien" });

    expect(outfitId).toEqual(expect.any(String));
    expect(outfitsInsertMock).toHaveBeenCalledTimes(1);
    const outfitPayload = outfitsInsertMock.mock.calls[0][0];
    expect(outfitPayload).toMatchObject({
      id: outfitId,
      user_id: "user-1",
      occasion: "quotidien",
      score: 87,
      ai_explanation: outfit.explanation,
      worn_at: null,
    });

    expect(outfitItemsInsertMock).toHaveBeenCalledTimes(1);
    const rows = outfitItemsInsertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.wardrobe_item_id)).toEqual([TOP.id, BOTTOM.id]);
    for (const row of rows) {
      expect(row.outfit_id).toBe(outfitId);
      expect(row.user_id).toBe("user-1");
    }
  });

  it('marque worn_at quand wornNow est demandé ("Utiliser cette tenue")', async () => {
    const outfit = makeOutfit([TOP, BOTTOM]);
    await saveOutfitRecord("user-1", { outfit, context: "quotidien", wornNow: true });
    const outfitPayload = outfitsInsertMock.mock.calls[0][0];
    expect(outfitPayload.worn_at).toEqual(expect.any(String));
  });

  it("nettoie l'outfit si l'insert des outfit_items échoue", async () => {
    outfitItemsInsertMock.mockResolvedValueOnce({ error: new Error("contrainte violée") });
    const outfit = makeOutfit([TOP, BOTTOM]);

    await expect(saveOutfitRecord("user-1", { outfit, context: "quotidien" })).rejects.toThrow(
      "contrainte violée",
    );
    expect(outfitsDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("ne persiste jamais un ID de pièce autre que ceux du GeneratedOutfit (aucune pièce inventée)", async () => {
    const outfit = makeOutfit([TOP, BOTTOM]);
    await saveOutfitRecord("user-1", { outfit, context: "quotidien" });
    const rows = outfitItemsInsertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    const persistedIds = rows.map((r) => r.wardrobe_item_id).sort();
    expect(persistedIds).toEqual([BOTTOM.id, TOP.id].sort());
  });
});

describe("saveOutfitFeedbackRecord", () => {
  it("upsert liked=true sur (user_id, outfit_id)", async () => {
    await saveOutfitFeedbackRecord("user-1", { outfitId: "outfit-1", liked: true });
    expect(feedbackUpsertMock).toHaveBeenCalledWith(
      { user_id: "user-1", outfit_id: "outfit-1", liked: true },
      { onConflict: "user_id,outfit_id" },
    );
  });

  it("propage l'erreur si l'upsert échoue", async () => {
    feedbackUpsertMock.mockResolvedValueOnce({ error: new Error("RLS refusé") });
    await expect(
      saveOutfitFeedbackRecord("user-1", { outfitId: "outfit-1", liked: false }),
    ).rejects.toThrow("RLS refusé");
  });
});

describe("mapWardrobeItemToScoringItem", () => {
  function makeWardrobeItemView(overrides: Partial<WardrobeItemView> = {}): WardrobeItemView {
    return {
      id: "item-1",
      user_id: "user-1",
      name: "T-shirt noir",
      brand: null,
      category: "top",
      subcategory: "tshirt",
      primary_color: "noir",
      storage_path: "user-1/item-1/original.jpg",
      processed_storage_path: null,
      created_at: new Date().toISOString(),
      size: "M",
      secondary_colors: [],
      pattern: "uni",
      material: null,
      fit: null,
      formality: "casual",
      seasons: [],
      sleeve_length: null,
      usage: ["quotidien"],
      uiCategory: "tops",
      imageUrl: null,
      originalImageUrl: null,
      ...overrides,
    };
  }

  it("convertit une pièce du dressing en item de scoring déterministe", () => {
    const scoring = mapWardrobeItemToScoringItem(makeWardrobeItemView());
    expect(scoring).toEqual({
      id: "item-1",
      category: "top",
      subcategory: "tshirt",
      primary_color: "noir",
      secondary_colors: [],
      pattern: "uni",
      material: null,
      fit: null,
      formality: "casual",
      seasons: [],
      usage: ["quotidien"],
    });
  });

  it("retourne null pour une catégorie DB inconnue/corrompue (jamais de pièce mal catégorisée dans le moteur)", () => {
    const scoring = mapWardrobeItemToScoringItem(
      makeWardrobeItemView({ category: "n-importe-quoi" }),
    );
    expect(scoring).toBeNull();
  });

  it("les corrections utilisateur (Part A) sont la seule valeur lue — pas de distinction avec la valeur Vision d'origine", () => {
    // wardrobe_items ne garde qu'une valeur par champ : celle-ci reflète
    // déjà toute édition utilisateur ultérieure à l'analyse Vision.
    const edited = makeWardrobeItemView({ primary_color: "bleu marine", formality: "formal" });
    const scoring = mapWardrobeItemToScoringItem(edited);
    expect(scoring?.primary_color).toBe("bleu marine");
    expect(scoring?.formality).toBe("formal");
  });
});
