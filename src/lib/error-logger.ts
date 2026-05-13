import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Génère un ID de support court, lisible et partageable
function generateSupportId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SUP-${ts}-${rand}`;
}

type LogPayload = {
  level?: "error" | "warn" | "info";
  message: string;
  stack?: string | null;
  source?: string | null;
  line?: number | null;
  col?: number | null;
  context?: Record<string, unknown>;
};

const recent = new Map<string, number>();
const DEDUPE_MS = 5000;

export async function logError(
  payload: LogPayload,
  opts?: { silent?: boolean },
): Promise<string | null> {
  try {
    const key = `${payload.level ?? "error"}|${payload.message}|${payload.source ?? ""}|${payload.line ?? ""}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUPE_MS) return null;
    recent.set(key, now);

    const support_id = generateSupportId();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const row = {
      support_id,
      user_id: user?.id ?? null,
      level: payload.level ?? "error",
      message: (payload.message ?? "Unknown error").slice(0, 4000),
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
    if (error) {
      // évite boucle infinie : pas de re-log
      return null;
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

  // Patch console.error pour journaliser silencieusement
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
        {
          level: "error",
          message: message || "console.error",
          stack: err?.stack ?? null,
          context: { args_count: args.length },
        },
        { silent: true },
      );
    } catch {
      /* noop */
    }
  };
}
