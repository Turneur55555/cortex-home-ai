import type { Session } from "@supabase/supabase-js";

const STORAGE_KEY = "icortex.auth.diagnostics.v1";
const MAX_ENTRIES = 200;

export interface AuthDiagnosticEntry {
  ts: string;
  event: string;
  path?: string;
  online?: boolean;
  visibility?: DocumentVisibilityState;
  detail?: unknown;
}

type AuthDiagnosticsApi = {
  getLog: () => AuthDiagnosticEntry[];
  clear: () => void;
  snapshot: () => ReturnType<typeof getAuthStorageSnapshot>;
};

declare global {
  interface Window {
    __ICORTEX_AUTH_DIAGNOSTICS__?: AuthDiagnosticsApi;
  }
}

let installed = false;

function isBrowser() {
  return typeof window !== "undefined";
}

function storageAvailable(storage: Storage | undefined) {
  if (!storage) return false;
  try {
    const key = "icortex.auth.storage-test";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function readEntries(): AuthDiagnosticEntry[] {
  if (!isBrowser() || !storageAvailable(window.localStorage)) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthDiagnosticEntry[]) : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: AuthDiagnosticEntry[]) {
  if (!isBrowser() || !storageAvailable(window.localStorage)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Diagnostics must never affect authentication.
  }
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[max-depth]";
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.toLowerCase();
      if (normalized.includes("token") || normalized.includes("password") || normalized.includes("secret")) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitize(nested, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

export function summarizeSession(session: Session | null | undefined) {
  if (!session) return { hasSession: false };
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : null;
  return {
    hasSession: true,
    userId: session.user?.id ?? null,
    provider: session.user?.app_metadata?.provider ?? null,
    expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
    expiresInSec: expiresAtMs ? Math.round((expiresAtMs - Date.now()) / 1000) : null,
  };
}

export function getAuthStorageSnapshot() {
  if (!isBrowser()) {
    return { browser: false, localStorageAvailable: false, sessionStorageAvailable: false, localAuthKeyCount: 0 };
  }
  const localStorageAvailable = storageAvailable(window.localStorage);
  const sessionStorageAvailable = storageAvailable(window.sessionStorage);
  let localAuthKeyCount = 0;
  if (localStorageAvailable) {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i) ?? "";
      if (key.startsWith("sb-") || key.includes("auth")) localAuthKeyCount += 1;
    }
  }
  return { browser: true, localStorageAvailable, sessionStorageAvailable, localAuthKeyCount };
}

export function logAuthEvent(event: string, detail?: unknown) {
  const entry: AuthDiagnosticEntry = {
    ts: new Date().toISOString(),
    event,
    path: isBrowser() ? window.location.pathname : undefined,
    online: isBrowser() ? navigator.onLine : undefined,
    visibility: isBrowser() ? document.visibilityState : undefined,
    detail: sanitize(detail),
  };
  writeEntries([...readEntries(), entry]);

  if (isBrowser()) {
    const level = event.includes("error") || event.includes("failed") ? "warn" : "info";
    console[level]("[Auth]", entry.event, entry.detail ?? "");
  }
}

export function getAuthDiagnosticsLog() {
  return readEntries();
}

export function clearAuthDiagnosticsLog() {
  if (!isBrowser() || !storageAvailable(window.localStorage)) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function installAuthDiagnostics() {
  if (!isBrowser() || installed) return;
  installed = true;
  window.__ICORTEX_AUTH_DIAGNOSTICS__ = {
    getLog: getAuthDiagnosticsLog,
    clear: clearAuthDiagnosticsLog,
    snapshot: getAuthStorageSnapshot,
  };
  logAuthEvent("diagnostics:installed", getAuthStorageSnapshot());
  window.addEventListener("online", () => logAuthEvent("network:online"));
  window.addEventListener("offline", () => logAuthEvent("network:offline"));
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith("sb-") || event.key?.includes("auth")) {
      logAuthEvent("storage:auth-key-changed", { keyType: event.key.startsWith("sb-") ? "backend-auth" : "app-auth" });
    }
  });
}