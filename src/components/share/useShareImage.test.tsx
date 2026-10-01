// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ShareOutcome } from "@/lib/share/shareImage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shareImage = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/share/shareImage", () => ({ shareImage }));
vi.mock("sonner", () => ({ toast }));

import { useShareImage } from "@/components/share/useShareImage";

type Api = ReturnType<typeof useShareImage>;
let api: Api;
let container: HTMLDivElement;
let root: Root;

function Probe({ attach = true }: { attach?: boolean }) {
  api = useShareImage();
  return attach ? <div ref={api.exportRef} data-testid="node" /> : null;
}

const OPTIONS = { filename: "a.png", title: "t", text: "x" };

beforeEach(() => {
  shareImage.mockReset().mockResolvedValue("shared" satisfies ShareOutcome);
  toast.success.mockReset();
  toast.error.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useShareImage — dire ce qui s'est passé", () => {
  it("capture le nœud branché, avec le fond d'export", async () => {
    await act(async () => {
      await api.run(OPTIONS);
    });
    expect(shareImage).toHaveBeenCalledTimes(1);
    const [node, options] = shareImage.mock.calls[0];
    expect(node).toBe(container.querySelector('[data-testid="node"]'));
    expect(options).toMatchObject({ filename: "a.png", backgroundColor: "#050505" });
  });

  it("partagé ou fermé par l'utilisateur : aucun message", async () => {
    for (const outcome of ["shared", "cancelled"] as const) {
      shareImage.mockResolvedValue(outcome);
      await act(async () => {
        await api.run(OPTIONS);
      });
    }
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("image enregistrée à la place du partage : annoncée (sinon un bouton qui semble cassé)", async () => {
    shareImage.mockResolvedValue("downloaded");
    await act(async () => {
      await api.run(OPTIONS);
    });
    expect(toast.success).toHaveBeenCalledWith("Image enregistrée");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("échec : annoncé — l'ancien comportement ne disait rien", async () => {
    shareImage.mockResolvedValue("failed");
    await act(async () => {
      await api.run(OPTIONS);
    });
    expect(toast.error).toHaveBeenCalledWith("Impossible de créer l'image");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("verrou : un second appui pendant la capture ne relance rien", async () => {
    let finish: (o: ShareOutcome) => void = () => undefined;
    shareImage.mockReturnValue(new Promise<ShareOutcome>((resolve) => (finish = resolve)));
    let first: Promise<unknown> = Promise.resolve();
    let second: unknown = "pas appelé";
    await act(async () => {
      first = api.run(OPTIONS);
      second = await api.run(OPTIONS);
    });
    expect(second).toBeNull();
    expect(shareImage).toHaveBeenCalledTimes(1);
    expect(api.busy).toBe("share");
    await act(async () => {
      finish("shared");
      await first;
    });
    expect(api.busy).toBeNull();
  });

  it("`busy` distingue partager et enregistrer (le bon bouton tourne)", async () => {
    let finish: (o: ShareOutcome) => void = () => undefined;
    shareImage.mockReturnValue(new Promise<ShareOutcome>((resolve) => (finish = resolve)));
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = api.run({ ...OPTIONS, mode: "download" });
    });
    expect(api.busy).toBe("download");
    await act(async () => {
      finish("downloaded");
      await pending;
    });
  });

  it("le verrou est relâché même si la capture lève : on peut réessayer", async () => {
    shareImage.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await api.run(OPTIONS).catch(() => undefined);
    });
    expect(api.busy).toBeNull();
    shareImage.mockResolvedValue("shared");
    await act(async () => {
      await api.run(OPTIONS);
    });
    expect(shareImage).toHaveBeenCalledTimes(2);
  });

  it("aucun nœud branché : rien n'est capturé", async () => {
    act(() => root.render(<Probe attach={false} />));
    let result: unknown = "pas appelé";
    await act(async () => {
      result = await api.run(OPTIONS);
    });
    expect(result).toBeNull();
    expect(shareImage).not.toHaveBeenCalled();
  });
});
