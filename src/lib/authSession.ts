import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent, summarizeSession } from "@/lib/authDiagnostics";

const RESTORE_EVENTS = new Set<AuthChangeEvent>(["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"]);

export async function restoreAuthSession(source: string, waitMs = 900): Promise<Session | null> {
  logAuthEvent("session:restore:start", { source });
  try {
    const first = await supabase.auth.getSession();
    if (first.error) {
      logAuthEvent("session:restore:error", { source, error: first.error });
      return null;
    }
    if (first.data.session) {
      logAuthEvent("session:restore:success", {
        source,
        mode: "storage",
        session: summarizeSession(first.data.session),
      });
      return first.data.session;
    }
  } catch (error) {
    logAuthEvent("session:restore:error", { source, error });
    return null;
  }

  if (typeof window === "undefined") {
    logAuthEvent("session:restore:empty", { source, mode: "server" });
    return null;
  }

  return new Promise<Session | null>((resolve) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function finish(session: Session | null, mode: string) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      subscription?.unsubscribe();
      logAuthEvent(session ? "session:restore:success" : "session:restore:empty", {
        source,
        mode,
        session: summarizeSession(session),
      });
      resolve(session);
    }

    const result = supabase.auth.onAuthStateChange((event, session) => {
      logAuthEvent("session:restore:event", {
        source,
        event,
        session: summarizeSession(session),
      });
      if (RESTORE_EVENTS.has(event) || session) finish(session ?? null, "auth-event");
    });
    subscription = result.data.subscription;

    timer = setTimeout(async () => {
      try {
        const retry = await supabase.auth.getSession();
        if (retry.error) {
          logAuthEvent("session:restore:error", { source, error: retry.error });
        }
        finish(retry.data.session ?? null, "timeout-retry");
      } catch (error) {
        logAuthEvent("session:restore:error", { source, error });
        finish(null, "timeout-error");
      }
    }, waitMs);
  });
}

export async function refreshAuthSession(source: string): Promise<Session | null> {
  logAuthEvent("session:refresh:start", { source });
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      logAuthEvent("session:refresh:error", { source, error });
      return null;
    }
    logAuthEvent("session:refresh:success", {
      source,
      session: summarizeSession(data.session),
    });
    return data.session ?? null;
  } catch (error) {
    logAuthEvent("session:refresh:error", { source, error });
    return null;
  }
}