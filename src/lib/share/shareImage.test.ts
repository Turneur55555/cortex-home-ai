// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toPng = vi.hoisted(() => vi.fn());
vi.mock("html-to-image", () => ({ toPng }));

import { downloadBlob, shareImage, type ShareImageOptions } from "@/lib/share/shareImage";

const OPTIONS: ShareImageOptions = {
  filename: "cortex-test.png",
  title: "Titre",
  text: "Texte",
};

let node: HTMLElement;
let share: ReturnType<typeof vi.fn>;
let canShare: ReturnType<typeof vi.fn>;
let click: ReturnType<typeof vi.spyOn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

function setNavigator(value: Record<string, unknown>) {
  for (const key of ["share", "canShare"])
    delete (navigator as unknown as Record<string, unknown>)[key];
  Object.assign(navigator, value);
}

beforeEach(() => {
  node = document.createElement("div");
  toPng.mockReset().mockResolvedValue("data:image/png;base64,AAAA");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ blob: async () => new Blob(["png"], { type: "image/png" }) })),
  );
  share = vi.fn(async () => undefined);
  canShare = vi.fn(() => true);
  setNavigator({ share, canShare });
  createObjectURL = vi.fn(() => "blob:fake");
  revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("shareImage — ce qui s'est réellement passé", () => {
  it("partage natif disponible → `shared`, le fichier PNG est transmis, rien n'est téléchargé", async () => {
    await expect(shareImage(node, OPTIONS)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0][0] as { files: File[]; title: string; text: string };
    expect(data.title).toBe("Titre");
    expect(data.text).toBe("Texte");
    expect(data.files).toHaveLength(1);
    expect(data.files[0].name).toBe("cortex-test.png");
    expect(data.files[0].type).toBe("image/png");
    expect(click).not.toHaveBeenCalled();
  });

  it("l'utilisateur ferme la feuille (AbortError) → `cancelled`, jamais de téléchargement imposé", async () => {
    share.mockRejectedValue(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    await expect(shareImage(node, OPTIONS)).resolves.toBe("cancelled");
    expect(click).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("le partage natif échoue autrement (autorisation expirée) → l'image est enregistrée", async () => {
    share.mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    await expect(shareImage(node, OPTIONS)).resolves.toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("pas de partage natif (ordinateur) → téléchargement", async () => {
    setNavigator({});
    await expect(shareImage(node, OPTIONS)).resolves.toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("le navigateur ne sait pas partager des FICHIERS → téléchargement", async () => {
    canShare.mockReturnValue(false);
    await expect(shareImage(node, OPTIONS)).resolves.toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("mode `download` : on n'ouvre jamais la feuille de partage", async () => {
    await expect(shareImage(node, { ...OPTIONS, mode: "download" })).resolves.toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("la capture échoue → `failed`, rien n'est parti", async () => {
    toPng.mockRejectedValue(new Error("canvas tainted"));
    await expect(shareImage(node, OPTIONS)).resolves.toBe("failed");
    expect(share).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("l'enregistrement échoue → `failed`", async () => {
    setNavigator({});
    createObjectURL.mockImplementation(() => {
      throw new Error("quota");
    });
    await expect(shareImage(node, OPTIONS)).resolves.toBe("failed");
  });
});

describe("shareImage — réglages de capture", () => {
  it("par défaut : pixelRatio 2 et cacheBust DÉSACTIVÉ (il invaliderait les URLs signées)", async () => {
    await shareImage(node, OPTIONS);
    expect(toPng).toHaveBeenCalledWith(
      node,
      expect.objectContaining({ pixelRatio: 2, cacheBust: false }),
    );
  });

  it("dimensions, fond et cacheBust sont transmis tels quels", async () => {
    await shareImage(node, {
      ...OPTIONS,
      width: 540,
      height: 960,
      backgroundColor: "#123456",
      pixelRatio: 3,
      cacheBust: true,
    });
    expect(toPng).toHaveBeenCalledWith(node, {
      pixelRatio: 3,
      backgroundColor: "#123456",
      cacheBust: true,
      width: 540,
      height: 960,
    });
  });

  it("aucune couleur n'est choisie par la bibliothèque : fond absent → absent", async () => {
    await shareImage(node, OPTIONS);
    const options = toPng.mock.calls[0][1] as Record<string, unknown>;
    expect(options.backgroundColor).toBeUndefined();
  });
});

describe("downloadBlob", () => {
  it("la révocation de l'URL est DIFFÉRÉE : le téléchargement a le temps de démarrer", () => {
    vi.useFakeTimers();
    downloadBlob(new Blob(["x"]), "a.png");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
