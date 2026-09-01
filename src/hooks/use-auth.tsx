import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { installAuthDiagnostics, logAuthEvent, summarizeSession } from "@/lib/authDiagnostics";
import {
  applyOfflineFallback,
  clearStoredAuthSession,
  refreshAuthSession,
  restoreAuthSession,
} from "@/lib/authSession";
import { purgeUserOfflineData } from "@/lib/offline/db";
import { markWorkoutsServerRefreshStale } from "@/lib/offline/workoutsRefreshWindow";
import { subscribeToNetworkStatus } from "@/lib/offline/networkStatus";

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
  // Miroir de la session pour les callbacks abonnés une seule fois au montage
  // (retour réseau) — sans lui, ils liraient la session du premier rendu.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

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
      // MAJ-07 — hors ligne avec un token expiré, auth-js émet
      // `INITIAL_SESSION`/`TOKEN_REFRESHED` avec `null` parce que le refresh
      // n'a pas pu aboutir : sans ce garde-fou, l'app effaçait l'utilisateur
      // du contexte (écran vide + redirection /login) alors que la session
      // est TOUJOURS en stockage et que les données locales sont lisibles.
      // `SIGNED_OUT` reste une vraie déconnexion : Supabase a vidé le
      // stockage AVANT de l'émettre (`_removeSession`), donc aucun repli.
      const resolved =
        event === "SIGNED_OUT"
          ? null
          : (newSession ?? applyOfflineFallback("AuthProvider:auth-event", event, null).session);
      setSession(resolved);
      setLoading(false);
      scheduleRefresh(resolved);
    });

    // Retour réseau : on redemande immédiatement un refresh normal plutôt
    // que d'attendre le tick d'auto-refresh de Supabase (30 s). Si la
    // session tournait en mode dégradé (repli hors ligne), c'est ce refresh
    // qui la revalide — ou qui constate qu'elle ne l'est plus.
    const unsubscribeNetwork = subscribeToNetworkStatus((online) => {
      if (!online || !mounted) return;
      // Uniquement quand ça sert : session absente, ou token déjà expiré /
      // sur le point de l'être (typiquement la session reprise en mode
      // dégradé hors ligne). Une session encore fraîche n'a rien à
      // renouveler — inutile de faire tourner le refresh token à chaque
      // micro-coupure réseau.
      const current = sessionRef.current;
      const expiresAtMs = current?.expires_at ? current.expires_at * 1000 : null;
      const needsRefresh =
        !current || expiresAtMs === null || expiresAtMs - Date.now() < 5 * 60_000;
      if (!needsRefresh) return;
      logAuthEvent("session:network-back", { expiresAtMs });
      refreshAuthSession("AuthProvider:network-back")
        .then((refreshed) => {
          if (!mounted || !refreshed) return;
          setSession(refreshed);
          scheduleRefresh(refreshed);
        })
        .catch(() => undefined);
    });

    return () => {
      mounted = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribeNetwork();
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      sessionStorage.removeItem("icortex.daily_quote.v1");
    } catch {
      // ignore
    }
    const outgoingUserId = session?.user?.id ?? null;
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Réseau indisponible / serveur injoignable : `signOut()` renvoie son
      // erreur AVANT d'avoir appelé `_removeSession()`, la session resterait
      // donc stockée et l'appareil reconnecté au prochain démarrage. Une
      // déconnexion EXPLICITE est une décision utilisateur : on efface la
      // session locale nous-mêmes (la révocation serveur, elle, se fera à la
      // prochaine expiration du refresh token).
      logAuthEvent("auth:signout-local-fallback", { error });
      clearStoredAuthSession();
    }
    setSession(null);
    // Sans ça, le cache react-query (profil, séances, nutrition...) d'un compte
    // reste visible pour le compte suivant qui se connecte dans le même onglet.
    queryClient.clear();
    // Idem pour le store offline (IndexedDB) : purge par userId pour ne
    // jamais laisser les données/opérations en attente d'un compte visibles
    // ou synchronisables pour le compte suivant sur le même appareil.
    if (outgoingUserId) {
      purgeUserOfflineData(outgoingUserId).catch(() => undefined);
    }
    // CHANTIER 4 (MAJ-04) : la fenêtre de fraîcheur des lectures serveur de
    // séances est en mémoire, elle survivrait au `queryClient.clear()`. La
    // rouvrir garantit que le compte suivant (ou une reconnexion du même
    // compte dans cet onglet) refait une vraie lecture serveur.
    markWorkoutsServerRefreshStale();
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
