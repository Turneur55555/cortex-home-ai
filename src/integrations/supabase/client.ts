import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const EXPECTED_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'bcwfvpwzxlmkxobvbtzp';

// Purge toute session stockée qui appartient à une autre instance Supabase.
// Empêche l'ancien token irbeaqabrrbbpstcvtsw de survivre après migration.
function purgeStaleSession() {
  if (typeof window === 'undefined') return;
  const storageKey = `sb-${EXPECTED_PROJECT_ID}-auth-token`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    // Conserver uniquement les clés du projet courant
    if (key.startsWith('sb-') && key.endsWith('-auth-token') && key !== storageKey) {
      localStorage.removeItem(key);
      console.info('[Supabase] session stale supprimée :', key);
    }
  }
  // Nettoyer aussi sessionStorage
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    if (key.startsWith('sb-') && key.endsWith('-auth-token') && key !== storageKey) {
      sessionStorage.removeItem(key);
    }
  }
}

function createSupabaseClient() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Connect Supabase in Lovable Cloud.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  purgeStaleSession();

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
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

