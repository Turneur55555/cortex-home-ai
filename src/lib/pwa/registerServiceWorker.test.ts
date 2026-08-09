// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./registerServiceWorker";

/**
 * Couvre le bug diagnostiqué : l'injection automatique de
 * `vite-plugin-pwa` (`injectRegister: "inline"`) ne s'applique jamais à ce
 * projet (pas de `index.html` statique, shell rendu par TanStack
 * Start/SSR) — le Service Worker n'était donc jamais enregistré en
 * production. `registerServiceWorker()` le fait désormais explicitement,
 * uniquement côté client.
 *
 * On capture le listener passé à `window.addEventListener("load", ...)`
 * plutôt que de dispatcher un vrai event sur `window` (partagé entre tous
 * les tests du fichier jsdom — un dispatch réel accumulerait les listeners
 * des tests précédents et ferait planter les suivants).
 */
describe("registerServiceWorker", () => {
  let registerMock: ReturnType<typeof vi.fn>;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    registerMock = vi.fn().mockResolvedValue({ scope: "/" });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: registerMock },
    });
    addEventListenerSpy = vi.spyOn(window, "addEventListener");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fireLoad() {
    const call = addEventListenerSpy.mock.calls.find(([event]: [string]) => event === "load");
    (call?.[1] as EventListener)(new Event("load"));
  }

  it("enregistre /sw.js au chargement de la page", async () => {
    registerServiceWorker();
    fireLoad();
    // Laisse la microtask de la promesse résoudre.
    await Promise.resolve();
    expect(registerMock).toHaveBeenCalledWith("/sw.js");
  });

  it("ne fait rien si le navigateur ne supporte pas les Service Workers", () => {
    // `in` (feature detection standard) exige l'absence complète de la
    // propriété, pas juste une valeur `undefined`.
    // @ts-expect-error simulate un navigateur sans support Service Worker.
    delete navigator.serviceWorker;
    expect(() => registerServiceWorker()).not.toThrow();
    expect(addEventListenerSpy).not.toHaveBeenCalledWith("load", expect.anything());
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("ne plante jamais côté serveur (pas de window)", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error simulate SSR : pas de `window` global.
    delete globalThis.window;
    try {
      expect(() => registerServiceWorker()).not.toThrow();
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("journalise sans planter si l'enregistrement échoue", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerMock.mockRejectedValueOnce(new Error("registration failed"));
    registerServiceWorker();
    fireLoad();
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleError).toHaveBeenCalled();
  });
});
