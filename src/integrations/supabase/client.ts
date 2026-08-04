import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import {
  SUPABASE_AUTH_STORAGE_KEY,
  SUPABASE_PROJECT_REF,
  SUPABASE_PUBLISHABLE_KEY as CANONICAL_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL as CANONICAL_SUPABASE_URL,
} from "@/config/supabase-project";

const EXPECTED_PROJECT_ID = SUPABASE_PROJECT_REF;

const persistentStorage = {
  getItem(key: string) {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
  removeItem(key: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

// Purge toute session stockée qui appartient à une autre instance Supabase.
// Empêche l'ancien token irbeaqabrrbbpstcvtsw de survivre après migration.
function purgeStaleSession() {
  if (typeof window === "undefined") return;
  const storageKey = SUPABASE_AUTH_STORAGE_KEY;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    // Conserver uniquement les clés du projet courant
    if (key.startsWith("sb-") && key.endsWith("-auth-token") && key !== storageKey) {
      localStorage.removeItem(key);
    }
  }
  // Nettoyer aussi sessionStorage
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    if (key.startsWith("sb-") && key.endsWith("-auth-token") && key !== storageKey) {
      sessionStorage.removeItem(key);
    }
  }
}

// SOURCE DE VÉRITÉ UNIQUE (décision du 31/07/2026) : le projet Supabase
// autorisé est bcwfvpwxzlmkxobvbtzp (voir src/config/supabase-project.ts pour
// le détail et la procédure de suppression). Les variables VITE_SUPABASE_*
// injectées par l'environnement (Lovable Cloud pointe vers une autre instance)
// sont IGNORÉES si elles ne correspondent pas à ce projet, afin que preview,
// publication et CI parlent tous à la même base.

function createSupabaseClient() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

  const envMatchesCanonicalProject = !!envUrl && envUrl.includes(EXPECTED_PROJECT_ID);

  if (envUrl && !envMatchesCanonicalProject && typeof console !== "undefined") {
    console.warn(
      `[supabase] VITE_SUPABASE_URL pointe vers une autre instance (${envUrl}) — ignorée au profit de ${CANONICAL_SUPABASE_URL}.`,
    );
  }

  const SUPABASE_URL = envMatchesCanonicalProject ? envUrl! : CANONICAL_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = envMatchesCanonicalProject
    ? envKey || CANONICAL_SUPABASE_PUBLISHABLE_KEY
    : CANONICAL_SUPABASE_PUBLISHABLE_KEY;

  purgeStaleSession();

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? persistentStorage : undefined,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
