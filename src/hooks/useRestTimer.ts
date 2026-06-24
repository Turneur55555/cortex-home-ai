import { useEffect, useState, useSyncExternalStore } from "react";

// ─── Persistent rest-timer store ─────────────────────────────────────────────
// Timestamp-based (no setInterval drift). Persisted in localStorage so the
// timer survives navigation, app close, reload.

const STATE_KEY = "rest-timer:state:v1";
const DEFAULTS_KEY = "rest-timer:per-exercise:v2";
const SETTINGS_KEY = "rest-timer:settings:v2";

export type RestTimerState = {
  endAt: number | null;        // ms epoch when timer ends (null = idle)
  totalSec: number;            // full duration for progress ring
  pausedRemaining: number | null; // seconds remaining if paused
  exerciseId: string | null;
  finished: boolean;           // reached zero, awaiting user action
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

let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureTick() {
  if (intervalId != null) return;
  intervalId = setInterval(() => {
    if (state.endAt == null || state.pausedRemaining != null || state.finished) return;
    const remaining = Math.ceil((state.endAt - Date.now()) / 1000);
    if (remaining <= 0) {
      onFinish();
    } else {
      notify();
    }
  }, 250);
}

function onFinish() {
  setState({ finished: true, endAt: null });
  // Vibration
  try {
    navigator.vibrate?.([200, 100, 200, 100, 400]);
  } catch {
    /* ignore */
  }
  // Sound
  if (settings.soundEnabled) {
    try {
      const Ctx =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const playAt = (when: number, freq: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + when);
          gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + when + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + 0.3);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + when);
          osc.stop(ctx.currentTime + when + 0.35);
        };
        playAt(0, 880);
        playAt(0.35, 1175);
      }
    } catch {
      /* ignore */
    }
  }
  // Local notification
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Repos terminé", {
        body: "C'est reparti, prochaine série !",
        icon: "/icons/icon-192.png",
        silent: !settings.soundEnabled,
      });
    }
  } catch {
    /* ignore */
  }
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
    setState({ pausedRemaining: remaining });
  },
  resume() {
    if (state.pausedRemaining == null) return;
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
  if (state.endAt != null && !state.finished) ensureTick();
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
