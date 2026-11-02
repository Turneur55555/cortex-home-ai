// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useScreenWakeLock } from "./useScreenWakeLock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeSentinel {
  released = false;
  release = vi.fn(async () => {
    this.released = true;
  });
}

let sentinels: FakeSentinel[];
let request: ReturnType<typeof vi.fn>;
let visibility: DocumentVisibilityState;
let container: HTMLDivElement;
let root: Root;

function Probe({ active }: { active: boolean }) {
  useScreenWakeLock(active);
  return null;
}

async function render(active: boolean) {
  await act(async () => {
    root.render(createElement(Probe, { active }));
  });
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  sentinels = [];
  visibility = "visible";
  request = vi.fn(async () => {
    const s = new FakeSentinel();
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("useScreenWakeLock — l'écran reste allumé pendant la séance", () => {
  it("séance active : un seul verrou demandé ; fin de séance : il est relâché", async () => {
    await render(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("screen");

    await render(false);
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it("inactif : aucun verrou demandé", async () => {
    await render(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("retour au premier plan : le verrou relâché par le navigateur est redemandé", async () => {
    await render(true);
    // Le navigateur relâche le verrou quand la page passe en arrière-plan.
    sentinels[0].released = true;
    await act(async () => {
      setVisibility("hidden");
    });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => {
      setVisibility("visible");
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("verrou encore tenu : pas de seconde demande au retour à l'écran", async () => {
    await render(true);
    await act(async () => {
      setVisibility("visible");
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("refus du navigateur ou API absente : aucune erreur", async () => {
    request.mockRejectedValueOnce(new Error("NotAllowedError"));
    await render(true);
    expect(request).toHaveBeenCalledTimes(1);

    Reflect.deleteProperty(navigator, "wakeLock");
    await render(false);
    await render(true);
  });

  it("démontage pendant la demande : le verrou obtenu trop tard est aussitôt relâché", async () => {
    let resolve: (s: FakeSentinel) => void = () => undefined;
    request.mockImplementationOnce(
      () =>
        new Promise<FakeSentinel>((r) => {
          resolve = r;
        }),
    );
    await render(true);
    act(() => root.unmount());
    const late = new FakeSentinel();
    await act(async () => {
      resolve(late);
    });
    expect(late.release).toHaveBeenCalledTimes(1);
    root = createRoot(container);
  });
});
