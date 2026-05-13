import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    // Listener FIRST (avoid missing events). Supabase fires INITIAL_SESSION
    // with a server-validated session shortly after subscribing, so we don't
    // need a separate getSession() call (which only reads localStorage).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    // Server-verified hydration: getUser() makes a network call and validates
    // the JWT. If validation fails (tampered/expired/revoked), clear session.
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (error || !data.user) {
        setSession(null);
        setLoading(false);
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      setSession(sess.session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      sessionStorage.removeItem("icortex.daily_quote.v1");
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
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
