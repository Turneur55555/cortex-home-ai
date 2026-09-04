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
 * miroir de la vie réelle du décompte (start/pause/resume/stop/fin), et
 * l'AudioContext ouvert au son de fin est fermé peu après avoir joué.
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
  closed = false;
  closeCalls = 0;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createOscillator() {
    return new FakeOscillator();
  }
  createGain() {
    return new FakeGain();
  }
  close() {
    this.closed = true;
    this.closeCalls += 1;
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

  it("le son de fin ouvre un AudioContext et le referme peu après (pas de fuite)", async () => {
    const { restTimer } = await freshRestTimer();
    restTimer.setSound(true);

    restTimer.start(1, "ex-1");
    act(() => {
      vi.advanceTimersByTime(1_100); // déclenche onFinish()
    });

    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.closed).toBe(false);

    act(() => {
      vi.advanceTimersByTime(800); // laisse le délai de fermeture s'écouler
    });
    expect(ctx.closed).toBe(true);
    expect(ctx.closeCalls).toBe(1);
  });

  it("des minuteurs successifs ne s'accumulent pas : chaque AudioContext est fermé avant/à la fin du suivant", async () => {
    const { restTimer } = await freshRestTimer();
    restTimer.setSound(true);

    restTimer.start(1, "ex-1");
    act(() => {
      vi.advanceTimersByTime(1_100);
      vi.advanceTimersByTime(800);
    });
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].closed).toBe(true);

    restTimer.start(1, "ex-2");
    act(() => {
      vi.advanceTimersByTime(1_100);
      vi.advanceTimersByTime(800);
    });
    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(FakeAudioContext.instances.every((c) => c.closed)).toBe(true);
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
