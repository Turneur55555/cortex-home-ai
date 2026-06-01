import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

// Mock du client Supabase AVANT l'import du module testé
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import { buildScanFridgeRequest, invokeScanFridge } from "./scan";

const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAarVyFEAAAAASUVORK5CYII=";
const MIME = "image/jpeg";

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("buildScanFridgeRequest — mapping pièce → module", () => {
  it.each([
    ["cuisine", "alimentation"],
    ["Cuisine", "alimentation"],
    ["frigo", "alimentation"],
    ["cave", "alimentation"],
    ["salle-de-bain", "pharmacie"],
    ["armoire-pharmacie", "pharmacie"],
    ["dressing", "habits"],
    ["vêtements", "habits"],
    ["buanderie", "menager"],
    ["salon", "menager"],
    ["garage", "menager"],
    ["pièce-inconnue", "menager"],
  ])("room=%s → module=%s", (room, expected) => {
    const req = buildScanFridgeRequest({ room, b64: B64, mime: MIME });
    expect(req).toEqual({
      image_base64: B64,
      mime_type: MIME,
      room,
      module: expected,
    });
  });
});

describe("invokeScanFridge — flux d'intégration complet", () => {
  it("envoie le bon payload à l'edge function (cuisine → alimentation)", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { summary: "ok", extracted_items: [] },
      error: null,
    });

    await invokeScanFridge({ room: "cuisine", b64: B64, mime: MIME });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("scan-fridge", {
      body: {
        image_base64: B64,
        mime_type: MIME,
        room: "cuisine",
        module: "alimentation",
      },
    });
  });

  it.each([
    ["salle-de-bain", "pharmacie"],
    ["dressing", "habits"],
    ["buanderie", "menager"],
  ])("envoie module=%s pour room=%s", async (room, expectedModule) => {
    invokeMock.mockResolvedValueOnce({
      data: { extracted_items: [] },
      error: null,
    });

    await invokeScanFridge({ room, b64: B64, mime: MIME });

    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.module).toBe(expectedModule);
    expect(opts.body.room).toBe(room);
  });

  it("retourne extracted_items en cas de succès", async () => {
    const items = [
      { name: "Skyr", category: "produit_laitier", quantity: 1, unit: "pot", expiration_date: "2026-06-12" },
      { name: "Lait", category: "produit_laitier", quantity: 1, unit: "bouteille" },
    ];
    invokeMock.mockResolvedValueOnce({
      data: { summary: "2 items détectés", extracted_items: items },
      error: null,
    });

    const result = await invokeScanFridge({ room: "cuisine", b64: B64, mime: MIME });
    expect(result).toEqual(items);
  });

  it("retourne tableau vide quand extracted_items est manquant", async () => {
    invokeMock.mockResolvedValueOnce({ data: {}, error: null });
    const result = await invokeScanFridge({ room: "cuisine", b64: B64, mime: MIME });
    expect(result).toEqual([]);
  });

  it("lance une erreur en cas d'erreur réseau / edge function (status non-2xx)", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code" },
    });

    await expect(
      invokeScanFridge({ room: "cuisine", b64: B64, mime: MIME }),
    ).rejects.toThrow("Edge Function returned a non-2xx status code");
  });

  it("lance une erreur quand l'edge function retourne data.error (ex: Module invalide)", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { error: "Module invalide. Valeurs acceptées : alimentation, pharmacie, habits, menager." },
      error: null,
    });

    await expect(
      invokeScanFridge({ room: "cuisine", b64: B64, mime: MIME }),
    ).rejects.toThrow(/Module invalide/);
  });

  it("régression : cuisine NE produit JAMAIS 'cuisine' comme module envoyé", async () => {
    invokeMock.mockResolvedValueOnce({ data: { extracted_items: [] }, error: null });
    await invokeScanFridge({ room: "cuisine", b64: B64, mime: MIME });
    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.module).not.toBe("cuisine");
    expect(opts.body.module).toBe("alimentation");
  });

  it("gère l'erreur 'Non authentifié' renvoyée par l'edge function", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { error: "Non authentifié." },
      error: null,
    });
    await expect(
      invokeScanFridge({ room: "salle-de-bain", b64: B64, mime: MIME }),
    ).rejects.toThrow("Non authentifié.");
  });

  it("gère l'erreur de rate limit", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { error: "Limite atteinte (20/20 scans/h). Réessaie plus tard." },
      error: null,
    });
    await expect(
      invokeScanFridge({ room: "cuisine", b64: B64, mime: MIME }),
    ).rejects.toThrow(/Limite atteinte/);
  });
});
