import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * MAJ-07 — `exercise_similarity_pairs` et `exercise_merge_log` sont RLS
 * service-role-only : les lectures passent désormais par l'edge function
 * `admin-exercise-actions` (actions `list_similarity_pairs`/`list_merge_log`),
 * jamais par un SELECT direct. Ce test vérifie que l'UI peut distinguer un
 * refus d'autorisation serveur (401/403) d'une erreur technique quelconque,
 * et qu'une réponse autorisée mais vide n'est jamais confondue avec un
 * refus. Même convention que useRecipeVariants.test.ts : on mocke
 * `@/integrations/supabase/client` et on teste les fonctions exportées
 * directement, pas de hook React à monter.
 */

const functionsInvokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => functionsInvokeMock(...args) },
  },
}));

// Import après le mock (obligatoire avec vi.mock hoisté).
import { AdminActionError, fetchSimilarityPairs, fetchMergeLog } from "./useExerciseAdmin";

beforeEach(() => {
  functionsInvokeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function httpError(status: number, body: Record<string, unknown>) {
  const response = new Response(JSON.stringify(body), { status });
  return new FunctionsHttpError(response);
}

describe("fetchSimilarityPairs", () => {
  it("renvoie les paires quand l'appel est autorisé", async () => {
    functionsInvokeMock.mockResolvedValueOnce({
      data: { pairs: [{ id: "p1", score: 0.9, status: "suggested" }] },
      error: null,
    });
    const pairs = await fetchSimilarityPairs("suggested");
    expect(pairs).toHaveLength(1);
    expect(functionsInvokeMock).toHaveBeenCalledWith("admin-exercise-actions", {
      body: { action: "list_similarity_pairs", status: "suggested" },
    });
  });

  it("renvoie un tableau vide (autorisé, rien à afficher) sans lever d'erreur", async () => {
    functionsInvokeMock.mockResolvedValueOnce({ data: { pairs: [] }, error: null });
    const pairs = await fetchSimilarityPairs("suggested");
    expect(pairs).toEqual([]);
  });

  it("lève une AdminActionError kind=unauthorized sur un 403 serveur", async () => {
    functionsInvokeMock.mockResolvedValueOnce({
      data: null,
      error: httpError(403, { error: "Accès réservé à l'administration Cortex." }),
    });
    await expect(fetchSimilarityPairs("suggested")).rejects.toMatchObject({
      kind: "unauthorized",
    } satisfies Partial<AdminActionError>);
  });

  it("lève une AdminActionError kind=unauthorized sur un 401 serveur", async () => {
    functionsInvokeMock.mockResolvedValueOnce({
      data: null,
      error: httpError(401, { error: "Session invalide — reconnecte-toi." }),
    });
    await expect(fetchSimilarityPairs("suggested")).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("lève une AdminActionError kind=server sur une erreur 500 — jamais confondue avec un refus", async () => {
    functionsInvokeMock.mockResolvedValueOnce({
      data: null,
      error: httpError(500, { error: "Service indisponible" }),
    });
    await expect(fetchSimilarityPairs("suggested")).rejects.toMatchObject({ kind: "server" });
  });
});

describe("fetchMergeLog", () => {
  it("mappe les noms depuis les jointures kept/archived", async () => {
    functionsInvokeMock.mockResolvedValueOnce({
      data: {
        log: [
          {
            id: "m1",
            kept_exercise_id: "e1",
            archived_exercise_id: "e2",
            performed_at: "2026-01-01T00:00:00Z",
            undone_at: null,
            kept: { name: "Développé couché" },
            archived: { name: "Développé couché (variante)" },
          },
        ],
      },
      error: null,
    });
    const log = await fetchMergeLog();
    expect(log).toEqual([
      {
        id: "m1",
        kept_exercise_id: "e1",
        archived_exercise_id: "e2",
        performed_at: "2026-01-01T00:00:00Z",
        undone_at: null,
        keptName: "Développé couché",
        archivedName: "Développé couché (variante)",
      },
    ]);
  });

  it("lève une AdminActionError kind=unauthorized quand le compte n'est pas admin", async () => {
    functionsInvokeMock.mockResolvedValueOnce({
      data: null,
      error: httpError(403, { error: "Accès réservé à l'administration Cortex." }),
    });
    await expect(fetchMergeLog()).rejects.toMatchObject({ kind: "unauthorized" });
  });
});
