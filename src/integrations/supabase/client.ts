import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const EXPECTED_PROJECT_ID = "bcwfvpwxzlmkxobvbtzp";

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
  const storageKey = `sb-${EXPECTED_PROJECT_ID}-auth-token`;
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

function createSupabaseClient() {
  const SUPABASE_URL = "https://bcwfvpwxzlmkxobvbtzp.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjd2Z2cHd4emxta3hvYnZidHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjU5NzgsImV4cCI6MjA5NDUwMTk3OH0.wYsoYUMaYDuEv91TbpFBz3fAGTAXO6eh3vHuWrLbsek";

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Connect Supabase in Lovable Cloud.`;
    throw new Error(message);
  }

  purgeStaleSession();

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? persistentStorage : undefined,
      storageKey: `sb-${EXPECTED_PROJECT_ID}-auth-token`,
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

