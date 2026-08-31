import type { Session } from "@supabase/supabase-js";
import { SUPABASE_AUTH_STORAGE_KEY } from "@/config/supabase-project";

/**
 * MAJ-07 — distinguer « je ne peux pas VÉRIFIER la session maintenant » de
 * « l'utilisateur n'est plus authentifié ».
 *
 * LE PROBLÈME EXACT (audit 30/08/2026, confirmé dans auth-js 2.105.4)
 * -------------------------------------------------------------------
 * `supabase.auth.getSession()` (`GoTrueClient.__loadSession`) : si le token
 * d'accès stocké est expiré (marge incluse), il appelle `_callRefreshToken`.
 * Hors ligne, cet appel échoue avec une `AuthRetryableFetchError` et
 * `getSession()` renvoie alors `{ data: { session: null }, error }` —
 * ALORS QUE LA SESSION EST TOUJOURS DANS LE STOCKAGE : `_callRefreshToken`
 * ne supprime la session (`_removeSession`) que pour une erreur NON
 * retryable (refresh token réellement invalide). Le `null` renvoyé signifie
 * donc « pas vérifiable », pas « pas de session ».
 *
 * En aval, `restoreAuthSession()` renvoyait `null`, et
 * `routes/_authenticated.tsx` faisait `redirect({ to: "/login" })` : un
 * utilisateur authentifié, hors ligne, dont le token d'accès venait
 * d'expirer, était éjecté vers /login — avec toutes ses données pourtant
 * présentes dans IndexedDB.
 *
 * CE QUE FAIT CE MODULE (ET SURTOUT CE QU'IL NE FAIT PAS)
 * -------------------------------------------------------
 * Il relit la session que SUPABASE LUI-MÊME a laissée dans le stockage, et
 * la renvoie uniquement quand la vérification a échoué pour une raison
 * réseau. Il ne fabrique aucun JWT, ne prolonge aucune expiration, ne
 * contourne aucun contrôle : le token reste tel quel (donc refusé par le
 * serveur s'il est expiré — les lectures offline, elles, viennent
 * d'IndexedDB). C'est le STOCKAGE qui reste l'autorité :
 * - déconnexion explicite → `_removeSession()` vide le stockage → ici `null` ;
 * - refresh token réellement invalide (400/401) → erreur NON retryable →
 *   Supabase vide le stockage → ici `null` → /login, comportement conservé.
 *
 * Et le repli est BORNÉ : au-delà de `OFFLINE_SESSION_MAX_AGE_MS` après
 * l'expiration du token, on refuse de continuer à faire confiance à une
 * session jamais revérifiée (exigence « jamais valide indéfiniment »).
 */

/**
 * Durée maximale pendant laquelle une session non revérifiable (appareil
 * hors ligne) reste acceptée pour l'usage LOCAL, comptée depuis l'expiration
 * de son token d'accès. Au-delà, l'appareil doit repasser par une
 * authentification normale. 30 jours = ordre de grandeur d'un usage hors
 * ligne prolongé (voyage, zone blanche) sans laisser un appareil considéré
 * comme authentifié pour toujours.
 */
export const OFFLINE_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Session minimale exploitable hors ligne. */
function looksLikeUsableSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<Session> & { user?: { id?: unknown } };
  return (
    typeof s.access_token === "string" &&
    s.access_token.length > 0 &&
    // Sans refresh token, aucune reprise normale n'est possible au retour
    // réseau : ce n'est pas une session sur laquelle s'appuyer.
    typeof s.refresh_token === "string" &&
    s.refresh_token.length > 0 &&
    !!s.user &&
    typeof s.user.id === "string"
  );
}

/**
 * Lit la session persistée par Supabase (même clé et même ordre de lecture
 * que le `persistentStorage` de `integrations/supabase/client.ts`).
 * Retourne `null` si rien n'est stocké, si le contenu est illisible, ou si
 * la session est trop ancienne pour être encore utilisée sans vérification.
 */
export function readStoredAuthSession(now: number = Date.now()): Session | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (raw === null) raw = window.sessionStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!looksLikeUsableSession(parsed)) return null;

  const session = parsed as Session;
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : null;
  if (expiresAtMs !== null && now - expiresAtMs > OFFLINE_SESSION_MAX_AGE_MS) {
    return null;
  }
  return session;
}

/**
 * Vrai quand l'échec observé signifie « impossible de vérifier maintenant »
 * (réseau) et NON « session invalide ».
 *
 * - `AuthRetryableFetchError` : nom porté par auth-js pour un échec fetch
 *   ou une 5xx (`isAuthRetryableFetchError`). On teste le nom plutôt que la
 *   classe pour ne pas dépendre d'un export interne du SDK.
 * - `TypeError: Failed to fetch` : coupure réseau brute remontée telle
 *   quelle par le navigateur.
 * - `AuthApiError` (400 invalid_grant...) → FAUX : c'est un verdict serveur,
 *   la session est réellement invalide.
 */
export function isUnverifiableAuthFailure(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: unknown }).name;
  if (name === "AuthRetryableFetchError") return true;
  if (error instanceof TypeError) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /failed to fetch|network|fetch failed/i.test(message);
}

export interface OfflineFallbackInput {
  /** Session renvoyée par Supabase (souvent `null` dans le cas traité ici). */
  session: Session | null;
  /** Erreur éventuelle renvoyée/levée par `getSession()`/`refreshSession()`. */
  error?: unknown;
  /** État réseau observé (`navigator.onLine`). */
  isOnline: boolean;
  /** Session persistée relue par `readStoredAuthSession()`. */
  storedSession: Session | null;
}

export type OfflineFallbackReason =
  | "supabase-session" // Supabase a répondu : rien à faire.
  | "offline-fallback" // Vérification impossible → on repart du stockage.
  | "no-stored-session" // Rien en stockage → vraie absence de session.
  | "verified-invalid"; // Verdict serveur : session réellement invalide.

export interface OfflineFallbackResult {
  session: Session | null;
  reason: OfflineFallbackReason;
  /** Vrai quand la session rendue n'a PAS pu être revérifiée (mode dégradé). */
  degraded: boolean;
}

/**
 * Décide de la session à utiliser à partir de ce que Supabase a répondu.
 * Fonction PURE (aucun accès au SDK ni au stockage) — c'est elle qui porte
 * la distinction MAJ-07 et c'est elle qui est testée exhaustivement.
 */
export function resolveSessionWithOfflineFallback(
  input: OfflineFallbackInput,
): OfflineFallbackResult {
  if (input.session) {
    return { session: input.session, reason: "supabase-session", degraded: false };
  }

  // Supabase n'a pas rendu de session. Deux mondes très différents :
  const cannotVerify = isUnverifiableAuthFailure(input.error) || !input.isOnline;
  if (!cannotVerify) {
    // En ligne + réponse claire : soit il n'y a jamais eu de session, soit
    // le serveur a tranché (refresh token invalide → Supabase a déjà purgé
    // le stockage). Dans les deux cas, /login est le bon comportement.
    return {
      session: null,
      reason: input.error ? "verified-invalid" : "no-stored-session",
      degraded: false,
    };
  }

  // Impossible de vérifier. Si Supabase a CONSERVÉ la session en stockage,
  // c'est qu'il ne la considère pas comme invalide : on continue en local.
  if (input.storedSession) {
    return { session: input.storedSession, reason: "offline-fallback", degraded: true };
  }
  return { session: null, reason: "no-stored-session", degraded: false };
}
