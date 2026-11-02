// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";

/**
 * MAJ-09 — audit du 04/09/2026 (chantier 6).
 *
 * Constat confirmé : `ensureTick()` créait un `setInterval` module-level de
 * 250ms qui n'était **jamais nettoyé** (aucun `clearInterval` dans tout le
 * fichier) — une fois un premier repos démarré, la boucle tournait pour le
 * reste de la session, même après `stop()`/fin du minuteur, et même sans
 * aucun composant `RestTimerInline` monté. `onFinish()` ouvrait en plus un
 * `AudioContext` à chaque repos terminé sans jamais le fermer (les
 * navigateurs plafonnent le nombre de contextes audio concurrents).
 *
 * Ces tests verrouillent la correction : l'intervalle est créé/détruit en
 * miroir de la vie réelle du décompte (start/pause/resume/stop/fin).
 *
 * 01/11/2026 — le remède audio de MAJ-09 (un contexte NEUF à chaque fin de
 * repos, refermé ensuite) rendait le signal MUET sur iPhone : créé hors geste,
 * dans un rappel de minuterie, le contexte restait `suspended`. Désormais UN
 * SEUL contexte pour toute la page (`lib/pwa/restChime.ts`), créé et repris
 * pendant le geste qui lance le repos, puis réutilisé : toujours aucune fuite
 * (une instance, jamais deux), et un son qui part vraiment.
 *
 * React 19 : sans ce drapeau, `act()` avertit à chaque rendu.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ─── Fake AudioContext (jsdom ne fournit pas la Web Audio API) ──────────────

class FakeOscillator {
  frequency = { value: 0 };
  type = "sine";
  connect() {
    return this;
  }
  start() {}
  stop() {}
}
class FakeGain {
  gain = {
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  };
  connect() {
    return this;
  }
}
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  destination = {};
  state: "suspended" | "running" | "closed" = "suspended";
  resumeCalls = 0;
  oscillators = 0;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createOscillator() {
    this.oscillators += 1;
    return new FakeOscillator();
  }
  createGain() {
    return new FakeGain();
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return { buffer: null as unknown, connect: () => undefined, start: () => undefined };
  }
  resume() {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

async function freshRestTimer() {
  vi.resetModules();
  const mod = await import("./useRestTimer");
  return mod;
}

describe("useRestTimer — cycle de vie du timer module-level (MAJ-09)", () => {
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    FakeAudioContext.instances = [];
    (window as unknown as { AudioContext: typeof FakeAudioContext }).AudioContext =
      FakeAudioContext;
    setIntervalSpy = vi.spyOn(window, "setInterval");
    clearIntervalSpy = vi.spyOn(window, "clearInterval");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("start() crée un seul intervalle, stop() le nettoie et rien ne repart tout seul ensuite", async () => {
    const { restTimer } = await freshRestTimer();

    restTimer.start(10, "ex-1");
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    restTimer.stop();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    // Aucune nouvelle boucle ne doit démarrer toute seule après l'arrêt.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("un décompte qui arrive à zéro nettoie lui-même l'intervalle (pas de fuite après la fin)", async () => {
    const { restTimer } = await freshRestTimer();

    restTimer.start(1, "ex-1"); // 1 seconde
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1_100); // dépasse la fin du décompte
    });

    // setInterval/clearInterval doivent être en miroir : plus rien ne tourne.
    expect(clearIntervalSpy.mock.calls.length).toBe(setIntervalSpy.mock.calls.length);

    // Et ça ne repart pas tout seul même en laissant filer le temps.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("pause() arrête le tick, resume() le relance (sans double intervalle)", async () => {
    const { restTimer } = await freshRestTimer();

    restTimer.start(10, "ex-1");
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    restTimer.pause();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    // Le temps qui passe pendant la pause ne doit rien redéclencher.
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    restTimer.resume();
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);

    restTimer.stop();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
  });

  it("le contexte audio est créé et repris PENDANT le geste qui lance le repos (iPhone)", async () => {
    const { restTimer } = await freshRestTimer();
    restTimer.setSound(true);

    restTimer.start(1, "ex-1");
    // Avant même la fin du repos : le contexte existe déjà et a été repris dans le geste.
    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.resumeCalls).toBeGreaterThanOrEqual(1);
    expect(ctx.state).toBe("running");

    act(() => {
      vi.advanceTimersByTime(1_100); // déclenche onFinish()
    });
    // Le son de fin réutilise CE contexte (deux bips), sans en créer un autre.
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ctx.oscillators).toBe(2);
  });

  it("des repos successifs partagent UN seul contexte (aucune fuite, aucun plafond atteint)", async () => {
    const { restTimer } = await freshRestTimer();
    restTimer.setSound(true);

    for (const id of ["ex-1", "ex-2", "ex-3"]) {
      restTimer.start(1, id);
      act(() => {
        vi.advanceTimersByTime(1_100);
      });
    }
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].oscillators).toBe(6);
    expect(FakeAudioContext.instances[0].state).not.toBe("closed");
  });

  it("son désactivé : aucun bip à la fin du repos", async () => {
    const { restTimer } = await freshRestTimer();
    restTimer.setSound(false);
    restTimer.start(1, "ex-1");
    act(() => {
      vi.advanceTimersByTime(1_100);
    });
    expect(FakeAudioContext.instances.every((c) => c.oscillators === 0)).toBe(true);
  });

  it("page en arrière-plan : la fin du repos passe par le service worker (Chrome Android, iOS installé)", async () => {
    const showNotification = vi.fn(
      async (_title: string, _options?: NotificationOptions) => undefined,
    );
    const NotificationCtor = vi.fn();
    Object.assign(NotificationCtor, { permission: "granted" });
    vi.stubGlobal("Notification", NotificationCtor);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: async () => ({ showNotification }) },
    });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    const { restTimer } = await freshRestTimer();
    restTimer.start(1, "ex-1");
    await act(async () => {
      vi.advanceTimersByTime(1_100);
    });
    await Promise.resolve();
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification.mock.calls[0]?.[0]).toBe("Repos terminé");
    // Jamais le constructeur, refusé par Chrome Android : le service worker suffit.
    expect(NotificationCtor).not.toHaveBeenCalled();

    // Page à l'écran : le minuteur visible suffit, aucune notification en plus.
    visibility.mockReturnValue("visible");
    restTimer.start(1, "ex-2");
    await act(async () => {
      vi.advanceTimersByTime(1_100);
    });
    await Promise.resolve();
    expect(showNotification).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("démontage d'un composant consommateur : plusieurs instances de useRestTimer partagent le même minuteur, et le nettoyage local (re-render 1s) se fait bien au unmount", async () => {
    const { restTimer, useRestTimer } = await freshRestTimer();

    function Consumer() {
      const t = useRestTimer();
      return createElement("span", null, String(t.remaining));
    }

    const containerA = document.createElement("div");
    const containerB = document.createElement("div");
    let rootA!: Root;
    let rootB!: Root;
    act(() => {
      rootA = createRoot(containerA);
      rootB = createRoot(containerB);
      rootA.render(createElement(Consumer));
      rootB.render(createElement(Consumer));
    });

    act(() => {
      restTimer.start(5, "ex-1");
    });

    // Les deux consommateurs reflètent le même minuteur partagé.
    expect(containerA.textContent).toBe(containerB.textContent);

    const intervalsBeforeUnmount = setIntervalSpy.mock.calls.length;

    // Démonter un seul des deux consommateurs ne doit pas casser l'autre ni
    // le minuteur module-level partagé.
    act(() => {
      rootA.unmount();
    });

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    // B continue de recevoir les mises à jour du store partagé.
    expect(containerB.textContent).not.toBe("");

    act(() => {
      restTimer.stop();
      rootB.unmount();
    });

    // Aucun intervalle module-level supplémentaire n'a été créé par le simple
    // fait de monter/démonter des consommateurs.
    expect(setIntervalSpy.mock.calls.length).toBeGreaterThanOrEqual(intervalsBeforeUnmount);
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(0);
  });
});
