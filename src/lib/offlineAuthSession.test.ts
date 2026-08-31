// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { SUPABASE_AUTH_STORAGE_KEY } from "@/config/supabase-project";
import {
  OFFLINE_SESSION_MAX_AGE_MS,
  isUnverifiableAuthFailure,
  readStoredAuthSession,
  resolveSessionWithOfflineFallback,
} from "@/lib/offlineAuthSession";

/**
 * CHANTIER 3 / MAJ-07 — une session locale connue ne doit jamais être
 * confondue avec une absence d'authentification simplement parce que le
 * réseau manque, ET une session réellement invalide doit continuer d'envoyer
 * vers /login.
 *
 * Les scénarios sont joués contre le VRAI `restoreAuthSession` /
 * `refreshAuthSession` avec un client Supabase simulé qui reproduit
 * fidèlement le comportement observé dans auth-js 2.105.4 :
 * - hors ligne + token expiré → `getSession()` renvoie
 *   `{ session: null, error: AuthRetryableFetchError }` SANS vider le
 *   stockage (`_callRefreshToken` ne supprime que sur erreur non retryable) ;
 * - refresh token invalide → `AuthApiError` 400 ET stockage vidé.
 */

// ---------------------------------------------------------------------------
// Client Supabase simulé
// ---------------------------------------------------------------------------

class FakeAuthRetryableFetchError extends Error {
  name = "AuthRetryableFetchError";
  constructor() {
    super("Failed to fetch");
  }
}

class FakeAuthApiError extends Error {
  name = "AuthApiError";
  status = 400;
  constructor() {
    super("Invalid Refresh Token: Refresh Token Not Found");
  }
}

const auth = {
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => undefined } } })),
};

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

const { refreshAuthSession, restoreAuthSession, clearStoredAuthSession } =
  await import("@/lib/authSession");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    access_token: "jwt.access.token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: { id: "user-1", email: "nathan@example.com" },
    ...overrides,
  } as unknown as Session;
}

function storeSession(session: Session | null) {
  if (session === null) window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
  else window.localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify(session));
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value: online, configurable: true });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  auth.getSession.mockReset();
  auth.refreshSession.mockReset();
  setOnline(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Décision pure
// ---------------------------------------------------------------------------

describe("MAJ-07 — décision « pas vérifiable » vs « plus authentifié »", () => {
  const stored = makeSession();

  it("une erreur réseau signifie « pas vérifiable », un verdict serveur non", () => {
    expect(isUnverifiableAuthFailure(new FakeAuthRetryableFetchError())).toBe(true);
    expect(isUnverifiableAuthFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isUnverifiableAuthFailure(new FakeAuthApiError())).toBe(false);
    expect(isUnverifiableAuthFailure(null)).toBe(false);
  });

  it("hors ligne + session stockée → on repart de la session stockée (mode dégradé)", () => {
    const r = resolveSessionWithOfflineFallback({
      session: null,
      error: new FakeAuthRetryableFetchError(),
      isOnline: false,
      storedSession: stored,
    });
    expect(r.session).toBe(stored);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe("offline-fallback");
  });

  it("en ligne + verdict serveur → aucune session, aucun repli", () => {
    const r = resolveSessionWithOfflineFallback({
      session: null,
      error: new FakeAuthApiError(),
      isOnline: true,
      // Supabase a déjà purgé le stockage sur une erreur non retryable.
      storedSession: null,
    });
    expect(r.session).toBeNull();
    expect(r.reason).toBe("verified-invalid");
  });

  it("hors ligne SANS session stockée → aucune session inventée", () => {
    const r = resolveSessionWithOfflineFallback({
      session: null,
      error: new FakeAuthRetryableFetchError(),
      isOnline: false,
      storedSession: null,
    });
    expect(r.session).toBeNull();
    expect(r.degraded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lecture du stockage
// ---------------------------------------------------------------------------

describe("MAJ-07 — lecture bornée de la session persistée", () => {
  it("relit la session laissée par Supabase", () => {
    const session = makeSession();
    storeSession(session);
    expect(readStoredAuthSession()?.user.id).toBe("user-1");
  });

  it("refuse une session sans refresh token (aucune reprise possible)", () => {
    storeSession(makeSession({ refresh_token: "" }));
    expect(readStoredAuthSession()).toBeNull();
  });

  it("refuse un contenu illisible ou absent", () => {
    expect(readStoredAuthSession()).toBeNull();
    window.localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, "{pas du json");
    expect(readStoredAuthSession()).toBeNull();
  });

  it("n'est JAMAIS valable indéfiniment : au-delà de la borne, plus de repli", () => {
    const expiredLongAgo = Math.floor((Date.now() - OFFLINE_SESSION_MAX_AGE_MS - 60_000) / 1000);
    storeSession(makeSession({ expires_at: expiredLongAgo }));
    expect(readStoredAuthSession()).toBeNull();

    // Juste en deçà de la borne : encore acceptée pour l'usage local.
    const expiredRecently = Math.floor((Date.now() - OFFLINE_SESSION_MAX_AGE_MS + 60_000) / 1000);
    storeSession(makeSession({ expires_at: expiredRecently }));
    expect(readStoredAuthSession()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scénarios de bout en bout
// ---------------------------------------------------------------------------

describe("MAJ-07 — restoreAuthSession / refreshAuthSession", () => {
  it("TEST 5 — session connue + réseau disponible : comportement inchangé", async () => {
    const session = makeSession();
    storeSession(session);
    auth.getSession.mockResolvedValue({ data: { session }, error: null });

    await expect(restoreAuthSession("test:online")).resolves.toEqual(session);
  });

  it("TEST 6 — session connue + hors ligne + refresh impossible : PAS de /login", async () => {
    const session = makeSession({ expires_at: Math.floor(Date.now() / 1000) - 60 });
    // Supabase CONSERVE la session en stockage (erreur retryable)…
    storeSession(session);
    // …mais renvoie `null` parce qu'il n'a pas pu la rafraîchir.
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new FakeAuthRetryableFetchError(),
    });
    setOnline(false);

    const restored = await restoreAuthSession("test:offline-expired");

    // Avant le chantier 3 : `null` → `redirect({ to: "/login" })`.
    expect(restored).not.toBeNull();
    expect(restored?.user.id).toBe("user-1");
    // Aucun token fabriqué ni prolongé : c'est bien le token stocké tel quel.
    expect(restored?.access_token).toBe(session.access_token);
    expect(restored?.expires_at).toBe(session.expires_at);
  });

  it("TEST 7 — aucune session connue : /login reste déclenché", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    setOnline(false);

    await expect(restoreAuthSession("test:no-session", 10)).resolves.toBeNull();
  });

  it("TEST 8 — session réellement invalide : /login reste déclenché", async () => {
    // Supabase a purgé le stockage lui-même (erreur non retryable).
    storeSession(null);
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new FakeAuthApiError(),
    });

    await expect(restoreAuthSession("test:invalid")).resolves.toBeNull();
  });

  it("TEST 8bis — verdict serveur : même une session encore stockée ne sauve pas si on est en ligne", async () => {
    storeSession(makeSession());
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new FakeAuthApiError(),
    });
    setOnline(true);

    await expect(restoreAuthSession("test:invalid-online")).resolves.toBeNull();
  });

  it("TEST 9 — retour réseau après expiration : le refresh normal reprend", async () => {
    const refreshed = makeSession({ access_token: "jwt.new.token" });
    auth.refreshSession.mockResolvedValue({ data: { session: refreshed }, error: null });

    await expect(refreshAuthSession("test:network-back")).resolves.toEqual(refreshed);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("TEST 10 — erreur réseau pendant le refresh : l'utilisateur reste authentifié localement", async () => {
    const session = makeSession();
    storeSession(session);
    auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new FakeAuthRetryableFetchError(),
    });
    setOnline(false);

    const result = await refreshAuthSession("test:refresh-offline");
    expect(result?.user.id).toBe("user-1");
  });

  it("TEST 10bis — refresh rejeté par le serveur (en ligne) : plus de session", async () => {
    storeSession(null);
    auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new FakeAuthApiError(),
    });

    await expect(refreshAuthSession("test:refresh-invalid")).resolves.toBeNull();
  });

  it("TEST 11 — déconnexion explicite : la session locale est réellement effacée", async () => {
    storeSession(makeSession());
    expect(readStoredAuthSession()).not.toBeNull();

    // Ce que fait `use-auth.tsx` quand `signOut()` échoue faute de réseau.
    clearStoredAuthSession();

    expect(readStoredAuthSession()).toBeNull();
    // …et aucun repli ne peut ressusciter la session hors ligne.
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new FakeAuthRetryableFetchError(),
    });
    setOnline(false);
    await expect(restoreAuthSession("test:after-signout")).resolves.toBeNull();
  });
});
