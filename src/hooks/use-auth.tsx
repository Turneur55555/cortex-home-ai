import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { installAuthDiagnostics, logAuthEvent, summarizeSession } from "@/lib/authDiagnostics";
import { refreshAuthSession, restoreAuthSession } from "@/lib/authSession";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    installAuthDiagnostics();
    let mounted = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    function scheduleRefresh(currentSession: Session | null) {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (!currentSession?.expires_at) return;
      const expiresInMs = currentSession.expires_at * 1000 - Date.now();
      const refreshInMs = Math.max(30_000, expiresInMs - 5 * 60_000);
      refreshTimer = setTimeout(() => {
        refreshAuthSession("AuthProvider:scheduled-refresh").catch(() => undefined);
      }, refreshInMs);
      logAuthEvent("session:refresh:scheduled", {
        refreshInMs,
        session: summarizeSession(currentSession),
      });
    }

    restoreAuthSession("AuthProvider:mount").then((restored) => {
      if (!mounted) return;
      setSession(restored);
      setLoading(false);
      scheduleRefresh(restored);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      logAuthEvent(`auth:${event}`, { session: summarizeSession(newSession) });
      if (!mounted) return;
      setSession(newSession);
      setLoading(false);
      scheduleRefresh(newSession);
    });

    return () => {
      mounted = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      sessionStorage.removeItem("icortex.daily_quote.v1");
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
    // Sans ça, le cache react-query (profil, séances, nutrition...) d'un compte
    // reste visible pour le compte suivant qui se connecte dans le même onglet.
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
