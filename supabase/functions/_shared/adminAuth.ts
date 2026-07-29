// Authentification "admin" pour les actions interactives de la bibliothèque
// d'exercices (fusion manuelle, archivage, restauration, suppression — voir
// docs/architecture/exercises-dataset-integration.md §14). Distincte du
// pattern CRON_SECRET/service_role utilisé par les jobs batch
// (import-exercises-dataset, restore-exercises-dataset-import) : ces actions
// sont déclenchées depuis l'interface d'administration par un utilisateur
// Cortex authentifié, pas par un appel serveur-à-serveur.
//
// Limite assumée et documentée (voir aussi exercise-central-architecture.md
// §12 et exercises-dataset-integration.md §12/§4/§15) : Cortex n'a aujourd'hui
// aucun système de rôle. Le gate ci-dessous vérifie que l'utilisateur
// authentifié (JWT Supabase Auth standard, pas un secret partagé) a l'email
// autorisé — suffisant pour une application à propriétaire unique, à
// remplacer par un vrai système de rôles si Cortex accueille un jour
// plusieurs comptes avec des droits différents.
//
// L'email est en dur par défaut (DEFAULT_ADMIN_EMAIL) plutôt que lu
// uniquement depuis un secret Supabase : l'objectif explicite de Nathan
// (2026-07-31) est un merge sur `main` sans AUCUNE étape manuelle post-merge
// — poser un secret `ADMIN_EMAIL` sur le dashboard Supabase en serait une.
// Le secret `ADMIN_EMAIL`, s'il est posé plus tard, reste prioritaire (permet
// de changer l'email sans redéployer de code).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_ADMIN_EMAIL = "Turneur555@gmail.com";

export interface AdminAuthResult {
  ok: true;
  userId: string;
  email: string;
}

export interface AdminAuthFailure {
  ok: false;
  status: number;
  error: string;
}

/**
 * Vérifie que la requête porte un JWT Supabase Auth valide dont l'email
 * correspond à `ADMIN_EMAIL`. Ne fait AUCUNE écriture — l'appelant reste
 * responsable d'utiliser ensuite un client service_role pour les tables
 * réservées (RLS `service_role` uniquement, voir migration
 * 20260731120000_exercise_library_admin.sql).
 */
export async function requireAdminUser(req: Request): Promise<AdminAuthResult | AdminAuthFailure> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  // SUPABASE_URL et SUPABASE_ANON_KEY sont injectées automatiquement par la
  // plateforme pour toute edge function déployée — aucun secret à poser à la
  // main pour ces deux-là (voir aussi ADMIN_EMAIL ci-dessus).
  const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? DEFAULT_ADMIN_EMAIL;

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return { ok: false, status: 500, error: "Service d'administration indisponible." };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Authentification requise." };
  }

  const supa: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supa.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 401, error: "Session invalide — reconnecte-toi." };
  }
  if ((data.user.email ?? "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { ok: false, status: 403, error: "Accès réservé à l'administration Cortex." };
  }

  return { ok: true, userId: data.user.id, email: data.user.email! };
}
