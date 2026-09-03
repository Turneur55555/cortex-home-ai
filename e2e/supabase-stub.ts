import type { BrowserContext, Request, Route } from "@playwright/test";

/**
 * BACKEND SUPABASE SIMULÉ pour les tests e2e exécutables en CI.
 *
 * POURQUOI CE STUB EXISTE
 * -----------------------
 * L'application est épinglée sur UN SEUL projet Supabase, celui de
 * production (`src/config/supabase-project.ts` — les variables
 * `VITE_SUPABASE_*` sont volontairement ignorées si elles pointent ailleurs,
 * et `supabase-project-ref.yml` interdit toute autre référence). Il n'existe
 * donc AUCUN projet de test : les specs historiques (`01-auth`,
 * `02-navigation`, `04-signout`, `auth-persistence`) créent de vrais comptes
 * et de vraies lignes dans la base de PRODUCTION — raison pour laquelle elles
 * ne tournent pas en CI.
 *
 * Ce module permet d'exécuter un parcours e2e en CI SANS jamais toucher la
 * production : toutes les requêtes vers `*.supabase.co` sont interceptées et
 * servies localement, et toute requête sortante non prévue est BLOQUÉE puis
 * enregistrée (`stub.blocked`) pour qu'un test puisse échouer dessus.
 *
 * CE QUE CE STUB NE VALIDE PAS
 * ----------------------------
 * Rien de ce qui se passe côté serveur : RLS, contraintes SQL, triggers,
 * comportement réel de PostgREST/GoTrue. Il valide le CLIENT (routage, auth
 * côté navigateur, moteur offline, file de synchronisation). La couverture
 * serveur reste celle de `rls-tests.yml` et des tests d'intégration
 * env-gated.
 */

export const STUB_USER_ID = "00000000-0000-4000-8000-000000000001";
export const STUB_EMAIL = "offline-e2e@example.test";
export const STUB_PASSWORD = "Test1234!Strong";

export interface StubWrite {
  method: string;
  /** Chemin PostgREST appelé, ex. `/rest/v1/supplements?on_conflict=id&select=*`. */
  path: string;
  /** Table visée, extraite du chemin. */
  table: string;
  /** Corps envoyé (première ligne si le client envoie un tableau). */
  body: Record<string, unknown>;
}

export interface SupabaseStub {
  /** Écritures PostgREST reçues, dans l'ordre. */
  readonly writes: StubWrite[];
  /** Requêtes sortantes NON prévues (bloquées) — doit rester vide. */
  readonly blocked: string[];
  writesTo(table: string): StubWrite[];
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** JWT non signé : seul le client le lit (il ne vérifie pas la signature). */
function fakeAccessToken(expiresAt: number): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  return [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({
      sub: STUB_USER_ID,
      email: STUB_EMAIL,
      role: "authenticated",
      aud: "authenticated",
      iat: issuedAt,
      exp: expiresAt,
    }),
    "stub-signature",
  ].join(".");
}

function stubUser() {
  const now = new Date().toISOString();
  return {
    id: STUB_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: STUB_EMAIL,
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}

function tableFromPath(path: string): string {
  return path.replace(/^\/rest\/v1\//, "").split(/[?/]/)[0] ?? "";
}

/**
 * Branche le stub sur le contexte : tout ce qui sort de `appOrigin` est
 * intercepté. `*.supabase.co` est servi localement, le reste est bloqué.
 */
export async function installSupabaseStub(
  context: BrowserContext,
  appOrigin: string,
): Promise<SupabaseStub> {
  const writes: StubWrite[] = [];
  const blocked: string[] = [];

  const respondJson = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  const handleRest = (route: Route, request: Request, path: string) => {
    // Lectures : base vide. Le moteur offline s'en sert pour la détection de
    // conflit ; une base vide signifie « aucune ligne serveur concurrente ».
    if (request.method() === "GET" || request.method() === "HEAD") {
      return respondJson(route, []);
    }

    let parsed: unknown = {};
    try {
      parsed = JSON.parse(request.postData() ?? "{}");
    } catch {
      parsed = {};
    }
    const row = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown>;
    writes.push({ method: request.method(), path, table: tableFromPath(path), body: row });

    const now = new Date().toISOString();
    return respondJson(
      route,
      [{ user_id: STUB_USER_ID, created_at: now, updated_at: now, ...row }],
      201,
    );
  };

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();

    if (url.startsWith(appOrigin)) return route.continue();

    if (url.includes("supabase.co")) {
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      if (path.startsWith("/auth/v1/token")) {
        return respondJson(route, {
          access_token: fakeAccessToken(expiresAt),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: expiresAt,
          refresh_token: "stub-refresh-token",
          user: stubUser(),
        });
      }
      if (path.startsWith("/auth/v1/user")) return respondJson(route, stubUser());
      if (path.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" });
      if (path.startsWith("/rest/v1/rpc/")) return respondJson(route, []);
      if (path.startsWith("/rest/v1/")) return handleRest(route, request, path);
      return respondJson(route, {});
    }

    // Fail-closed : rien d'autre ne sort. Un appel imprévu est enregistré
    // pour qu'un test l'affiche au lieu de le laisser filer silencieusement.
    blocked.push(`${request.method()} ${url}`);
    return route.abort();
  });

  return {
    writes,
    blocked,
    writesTo: (table: string) => writes.filter((w) => w.table === table),
  };
}
