// Campagne de validation E2E de POST /recipe-variants ("Proposer des
// variantes"). Même approche que recipe-import.e2e.test.ts : exerce le VRAI
// code de production (`handleRecipeVariants`) contre un `fetch` et un client
// Supabase simulés (endpoint stateless — seul `rate_limits` est touché).
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRecipeVariants, type RecipeVariantsDeps } from "../_shared/recipe-variants-handler.ts";
import type { RecipeVariantSourceSnapshot } from "../_shared/recipe-variants.ts";

// ─── Fake Supabase client (rate_limits uniquement — endpoint stateless) ──────

type Row = Record<string, unknown>;

function makeFakeSupabase() {
  const tables: Record<string, Row[]> = { rate_limits: [] };

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    const gteFilters: Array<[string, number | string]> = [];
    let countMode = false;
    let insertRows: Row[] | null = null;

    const matches = (r: Row) =>
      filters.every(([c, v]) => r[c] === v) && gteFilters.every(([c, v]) => String(r[c] ?? "") >= String(v));

    // deno-lint-ignore no-explicit-any
    const builder: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) countMode = true;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      gte(col: string, val: unknown) {
        gteFilters.push([col, val as number | string]);
        return builder;
      },
      insert(row: Row) {
        insertRows = [row];
        return builder;
      },
      then(resolve: (v: unknown) => void) {
        if (insertRows) {
          for (const row of insertRows) tables[table].push({ id: `${table}-${tables[table].length + 1}`, ...row });
          return resolve({ error: null });
        }
        const rows = tables[table].filter(matches);
        if (countMode) return resolve({ count: rows.length, error: null });
        return resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  // deno-lint-ignore no-explicit-any
  return { from, tables } as any;
}

// ─── Fake réseau Gemini ───────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function variantPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Poulet crémeux (thon)",
    explanation: "Le poulet est remplacé par du thon en boîte, la sauce est allégée en conséquence.",
    servings: 4,
    instructions: "Émiette le thon, fais réduire la crème, mélange le tout avec les épinards puis sers.",
    ingredients: [
      { name: "Thon en boîte", quantity: 400, unit: "g", grams: 400, category: "Poissons" },
      { name: "Crème entière", quantity: 20, unit: "cl", grams: 200, category: "Produits laitiers" },
      { name: "Épinards", quantity: 100, unit: "g", grams: 100, category: "Fruits et légumes" },
    ],
    per_serving: { calories: 410, proteins: 38, carbs: 6, fats: 24, fiber: 2 },
    ...overrides,
  };
}

function toolCallResponse(variants: unknown[]) {
  return {
    choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ variants }) } }] } }],
  };
}

function threeDistinctVariants() {
  return [
    variantPayload({ name: "Poulet crémeux (thon)" }),
    variantPayload({ name: "Poulet crémeux (thon) — accompagnement riz complet", explanation: "Version avec un accompagnement de riz complet pour plus de fibres." }),
    variantPayload({ name: "Poulet crémeux (thon) — version optimisée", explanation: "Sauce allégée, plus de protéines par portion.", per_serving: { calories: 380, proteins: 44, carbs: 5, fats: 18, fiber: 2 } }),
  ];
}

function installFetchMock(gemini?: () => Response | Promise<Response>) {
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("generativelanguage.googleapis.com")) {
      return gemini ? gemini() : jsonResponse(toolCallResponse(threeDistinctVariants()));
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const SOURCE_RECIPE: RecipeVariantSourceSnapshot = {
  name: "Poulet crémeux au parmesan",
  servings: 4,
  perServing: { calories: 512, proteins: 46.5, carbs: 9.2, fats: 32.1, fiber: 2.3 },
  ingredients: [
    { name: "Filets de poulet", quantity: 600, unit: "g", grams: 600, category: "Viandes" },
    { name: "Crème entière", quantity: 20, unit: "cl", grams: 200, category: "Produits laitiers" },
    { name: "Parmesan râpé", quantity: 60, unit: "g", grams: 60, category: "Produits laitiers" },
    { name: "Épinards", quantity: 100, unit: "g", grams: 100, category: "Fruits et légumes" },
  ],
  instructions: "Saisir le poulet, déglacer, ajouter crème et parmesan, incorporer les épinards.",
};

function deps(supa: ReturnType<typeof makeFakeSupabase>, userId = "user-1"): RecipeVariantsDeps {
  return { userSupa: supa, userId, geminiApiKey: "test-gemini-key" };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("recipe-variants — génération IA (réseau + rate-limit simulés)", () => {
  it("sans produits laitiers → végétal : 3 variantes, ingrédients laitiers remplacés", async () => {
    const fetchMock = installFetchMock(() =>
      jsonResponse(
        toolCallResponse([
          variantPayload({
            name: "Poulet crémeux (lait de coco)",
            ingredients: [
              { name: "Filets de poulet", quantity: 600, unit: "g", grams: 600, category: "Viandes" },
              { name: "Crème de coco", quantity: 20, unit: "cl", grams: 200, category: "Épicerie" },
              { name: "Levure maltée", quantity: 15, unit: "g", grams: 15, category: "Épicerie" },
            ],
          }),
          variantPayload({ name: "Poulet crémeux (lait d'amande)" }),
          variantPayload({ name: "Poulet crémeux (lait de soja)" }),
        ]),
      ),
    );
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants(
      { requestType: "dairy_free_vegan", recipe: SOURCE_RECIPE },
      deps(supa),
    );

    expect(result.error).toBeUndefined();
    const variants = result.variants as Record<string, unknown>[];
    expect(variants).toHaveLength(3);
    const firstIngredients = variants[0].ingredients as Array<Record<string, unknown>>;
    expect(firstIngredients.some((i) => String(i.name).match(/coco|amande|soja|végétal/i))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sans produits laitiers → suppression : 3 variantes, produits laitiers retirés (pas de substitut végétal)", async () => {
    installFetchMock(() =>
      jsonResponse(
        toolCallResponse(
          threeDistinctVariants().map((v) => ({
            ...(v as Record<string, unknown>),
            ingredients: [
              { name: "Filets de poulet", quantity: 600, unit: "g", grams: 600, category: "Viandes" },
              { name: "Épinards", quantity: 100, unit: "g", grams: 100, category: "Fruits et légumes" },
              { name: "Bouillon de volaille", quantity: 15, unit: "cl", grams: 150, category: "Épicerie" },
            ],
          })),
        ),
      ),
    );
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants(
      { requestType: "dairy_free_remove", recipe: SOURCE_RECIPE },
      deps(supa),
    );
    expect(result.error).toBeUndefined();
    const variants = result.variants as Array<{ ingredients: Array<{ category: string | null }> }>;
    expect(variants).toHaveLength(3);
    for (const v of variants) {
      expect(v.ingredients.some((i) => i.category === "Produits laitiers")).toBe(false);
    }
  });

  it("plus protéiné : 3 variantes générées", async () => {
    installFetchMock();
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants({ requestType: "more_protein", recipe: SOURCE_RECIPE }, deps(supa));
    expect(result.error).toBeUndefined();
    expect((result.variants as unknown[]).length).toBe(3);
  });

  it("demande personnalisée — remplacement poulet → thon : 3 variantes", async () => {
    installFetchMock();
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants(
      { requestType: "custom", customPrompt: "Remplace le poulet par du thon", recipe: SOURCE_RECIPE },
      deps(supa),
    );
    expect(result.error).toBeUndefined();
    const variants = result.variants as Array<{ name: string }>;
    expect(variants).toHaveLength(3);
    expect(variants.some((v) => /thon/i.test(v.name))).toBe(true);
  });

  it("demande personnalisée — remplacement poulet → saumon : 3 variantes", async () => {
    installFetchMock(() =>
      jsonResponse(
        toolCallResponse([
          variantPayload({ name: "Poulet crémeux (saumon)", ingredients: [{ name: "Saumon", quantity: 500, unit: "g", grams: 500, category: "Poissons" }] }),
          variantPayload({ name: "Saumon crémeux — accompagnement riz", explanation: "Version avec accompagnement." }),
          variantPayload({ name: "Saumon crémeux — version optimisée", explanation: "Plus de protéines." }),
        ]),
      ),
    );
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants(
      { requestType: "custom", customPrompt: "Remplace le poulet par du saumon", recipe: SOURCE_RECIPE },
      deps(supa),
    );
    expect(result.error).toBeUndefined();
    const variants = result.variants as Array<{ name: string }>;
    expect(variants.some((v) => /saumon/i.test(v.name))).toBe(true);
  });

  it("exactement 3 variantes exigées : 2 variantes reçues → erreur, aucun crash", async () => {
    installFetchMock(() => jsonResponse(toolCallResponse(threeDistinctVariants().slice(0, 2))));
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants({ requestType: "more_protein", recipe: SOURCE_RECIPE }, deps(supa));
    expect(result.error).toBeTruthy();
    expect(result.code).toBe("ai_error");
    expect(result.variants).toBeUndefined();
  });

  it("macros présentes et cohérentes pour chaque variante", async () => {
    installFetchMock();
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants({ requestType: "more_protein", recipe: SOURCE_RECIPE }, deps(supa));
    const variants = result.variants as Array<{ perServing: Record<string, number> }>;
    for (const v of variants) {
      expect(v.perServing.calories).toBeGreaterThan(0);
      expect(v.perServing.proteins).toBeGreaterThanOrEqual(0);
      expect(v.perServing.carbs).toBeGreaterThanOrEqual(0);
      expect(v.perServing.fats).toBeGreaterThanOrEqual(0);
      expect(v.perServing.fiber).toBeGreaterThanOrEqual(0);
    }
  });

  it("un seul appel Gemini par demande, quel que soit le type de demande", async () => {
    const fetchMock = installFetchMock();
    const supa = makeFakeSupabase();
    await handleRecipeVariants({ requestType: "dairy_free_vegan", recipe: SOURCE_RECIPE }, deps(supa));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("réponse IA invalide (tool_call vide) : gérée proprement, message clair, pas de crash", async () => {
    installFetchMock(() => jsonResponse({ choices: [{ message: {} }] }));
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants({ requestType: "more_protein", recipe: SOURCE_RECIPE }, deps(supa));
    expect(result.code).toBe("ai_error");
    expect(result.variants).toBeUndefined();
  });

  it("réponse IA invalide (macros manquantes sur une variante) : rejetée entièrement", async () => {
    installFetchMock(() =>
      jsonResponse(
        toolCallResponse([
          variantPayload({ per_serving: { calories: 0, proteins: 0, carbs: 0, fats: 0, fiber: 0 } }),
          variantPayload({ name: "Variante 2" }),
          variantPayload({ name: "Variante 3" }),
        ]),
      ),
    );
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants({ requestType: "more_protein", recipe: SOURCE_RECIPE }, deps(supa));
    expect(result.code).toBe("ai_error");
    expect(result.variants).toBeUndefined();
  });

  it("réponse IA invalide (3 variantes strictement identiques) : rejetée", async () => {
    const same = variantPayload();
    installFetchMock(() => jsonResponse(toolCallResponse([same, same, same])));
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants({ requestType: "more_protein", recipe: SOURCE_RECIPE }, deps(supa));
    expect(result.code).toBe("ai_error");
  });

  it("demande personnalisée sans texte : rejetée avant tout appel Gemini", async () => {
    const fetchMock = installFetchMock();
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants({ requestType: "custom", customPrompt: "  ", recipe: SOURCE_RECIPE }, deps(supa));
    expect(result.code).toBe("invalid_input");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recette source invalide (aucun ingrédient) : rejetée avant tout appel Gemini", async () => {
    const fetchMock = installFetchMock();
    const supa = makeFakeSupabase();
    const result = await handleRecipeVariants(
      { requestType: "more_protein", recipe: { ...SOURCE_RECIPE, ingredients: [] } },
      deps(supa),
    );
    expect(result.code).toBe("invalid_input");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limite de débit atteinte : aucun appel Gemini, message clair", async () => {
    const fetchMock = installFetchMock();
    const supa = makeFakeSupabase();
    for (let i = 0; i < 15; i += 1) {
      supa.tables.rate_limits.push({ user_id: "user-1", action: "recipe_variants", window_start: new Date().toISOString() });
    }
    const result = await handleRecipeVariants({ requestType: "more_protein", recipe: SOURCE_RECIPE }, deps(supa, "user-1"));
    expect(result.error).toMatch(/Limite atteinte/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
