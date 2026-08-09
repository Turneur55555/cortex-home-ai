// Campagne de validation E2E de POST /recipe-import (source Instagram).
//
// Ce sandbox n'a ni session Deno déployée, ni accès à Instagram/Gemini
// réels (pas de GEMINI_API_KEY ici) : ces tests exercent donc le VRAI code
// de production (`handleRecipeImport`, le même que celui appelé par
// `index.ts` — extraction volontaire pour permettre exactement ceci) contre
// un `fetch` et un client Supabase simulés, plutôt qu'une infrastructure
// réelle. C'est une simulation contrôlée bout en bout du pipeline complet
// (validation -> provider -> parser -> engine -> cache global -> DB
// par-utilisateur), pas un test contre la vraie API Instagram/Gemini.
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRecipeImport, handleRecipeReanalyze } from "../_shared/recipe-import-handler.ts";

// ─── Fake Supabase client (postgrest-like, chainable + thenable) ─────────────

type Row = Record<string, unknown>;

function makeFakeSupabase(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    recipes: [],
    recipe_ingredients: [],
    recipe_import_cache: [],
    rate_limits: [],
    ...seed,
  };
  let idCounter = 1;

  function uniqueViolation(table: string, row: Row): boolean {
    if (table === "recipes") {
      return tables.recipes.some((r) => r.user_id === row.user_id && r.source_url === row.source_url);
    }
    if (table === "recipe_import_cache") {
      return tables.recipe_import_cache.some(
        (r) => r.source_kind === row.source_kind && r.source_url === row.source_url,
      );
    }
    return false;
  }

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    const gteFilters: Array<[string, number]> = [];
    let countMode = false;
    let insertRows: Row[] | null = null;
    let upsertRows: Row[] | null = null;
    let upsertConflictCols: string[] = [];
    let updatePatch: Row | null = null;
    let deleteMode = false;

    const matches = (r: Row) =>
      filters.every(([c, v]) => r[c] === v) && gteFilters.every(([c, v]) => Number(r[c] ?? 0) >= v);

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
      gte(col?: string, val?: unknown) {
        // Utilisé par le versionnement du cache de langue (language_rule_version).
        if (typeof col === "string" && typeof val === "number") gteFilters.push([col, val]);
        return builder;
      },
      order() {
        return builder;
      },
      insert(rows: Row | Row[]) {
        insertRows = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
        upsertRows = Array.isArray(rows) ? rows : [rows];
        upsertConflictCols = (opts?.onConflict ?? "").split(",").filter(Boolean);
        return builder;
      },
      update(patch: Row) {
        updatePatch = patch;
        return builder;
      },
      delete() {
        deleteMode = true;
        return builder;
      },
      maybeSingle: async () => {
        const rows = tables[table].filter(matches);
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        if (insertRows) {
          for (const row of insertRows) {
            if (uniqueViolation(table, row)) return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          const inserted = insertRows.map((row) => ({ id: `${table}-${idCounter++}`, ...row }));
          tables[table].push(...inserted);
          return { data: inserted[0], error: null };
        }
        const rows = tables[table].filter(matches);
        return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "not found" } };
      },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        try {
          if (insertRows) {
            for (const row of insertRows) {
              if (uniqueViolation(table, row)) return resolve({ error: { code: "23505", message: "duplicate key" } });
            }
            for (const row of insertRows) tables[table].push({ id: `${table}-${idCounter++}`, ...row });
            return resolve({ error: null });
          }
          if (upsertRows) {
            for (const row of upsertRows) {
              const existing =
                upsertConflictCols.length > 0
                  ? tables[table].find((r) => upsertConflictCols.every((c) => r[c] === row[c]))
                  : undefined;
              if (existing) Object.assign(existing, row);
              else tables[table].push({ id: `${table}-${idCounter++}`, ...row });
            }
            return resolve({ error: null });
          }
          if (updatePatch) {
            for (const row of tables[table]) {
              if (matches(row)) Object.assign(row, updatePatch);
            }
            return resolve({ error: null });
          }
          if (deleteMode) {
            tables[table] = tables[table].filter((r) => !matches(r));
            return resolve({ error: null });
          }
          const rows = tables[table].filter(matches);
          if (countMode) return resolve({ count: rows.length, error: null });
          return resolve({ data: rows, error: null });
        } catch (e) {
          if (reject) reject(e);
          else resolve({ error: e });
        }
      },
    };
    return builder;
  }

  // deno-lint-ignore no-explicit-any
  return { from, tables } as any;
}

// ─── Fake réseau (page Instagram + miniature + Gemini) ────────────────────────

const REEL_URL = "https://www.instagram.com/reel/cortex-demo-1/";

const PUBLIC_HTML = `<html><head>
  <meta property="og:title" content="Jane Doe (@jane.cooks) on Instagram: Poulet crémeux au parmesan" />
  <meta property="og:description" content="Recette : poulet, crème, parmesan, épinards. Un régal !" />
  <meta property="og:image" content="https://scontent.cdninstagram.com/thumb.jpg" />
</head></html>`;

const PRIVATE_HTML = `<html><body>This Account is Private. Log in to see photos and videos.</body></html>`;

function geminiToolCallResponse(overrides: Record<string, unknown> = {}) {
  const payload = {
    title: "Poulet crémeux au parmesan",
    servings: 4,
    confidence: 0.85,
    notes: "Quantités estimées depuis la légende.",
    ai_summary:
      "Un poulet mijoté dans une sauce crémeuse au parmesan avec des épinards. Saisir le poulet, déglacer, ajouter crème et parmesan, incorporer les épinards en fin de cuisson.",
    prep_minutes: 10,
    cook_minutes: 20,
    tags: ["High Protein", "Dinner"],
    ingredients: [
      { name: "Filets de poulet", quantity: 600, unit: "g", grams: 600, category: "Viandes" },
      { name: "Crème entière", quantity: 20, unit: "cl", grams: 200, category: "Produits laitiers" },
      { name: "Parmesan râpé", quantity: 60, unit: "g", grams: 60, category: "Produits laitiers" },
    ],
    per_serving: { calories: 512, proteins: 46.5, carbs: 9.2, fats: 32.1, fiber: 2.3 },
    ...overrides,
  };
  return {
    choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify(payload) } } ] } }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface Scenario {
  page?: () => Response | Promise<Response>;
  image?: () => Response | Promise<Response>;
  gemini?: () => Response | Promise<Response>;
}

function installFetchMock(scenario: Scenario) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url === REEL_URL) return scenario.page ? scenario.page() : new Response("not found", { status: 404 });
    if (url.includes("cdninstagram.com")) {
      return scenario.image
        ? scenario.image()
        : new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    }
    if (url.includes("generativelanguage.googleapis.com")) {
      return scenario.gemini ? scenario.gemini() : jsonResponse(geminiToolCallResponse());
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

function deps(supa: ReturnType<typeof makeFakeSupabase>, userId = "user-1") {
  return {
    userSupa: supa,
    admin: supa, // même fake store — suffisant pour valider le flux cache global vs RLS par-utilisateur au niveau logique
    userId,
    geminiApiKey: "test-gemini-key",
    openaiApiKey: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("recipe-import — Instagram E2E (réseau + DB simulés)", () => {
  // ─── Cas 1 : Reel public contenant une recette ───────────────────────────
  it("Cas 1 — import complet : recette + ingrédients + macros créés", async () => {
    installFetchMock({ page: () => new Response(PUBLIC_HTML, { status: 200 }) });
    const supa = makeFakeSupabase();

    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );

    expect(result.error).toBeUndefined();
    const recipe = result.recipe as Record<string, unknown>;
    expect(recipe.title).toBe("Poulet crémeux au parmesan");
    expect(recipe.servings).toBe(4);
    expect((recipe.perServing as Record<string, number>).calories).toBe(512);
    expect((recipe.ingredients as unknown[]).length).toBe(3);
    expect(recipe.recipeId).toBeTruthy();
    expect(result.cached).toBe(false);
    // Fiche premium : résumé IA, auteur, temps, tags — tous conservés.
    expect(recipe.aiSummary).toMatch(/parmesan/i);
    expect(recipe.authorHandle).toBe("jane.cooks");
    expect(recipe.prepMinutes).toBe(10);
    expect(recipe.cookMinutes).toBe(20);
    expect(recipe.tags).toEqual(["High Protein", "Dinner"]);
    expect(recipe.originalCaption).toMatch(/poulet, crème, parmesan/i);

    // Persistance réelle : une ligne `recipes` + 3 `recipe_ingredients`.
    expect(supa.tables.recipes).toHaveLength(1);
    expect(supa.tables.recipes[0].user_id).toBe("user-1");
    expect(supa.tables.recipes[0].source_url).toBe(REEL_URL);
    expect(supa.tables.recipes[0].source_author).toBe("jane.cooks");
    expect(supa.tables.recipes[0].tags).toEqual(["High Protein", "Dinner"]);
    expect(supa.tables.recipe_ingredients).toHaveLength(3);
    // Cache global écrit pour bénéficier au prochain utilisateur.
    expect(supa.tables.recipe_import_cache).toHaveLength(1);
  });

  // ─── Cas 2 : même Reel importé une seconde fois (utilisateur différent) ──
  it("Cas 2 — deuxième import (autre utilisateur) : cache réutilisé, aucun appel réseau, aucune duplication", async () => {
    const { fn: fetchMock } = installFetchMock({ page: () => new Response(PUBLIC_HTML, { status: 200 }) });
    const supa = makeFakeSupabase();

    const t0 = performance.now();
    const first = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa, "user-1"),
    );
    const firstMs = performance.now() - t0;
    expect(first.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();

    fetchMock.mockClear();

    const t1 = performance.now();
    const second = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa, "user-2"),
    );
    const secondMs = performance.now() - t1;

    expect(second.error).toBeUndefined();
    expect(second.cached).toBe(true);
    // Aucun appel Gemini/Instagram : le cache global a été utilisé.
    expect(fetchMock).not.toHaveBeenCalled();
    // Aucune duplication : toujours UNE seule ligne en cache, mais DEUX
    // associations utilisateur (une par utilisateur, comportement attendu).
    expect(supa.tables.recipe_import_cache).toHaveLength(1);
    expect(supa.tables.recipes).toHaveLength(2);
    expect(supa.tables.recipes.filter((r) => r.user_id === "user-2")).toHaveLength(1);
    const secondRecipe = second.recipe as Record<string, unknown>;
    expect(secondRecipe.recipeId).not.toBe((first.recipe as Record<string, unknown>).recipeId);
    expect((secondRecipe.perServing as Record<string, number>).calories).toBe(512);

    console.log(`[E2E] Cas 2 — 1er import (analyse réelle simulée) : ${firstMs.toFixed(1)}ms`);
    console.log(`[E2E] Cas 2 — 2e import (cache) : ${secondMs.toFixed(1)}ms`);
  });

  it("Cas 2bis — même utilisateur réimporte : association déjà existante réutilisée, zéro appel réseau", async () => {
    const { fn: fetchMock } = installFetchMock({ page: () => new Response(PUBLIC_HTML, { status: 200 }) });
    const supa = makeFakeSupabase();

    await handleRecipeImport({ source: "instagram", input: { kind: "url", value: REEL_URL } }, deps(supa, "user-1"));
    fetchMock.mockClear();

    const again = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa, "user-1"),
    );
    expect(again.cached).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supa.tables.recipes).toHaveLength(1); // pas de doublon pour le même utilisateur
  });

  // ─── Cas 3 : URL invalide ─────────────────────────────────────────────────
  it("Cas 3 — URL invalide : message d'erreur spécifique", async () => {
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: "https://example.com/not-instagram" } },
      deps(supa),
    );
    expect(result.code).toBe("invalid_url");
    expect(result.error).toMatch(/lien.*(reconnu|accepté)/i);
    expect(supa.tables.recipes).toHaveLength(0);
  });

  // ─── Cas 4 : publication privée ───────────────────────────────────────────
  it("Cas 4 — publication privée : message d'erreur spécifique, rien en base", async () => {
    installFetchMock({ page: () => new Response(PRIVATE_HTML, { status: 200 }) });
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );
    expect(result.code).toBe("private_post");
    expect(result.error).toMatch(/priv/i);
    expect(supa.tables.recipes).toHaveLength(0);
    expect(supa.tables.recipe_import_cache).toHaveLength(0);
  });

  // ─── Cas 5 : publication supprimée ─────────────────────────────────────────
  it("Cas 5 — publication supprimée (404) : message d'erreur spécifique, rien en base", async () => {
    installFetchMock({ page: () => new Response("not found", { status: 404 }) });
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );
    expect(result.code).toBe("deleted_post");
    expect(result.error).toMatch(/introuvable|supprim/i);
    expect(supa.tables.recipes).toHaveLength(0);
  });

  // ─── Cas 6 : échec Gemini ───────────────────────────────────────────────
  it("Cas 6 — échec Gemini : aucun crash, message clair, aucune donnée partielle", async () => {
    installFetchMock({
      page: () => new Response(PUBLIC_HTML, { status: 200 }),
      gemini: () => new Response("service unavailable", { status: 503 }),
    });
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );
    expect(result.code).toBe("ai_error");
    expect(result.error).toBeTruthy();
    expect(result.recipe).toBeUndefined();
    // Aucun enregistrement incomplet : ni recette, ni ingrédients, ni cache.
    expect(supa.tables.recipes).toHaveLength(0);
    expect(supa.tables.recipe_ingredients).toHaveLength(0);
    expect(supa.tables.recipe_import_cache).toHaveLength(0);
  });

  it("Cas 6bis — tool_call Gemini vide/invalide : ai_error, rien en base", async () => {
    installFetchMock({
      page: () => new Response(PUBLIC_HTML, { status: 200 }),
      gemini: () => jsonResponse({ choices: [{ message: {} }] }),
    });
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );
    expect(result.code).toBe("ai_error");
    expect(supa.tables.recipes).toHaveLength(0);
  });

  // ─── Cas 7 : timeout Instagram ─────────────────────────────────────────────
  it("Cas 7 — timeout Instagram : arrêt propre, message adapté", async () => {
    const fn = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    vi.stubGlobal("fetch", fn);
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );
    expect(result.code).toBe("timeout");
    expect(result.error).toMatch(/temps|réessaie/i);
    expect(supa.tables.recipes).toHaveLength(0);
  });

  // ─── Robustesse additionnelle (hors campagne demandée, découverte en testant) ──
  it("Instagram rate-limited (429) : code dédié, pas confondu avec un timeout", async () => {
    installFetchMock({ page: () => new Response("too many requests", { status: 429 }) });
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );
    expect(result.code).toBe("instagram_rate_limited");
  });

  it("Ingrédients rejetés par la DB : la recette orpheline est retirée (aucun enregistrement incomplet)", async () => {
    installFetchMock({ page: () => new Response(PUBLIC_HTML, { status: 200 }) });
    const supa = makeFakeSupabase();
    // Force l'échec de l'insert recipe_ingredients pour simuler une erreur DB.
    const originalFrom = supa.from;
    supa.from = (table: string) => {
      const builder = originalFrom(table);
      if (table === "recipe_ingredients") {
        const originalThen = builder.then.bind(builder);
        builder.then = (resolve: (v: unknown) => void) => resolve({ error: { message: "constraint violation" } });
        void originalThen; // garde la référence sans l'appeler (bruit lint uniquement)
      }
      return builder;
    };

    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );
    expect(result.error).toBeTruthy();
    expect(result.recipe).toBeUndefined();
    // La recette a été retirée après l'échec des ingrédients — pas de ligne orpheline.
    expect(supa.tables.recipes).toHaveLength(0);
  });

  // ─── Cas 8 : réanalyse ──────────────────────────────────────────────────
  it("Cas 8 — Réanalyser : relance tout le pipeline, rafraîchit le cache, n'écrase pas la recette, historique incrémenté", async () => {
    const { fn: fetchMock } = installFetchMock({ page: () => new Response(PUBLIC_HTML, { status: 200 }) });
    const supa = makeFakeSupabase();

    const first = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa, "user-1"),
    );
    const recipeId = (first.recipe as Record<string, unknown>).recipeId as string;

    fetchMock.mockClear();
    const { fn: reanalyzeFetchMock } = installFetchMock({
      page: () => new Response(PUBLIC_HTML, { status: 200 }),
      gemini: () => jsonResponse(geminiToolCallResponse({ confidence: 0.95, notes: "Analyse affinée." })),
    });

    const reanalysis = await handleRecipeReanalyze(
      { source: "instagram", input: { kind: "url", value: REEL_URL }, reanalyze: true, recipeId },
      deps(supa, "user-1"),
    );

    expect(reanalysis.error).toBeUndefined();
    const freshRecipe = reanalysis.recipe as Record<string, unknown>;
    expect(freshRecipe.confidence).toBe(0.81); // 0.95 * (1 - pénalité transcript manquant 0.15)
    expect(freshRecipe.recipeId).toBe(recipeId);

    // Le pipeline a bien été relancé (aucun court-circuit par le cache).
    expect(reanalyzeFetchMock).toHaveBeenCalled();
    // Le cache global est rafraîchi (toujours une seule ligne, pas dupliqué).
    expect(supa.tables.recipe_import_cache).toHaveLength(1);
    expect(supa.tables.recipe_import_cache[0].confidence).toBe(0.81);
    // La recette de l'utilisateur n'est PAS modifiée par la réanalyse seule
    // (c'est `useUpdateRecipe`, côté frontend, qui applique si l'utilisateur valide).
    expect(supa.tables.recipes).toHaveLength(1);
    expect(supa.tables.recipes[0].confidence).toBe(0.72); // 0.85 * (1 - pénalité transcript manquant 0.15)
    // Historique bumpé côté serveur, qu'elle soit appliquée ou non.
    expect(supa.tables.recipes[0].reanalysis_count).toBe(1);
    expect(supa.tables.recipes[0].last_reanalyzed_at).toBeTruthy();
  });

  it("TikTok (source pas encore disponible) : message explicite, aucun crash", async () => {
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "tiktok", input: { kind: "url", value: "https://www.tiktok.com/@a/video/1" } },
      deps(supa),
    );
    expect(result.error).toMatch(/TikTok/);
    expect(result.recipe).toBeUndefined();
  });

  // ─── Règle de langue : la fiche STOCKÉE doit être réellement française ────
  const EN_HTML = `<html><head>
  <meta property="og:title" content="Jane Doe (@jane.cooks) on Instagram: Crispy honey carrots" />
  <meta property="og:description" content="Method: toss the carrots with olive oil spray and smoked paprika, then bake. Estimated per serve. #recipe @jane.cooks" />
  <meta property="og:image" content="https://scontent.cdninstagram.com/thumb.jpg" />
</head></html>`;

  const EN_PAYLOAD = {
    title: "Crispy honey carrots",
    notes: "Estimated per serve",
    ai_summary: "Method: bake the carrots with smoked paprika.",
    ingredients: [
      { name: "Carrots", quantity: 600, unit: "g", grams: 600, category: "Légumes" },
      { name: "Olive Oil Spray", quantity: 1, unit: "tablespoon", grams: 14, category: "Épicerie" },
    ],
  };
  const FR_PAYLOAD = {
    title: "Carottes croustillantes au miel",
    notes: "Valeurs estimées par portion",
    ai_summary: "Méthode : rôtir les carottes au paprika fumé.",
    ingredients: [
      { name: "Carottes", quantity: 600, unit: "g", grams: 600, category: "Légumes" },
      { name: "Spray d'huile d'olive", quantity: 1, unit: "c. à soupe", grams: 14, category: "Épicerie" },
    ],
  };

  /** Gemini renvoie d'abord la fiche VO, puis la fiche française sur la reprise renforcée. */
  function geminiThenFrench() {
    let call = 0;
    return () => jsonResponse(geminiToolCallResponse(call++ === 0 ? EN_PAYLOAD : FR_PAYLOAD));
  }

  it("Anglais — la fiche stockée est réellement française (même pipeline, reprise renforcée)", async () => {
    const { fn } = installFetchMock({ page: () => new Response(EN_HTML, { status: 200 }), gemini: geminiThenFrench() });
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );
    const recipe = result.recipe as Record<string, unknown>;
    expect(recipe.title).toBe("Carottes croustillantes au miel");
    const ings = recipe.ingredients as Array<Record<string, unknown>>;
    expect(ings.map((i) => i.name)).toEqual(["Carottes", "Spray d'huile d'olive"]);
    // Quantités et valeurs numériques strictement inchangées par la traduction.
    expect(ings[0].quantity).toBe(600);
    expect(ings[0].grams).toBe(600);
    expect(ings[1].quantity).toBe(1);
    // Légende Instagram d'origine conservée telle quelle (anglais, @ et #).
    expect(recipe.originalCaption).toContain("olive oil spray");
    expect(recipe.originalCaption).toContain("#recipe");
    expect(recipe.originalCaption).toContain("@jane.cooks");
    expect(supa.tables.recipes[0].source_description).toBe(recipe.originalCaption);
    expect(supa.tables.recipes[0].name).toBe("Carottes croustillantes au miel");
    // Aucun appel IA dédié uniquement à la traduction : exactement 2 extractions.
    const geminiCalls = fn.mock.calls.filter((c) => String(c[0]).includes("generativelanguage")).length;
    expect(geminiCalls).toBe(2);
  });

  it("Espagnol — la fiche stockée est réellement française", async () => {
    const ES_HTML = `<html><head>
  <meta property="og:title" content="Jane (@jane.cooks) on Instagram: Zanahorias al horno" />
  <meta property="og:description" content="Receta: zanahorias con mantequilla, al horno hasta dorar. #receta" />
  <meta property="og:image" content="https://scontent.cdninstagram.com/thumb.jpg" />
</head></html>`;
    installFetchMock({ page: () => new Response(ES_HTML, { status: 200 }), gemini: geminiThenFrench() });
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );
    const recipe = result.recipe as Record<string, unknown>;
    expect(recipe.title).toBe("Carottes croustillantes au miel");
    expect(recipe.originalCaption).toContain("zanahorias");
  });

  it("Français — aucune traduction inutile : un seul appel IA", async () => {
    const { fn } = installFetchMock({ page: () => new Response(PUBLIC_HTML, { status: 200 }) });
    const supa = makeFakeSupabase();
    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa),
    );
    expect((result.recipe as Record<string, unknown>).title).toBe("Poulet crémeux au parmesan");
    const geminiCalls = fn.mock.calls.filter((c) => String(c[0]).includes("generativelanguage")).length;
    expect(geminiCalls).toBe(1);
  });

  it("Cache hérité anglais (version 0) : ignoré, réanalysé une fois, remplacé par la version française", async () => {
    const { fn } = installFetchMock({ page: () => new Response(EN_HTML, { status: 200 }), gemini: geminiThenFrench() });
    const supa = makeFakeSupabase();
    // Entrée de cache écrite AVANT la règle de langue : fiche restée en anglais.
    supa.tables.recipe_import_cache.push({
      id: "legacy-1",
      source_kind: "instagram",
      source_url: REEL_URL,
      title: "Crispy honey carrots",
      servings: 4,
      confidence: 0.8,
      notes: null,
      source_image_url: null,
      source_description: "Method: bake the carrots.",
      ai_summary: null,
      source_author: "jane.cooks",
      prep_minutes: null,
      cook_minutes: null,
      tags: null,
      per_serving_calories: 100,
      per_serving_proteins: 1,
      per_serving_carbs: 1,
      per_serving_fats: 1,
      per_serving_fiber: 1,
      ingredients: [{ name: "Carrots", quantity: 600, unit: "g", grams: 600, category: "Légumes" }],
      language_rule_version: 0,
    });

    const result = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa, "user-1"),
    );
    // L'entrée héritée n'a PAS été servie : le pipeline a réanalysé.
    expect(result.cached).toBe(false);
    expect(fn.mock.calls.some((c) => String(c[0]).includes("generativelanguage"))).toBe(true);
    expect((result.recipe as Record<string, unknown>).title).toBe("Carottes croustillantes au miel");
    // Le cache est REMPLACÉ (pas dupliqué) par la version française conforme.
    expect(supa.tables.recipe_import_cache).toHaveLength(1);
    expect(supa.tables.recipe_import_cache[0].title).toBe("Carottes croustillantes au miel");
    expect(supa.tables.recipe_import_cache[0].language_rule_version).toBe(2);

    // Import suivant (autre utilisateur) : cache français réutilisé, aucun appel IA.
    fn.mockClear();
    const second = await handleRecipeImport(
      { source: "instagram", input: { kind: "url", value: REEL_URL } },
      deps(supa, "user-2"),
    );
    expect(second.cached).toBe(true);
    expect((second.recipe as Record<string, unknown>).title).toBe("Carottes croustillantes au miel");
    expect(fn).not.toHaveBeenCalled();
  });
});

