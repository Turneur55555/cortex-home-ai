/**
 * NORMALISATION DES VARIABLES SUPABASE CÔTÉ SERVEUR.
 *
 * Complément de `src/config/supabase-project.ts` (source de vérité unique :
 * `bcwfvpwxzlmkxobvbtzp`).
 *
 * `client.ts` neutralise déjà les variables `VITE_SUPABASE_*` injectées par
 * Lovable Cloud pour le bundle navigateur. Mais les modules serveur générés
 * (`client.server.ts`, `auth-middleware.ts`, non éditables) lisent
 * `process.env.SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` au moment de l'appel :
 * en preview et en publication Lovable, ces valeurs pointent vers l'instance
 * Cloud auto-provisionnée (`irbeaqabrrbbpstcvtsw`).
 *
 * Ce module réécrit ces variables au démarrage du worker SSR, avant tout accès,
 * pour que TOUTES les exécutions (preview, publication, server functions)
 * résolvent vers le projet officiel. Il est importé en premier dans
 * `src/server.ts`.
 *
 * Cas particulier de `SUPABASE_SERVICE_ROLE_KEY` : la clé injectée appartient à
 * l'autre projet et ne peut pas être « corrigée ». On la supprime plutôt que de
 * laisser une opération privilégiée s'exécuter sur la mauvaise base — un appel
 * admin échouera bruyamment au lieu d'écrire au mauvais endroit.
 */
import { SUPABASE_PROJECT_REF, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-project";

function belongsToCanonicalProject(value: string | undefined): boolean {
  return !!value && value.includes(SUPABASE_PROJECT_REF);
}

export function enforceCanonicalSupabaseEnv(): void {
  const env = typeof process !== "undefined" ? process.env : undefined;
  if (!env) return;

  if (!belongsToCanonicalProject(env.SUPABASE_URL)) {
    if (env.SUPABASE_URL) {
      console.warn(
        `[supabase] SUPABASE_URL (${env.SUPABASE_URL}) pointe vers une autre instance — remplacée par ${SUPABASE_URL}.`,
      );
    }
    env.SUPABASE_URL = SUPABASE_URL;
  }

  if (env.SUPABASE_PROJECT_ID !== SUPABASE_PROJECT_REF) {
    env.SUPABASE_PROJECT_ID = SUPABASE_PROJECT_REF;
  }

  // La clé publiable injectée appartient à l'autre projet : on la remplace par
  // la clé anon publique du projet officiel (non secrète, sécurité via RLS).
  const publishable = env.SUPABASE_PUBLISHABLE_KEY;
  if (!publishable || publishable !== SUPABASE_PUBLISHABLE_KEY) {
    env.SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;
  }
  if (env.SUPABASE_ANON_KEY && env.SUPABASE_ANON_KEY !== SUPABASE_PUBLISHABLE_KEY) {
    env.SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;
  }

  // Aucune clé service_role du projet officiel n'est disponible ici : celle
  // injectée appartient à l'instance interdite, on la retire.
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[supabase] SUPABASE_SERVICE_ROLE_KEY appartient à une instance non autorisée — supprimée.",
    );
    delete env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

enforceCanonicalSupabaseEnv();
