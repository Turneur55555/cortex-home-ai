import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_AUTH_STORAGE_KEY } from "@/config/supabase-project";
import { logAuthEvent, summarizeSession } from "@/lib/authDiagnostics";
import { getIsOnline } from "@/lib/offline/networkStatus";
import {
  readStoredAuthSession,
  resolveSessionWithOfflineFallback,
  type OfflineFallbackResult,
} from "@/lib/offlineAuthSession";

const RESTORE_EVENTS = new Set<AuthChangeEvent>([
  "INITIAL_SESSION",
  "SIGNED_IN",
  "TOKEN_REFRESHED",
]);

/**
 * Applique la règle MAJ-07 (cf. `lib/offlineAuthSession.ts`) à un résultat
 * Supabase, en journalisant la décision prise. Ne consulte le stockage que
 * lorsque Supabase n'a rendu aucune session.
 */
export function applyOfflineFallback(
  source: string,
  mode: string,
  session: Session | null,
  error?: unknown,
): OfflineFallbackResult {
  const result = resolveSessionWithOfflineFallback({
    session,
    error,
    isOnline: getIsOnline(),
    storedSession: session ? null : readStoredAuthSession(),
  });
  if (result.degraded) {
    logAuthEvent("session:offline-fallback", {
      source,
      mode,
      reason: result.reason,
      session: summarizeSession(result.session),
    });
  }
  return result;
}

/**
 * Marqueur interne : `getSession()` n'a pas répondu dans le délai imparti.
 * Ce n'est PAS une erreur d'authentification — juste une absence de réponse.
 */
const NO_ANSWER = Symbol("auth:no-answer");

/**
 * Attend `getSession()` au plus `waitMs`. Hors ligne avec un token expiré,
 * `getSession()` déclenche `_callRefreshToken` → `_refreshAccessToken`, qui
 * réessaie en backoff exponentiel TANT QUE le prochain essai tient dans
 * `AUTO_REFRESH_TICK_DURATION_MS` (30 s, cf. auth-js) : l'appel peut donc
 * bloquer ~30 s, et le verrou d'auth sérialise les appels suivants derrière
 * lui. Sans borne, la route protégée reste en `beforeLoad` et l'écran
 * affiche « Chargement… » pendant tout ce temps — constaté en navigateur
 * réel le 31/08/2026. On ne l'ANNULE pas (auth-js poursuit son refresh en
 * arrière-plan et émettra `TOKEN_REFRESHED` s'il aboutit) : on cesse
 * seulement d'attendre.
 */
async function getSessionWithin(waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      supabase.auth.getSession(),
      new Promise<typeof NO_ANSWER>((resolve) => {
        timer = setTimeout(() => resolve(NO_ANSWER), waitMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Récupère la session courante. Hors ligne avec un token expiré,
 * `supabase.auth.getSession()` renvoie `{ session: null, error }` alors que
 * la session reste stockée : on retombe alors sur la session persistée
 * plutôt que de conclure à tort à une absence d'authentification (MAJ-07).
 * Aucun token n'est fabriqué ni prolongé — voir `lib/offlineAuthSession.ts`.
 */
export async function restoreAuthSession(source: string, waitMs = 900): Promise<Session | null> {
  logAuthEvent("session:restore:start", { source });
  try {
    const raced = await getSessionWithin(waitMs);
    if (raced === NO_ANSWER) {
      // Pas de réponse dans le délai. HORS LIGNE UNIQUEMENT, on repart de la
      // session persistée : c'est le cas MAJ-07 (impossible de vérifier), et
      // laisser l'écran bloqué reviendrait à rendre l'app inutilisable hors
      // connexion. EN LIGNE, on continue d'attendre la vraie réponse — aucun
      // changement de comportement, et surtout aucune session acceptée sans
      // que Supabase ait pu se prononcer alors qu'il en a les moyens.
      if (!getIsOnline()) {
        const fallback = applyOfflineFallback(source, "getsession-timeout", null);
        if (fallback.session) return fallback.session;
      }
      logAuthEvent("session:restore:slow", { source, waitMs, online: getIsOnline() });
      const late = await supabase.auth.getSession();
      if (late.data.session) return late.data.session;
      return applyOfflineFallback(source, "getsession-late", null, late.error).session;
    }
    const first = raced;
    if (first.error) {
      logAuthEvent("session:restore:error", { source, error: first.error });
      const fallback = applyOfflineFallback(source, "storage-error", null, first.error);
      if (fallback.session) return fallback.session;
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
    const fallback = applyOfflineFallback(source, "storage-throw", null, error);
    return fallback.session;
  }

  if (typeof window === "undefined") {
    logAuthEvent("session:restore:empty", { source, mode: "server" });
    return null;
  }

  return new Promise<Session | null>((resolve) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function finish(session: Session | null, mode: string, error?: unknown) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      subscription?.unsubscribe();
      // Un `null` peut signifier « pas de session » OU « pas vérifiable »
      // (hors ligne) : c'est ici que la distinction est faite, y compris
      // pour l'événement `INITIAL_SESSION` — qu'auth-js émet avec `null`
      // quand le refresh échoue faute de réseau (`_emitInitialSession`).
      const resolved = session ?? applyOfflineFallback(source, mode, null, error).session;
      logAuthEvent(resolved ? "session:restore:success" : "session:restore:empty", {
        source,
        mode,
        session: summarizeSession(resolved),
      });
      resolve(resolved);
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
        finish(retry.data.session ?? null, "timeout-retry", retry.error);
      } catch (error) {
        logAuthEvent("session:restore:error", { source, error });
        finish(null, "timeout-error", error);
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
      // Échec réseau : la session locale reste valable pour l'usage offline
      // (Supabase ne l'a pas supprimée). Échec authentifié : le stockage a
      // été purgé par Supabase, le repli renverra `null` de lui-même.
      return applyOfflineFallback(source, "refresh-error", null, error).session;
    }
    logAuthEvent("session:refresh:success", {
      source,
      session: summarizeSession(data.session),
    });
    return data.session ?? null;
  } catch (error) {
    logAuthEvent("session:refresh:error", { source, error });
    return applyOfflineFallback(source, "refresh-throw", null, error).session;
  }
}

/**
 * Efface la session persistée sur CET appareil. Réservé au chemin de
 * déconnexion EXPLICITE : hors ligne (ou serveur injoignable),
 * `supabase.auth.signOut()` retourne son erreur réseau AVANT d'appeler
 * `_removeSession()` — la session resterait donc stockée et l'appareil
 * reconnecté au prochain démarrage, alors que l'utilisateur a explicitement
 * demandé à se déconnecter. Jamais appelé sur un simple échec de
 * vérification (c'est précisément ce que MAJ-07 interdit).
 */
export function clearStoredAuthSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    window.sessionStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
  } catch {
    // Un stockage indisponible ne doit jamais faire échouer la déconnexion.
  }
}
