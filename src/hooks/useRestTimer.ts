import { useEffect, useState, useSyncExternalStore } from "react";
import { playRestChime, primeRestChime } from "@/lib/pwa/restChime";

// ─── Persistent rest-timer store ─────────────────────────────────────────────
// Timestamp-based (no setInterval drift). Persisted in localStorage so the
// timer survives navigation, app close, reload.

const STATE_KEY = "rest-timer:state:v1";
const DEFAULTS_KEY = "rest-timer:per-exercise:v2";
const SETTINGS_KEY = "rest-timer:settings:v2";

export type RestTimerState = {
  endAt: number | null; // ms epoch when timer ends (null = idle)
  totalSec: number; // full duration for progress ring
  pausedRemaining: number | null; // seconds remaining if paused
  exerciseId: string | null;
  finished: boolean; // reached zero, awaiting user action
};

type Settings = {
  soundEnabled: boolean;
  defaultDuration: number; // seconds
};

const defaultState: RestTimerState = {
  endAt: null,
  totalSec: 0,
  pausedRemaining: null,
  exerciseId: null,
  finished: false,
};

const defaultSettings: Settings = {
  soundEnabled: true,
  defaultDuration: 60,
};

// ─── Storage helpers ─────────────────────────────────────────────────────────

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// ─── Singleton store ─────────────────────────────────────────────────────────

let state: RestTimerState = readJSON(STATE_KEY, defaultState);
let settings: Settings = readJSON(SETTINGS_KEY, defaultSettings);
let perExerciseDefaults: Record<string, number> = readJSON(DEFAULTS_KEY, {});

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function setState(patch: Partial<RestTimerState>) {
  state = { ...state, ...patch };
  writeJSON(STATE_KEY, state);
  notify();
}

// ─── Effects: tick & finish detection ────────────────────────────────────────
//
// `intervalId` is module-level by design (the countdown must keep running
// across navigation/unmounts, per the singleton store above). It must NOT,
// however, keep ticking forever once there is nothing left to count down:
// `ensureTick()` lazily creates it, and every path that leaves the "actively
// counting down" state (finish, pause, stop) must call `stopTick()` so the
// 250ms loop does not run for the rest of the tab's lifetime.

let intervalId: ReturnType<typeof setInterval> | null = null;

function stopTick() {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function ensureTick() {
  if (intervalId != null) return;
  intervalId = setInterval(() => {
    if (state.finished || state.pausedRemaining != null || state.endAt == null) {
      // Nothing left to count down (finished/paused/idle) — stop polling
      // instead of ticking uselessly every 250ms indefinitely.
      stopTick();
      return;
    }
    const remaining = Math.ceil((state.endAt - Date.now()) / 1000);
    if (remaining <= 0) {
      onFinish();
    } else {
      notify();
    }
  }, 250);
}

async function notifyRestFinished(): Promise<void> {
  try {
    if (typeof document !== "undefined" && document.visibilityState === "visible") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const options: NotificationOptions = {
      body: "C'est reparti, prochaine série !",
      icon: "/icons/icon-192.png",
      silent: !settings.soundEnabled,
      tag: "rest-timer",
    };
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration) {
      await registration.showNotification("Repos terminé", options);
      return;
    }
    new Notification("Repos terminé", options);
  } catch {
    /* ignore — notification facultative */
  }
}

function onFinish() {
  stopTick();
  setState({ finished: true, endAt: null });
  // Vibration
  try {
    navigator.vibrate?.([200, 100, 200, 100, 400]);
  } catch {
    /* ignore */
  }
  // Son — contexte audio partagé, déverrouillé au toucher qui a lancé le repos
  // (`lib/pwa/restChime.ts`) : un contexte neuf créé ici, hors geste, restait muet sur iPhone.
  if (settings.soundEnabled) playRestChime();
  // Notification — seulement quand la page n'est pas à l'écran (sinon le minuteur suffit).
  // `ServiceWorkerRegistration.showNotification` d'abord : le constructeur `Notification` est
  // refusé par Chrome Android et absent des apps iOS installées.
  void notifyRestFinished();
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export const restTimer = {
  start(seconds: number, exerciseId: string | null = null) {
    if (seconds <= 0) return;
    if (exerciseId) {
      perExerciseDefaults = { ...perExerciseDefaults, [exerciseId]: seconds };
      writeJSON(DEFAULTS_KEY, perExerciseDefaults);
    }
    setState({
      endAt: Date.now() + seconds * 1000,
      totalSec: seconds,
      pausedRemaining: null,
      exerciseId,
      finished: false,
    });
    ensureTick();
    // Toujours appelé depuis un geste (valider une série, relancer) : seul moment où iOS
    // accepte de démarrer la sortie audio qui sonnera la fin du repos.
    primeRestChime();
    // Ask notification permission lazily
    try {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  },
  startForExercise(exerciseId: string | null, fallbackSeconds?: number) {
    const seconds =
      (exerciseId && perExerciseDefaults[exerciseId]) ||
      fallbackSeconds ||
      settings.defaultDuration;
    this.start(seconds, exerciseId);
  },
  pause() {
    if (state.endAt == null || state.pausedRemaining != null) return;
    const remaining = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
    stopTick();
    setState({ pausedRemaining: remaining });
  },
  resume() {
    if (state.pausedRemaining == null) return;
    primeRestChime();
    setState({
      endAt: Date.now() + state.pausedRemaining * 1000,
      pausedRemaining: null,
    });
    ensureTick();
  },
  restart() {
    if (state.totalSec > 0) this.start(state.totalSec, state.exerciseId);
  },
  stop() {
    stopTick();
    setState({ ...defaultState });
  },
  setSound(enabled: boolean) {
    settings = { ...settings, soundEnabled: enabled };
    writeJSON(SETTINGS_KEY, settings);
    notify();
  },
  setDefaultDuration(seconds: number) {
    settings = { ...settings, defaultDuration: Math.max(5, Math.round(seconds)) };
    writeJSON(SETTINGS_KEY, settings);
    notify();
  },
  getSettings(): Settings {
    return settings;
  },
  getDefaultFor(exerciseId: string | null): number {
    if (exerciseId && perExerciseDefaults[exerciseId]) return perExerciseDefaults[exerciseId];
    return settings.defaultDuration;
  },
};

// Sync state across browser tabs / windows
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STATE_KEY) {
      state = readJSON(STATE_KEY, defaultState);
      notify();
    } else if (e.key === SETTINGS_KEY) {
      settings = readJSON(SETTINGS_KEY, defaultSettings);
      notify();
    } else if (e.key === DEFAULTS_KEY) {
      perExerciseDefaults = readJSON(DEFAULTS_KEY, {});
      notify();
    }
  });
  if (state.endAt != null && state.pausedRemaining == null && !state.finished) ensureTick();
}

// ─── React hook ──────────────────────────────────────────────────────────────

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return state;
}

export function useRestTimer() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [, force] = useState(0);

  // Local 1s tick so the displayed seconds re-render even without store changes
  useEffect(() => {
    if (s.endAt == null || s.pausedRemaining != null) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.endAt, s.pausedRemaining]);

  const remaining =
    s.pausedRemaining != null
      ? s.pausedRemaining
      : s.endAt != null
        ? Math.max(0, Math.ceil((s.endAt - Date.now()) / 1000))
        : 0;

  return {
    ...s,
    remaining,
    isActive: s.endAt != null || s.pausedRemaining != null || s.finished,
    isPaused: s.pausedRemaining != null,
    soundEnabled: settings.soundEnabled,
    defaultDuration: settings.defaultDuration,
  };
}
