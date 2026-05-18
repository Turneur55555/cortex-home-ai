import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── support ID ─────────────────────────────────────────────────────────────

function generateSupportId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SUP-${ts}-${rand}`;
}

// ─── types ───────────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error" | "critical";

type LogPayload = {
  level?: LogLevel;
  message: string;
  stack?: string | null;
  source?: string | null;
  line?: number | null;
  col?: number | null;
  context?: Record<string, unknown>;
};

// ─── noise filter ────────────────────────────────────────────────────────────

// Patterns that represent framework/browser noise, not real application errors.
// These are never sent to the DB and never trigger a toast.
const NOISE_PATTERNS: RegExp[] = [
  /^Warning:/i,
  /React does not recognize/i,
  /hydrat/i,                          // hydration mismatch warnings
  /source map/i,
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
  /Each child in a list should have a unique/i,
  /Failed prop type/i,
  /componentWillMount/i,
  /componentWillReceiveProps/i,
  /findDOMNode/i,
];

function isNoise(message: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(message));
}

// ─── deduplication ───────────────────────────────────────────────────────────

// Key → last timestamp. 30 s window prevents duplicate DB rows from bursts.
const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;

function isDuplicate(level: LogLevel, message: string, source?: string | null, line?: number | null): boolean {
  const key = `${level}|${message}|${source ?? ""}|${line ?? ""}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  recent.set(key, now);
  return false;
}

// ─── level gate ──────────────────────────────────────────────────────────────

// In development skip writing "info" and "warn" to the DB — they are
// extremely noisy and rarely actionable during local iteration.
// In production every level is persisted.
function shouldPersist(level: LogLevel): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    return level === "error" || level === "critical";
  }
  return true;
}

// ─── core logger ─────────────────────────────────────────────────────────────

export async function logError(
  payload: LogPayload,
  opts?: { silent?: boolean },
): Promise<string | null> {
  try {
    const level = payload.level ?? "error";
    const message = payload.message ?? "Unknown error";

    if (isNoise(message)) return null;
    if (isDuplicate(level, message, payload.source, payload.line)) return null;

    const support_id = generateSupportId();

    if (shouldPersist(level)) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null; // Anonymous logging disabled (RLS requires auth)

      const row = {
        support_id,
        user_id: user?.id ?? null,
        level,
        message: message.slice(0, 4000),
        stack: payload.stack?.slice(0, 8000) ?? null,
        source: payload.source ?? null,
        line: payload.line ?? null,
        col: payload.col ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
        route: typeof window !== "undefined" ? window.location.pathname : null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        context: (payload.context ?? null) as never,
      };

      const { error } = await supabase.from("error_logs").insert(row);
      if (error) return null; // avoid infinite loop
    }

    if (!opts?.silent && typeof window !== "undefined") {
      toast.error("Une erreur s'est produite", {
        description: `ID de support : ${support_id}`,
        duration: 8000,
        action: {
          label: "Copier",
          onClick: () => navigator.clipboard?.writeText(support_id),
        },
      });
    }

    return support_id;
  } catch {
    return null;
  }
}

// ─── global listeners ────────────────────────────────────────────────────────

let installed = false;

export function installErrorLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = event.error as Error | undefined;
    void logError({
      level: "error",
      message: err?.message || event.message || "Window error",
      stack: err?.stack ?? null,
      source: event.filename ?? null,
      line: event.lineno ?? null,
      col: event.colno ?? null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const err =
      reason instanceof Error
        ? reason
        : new Error(typeof reason === "string" ? reason : JSON.stringify(reason));
    void logError({
      level: "error",
      message: `Unhandled rejection: ${err.message}`,
      stack: err.stack ?? null,
    });
  });

  // Intercept console.error to silently journal real errors.
  // Noise is filtered before touching the DB.
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalError(...args);
    try {
      const first = args[0];
      const err = args.find((a) => a instanceof Error) as Error | undefined;
      const message =
        err?.message ??
        (typeof first === "string"
          ? first
          : args
              .map((a) => {
                try {
                  return typeof a === "string" ? a : JSON.stringify(a);
                } catch {
                  return String(a);
                }
              })
              .join(" "));
      void logError(
        { level: "error", message: message || "console.error", stack: err?.stack ?? null },
        { silent: true },
      );
    } catch {
      /* noop */
    }
  };
}
