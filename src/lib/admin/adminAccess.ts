// Garde admin partagé — CHANTIER 5 (MIN-09). Source unique de l'email
// autorisé côté client, utilisée à la fois par le `beforeLoad` des routes
// d'administration (`/admin/exercises`, `/rls-status`) et par le composant
// de repli affiché en cas d'accès direct sans passer par le routing.
//
// Limite assumée et documentée (voir aussi
// `supabase/functions/_shared/adminAuth.ts` et
// docs/architecture/exercises-dataset-integration.md §14) : Cortex n'a
// aujourd'hui aucun système de rôle. Ce garde-fou client n'est qu'une
// commodité UX (éviter qu'un compte non autorisé charge/affiche la page) —
// il NE remplace PAS le contrôle serveur : toute donnée réellement
// sensible passe par un mécanisme qui revérifie l'identité (edge function
// `admin-exercise-actions`, JWT Supabase Auth), jamais par ce seul email
// côté navigateur.
const ADMIN_EMAIL = "Turneur555@gmail.com";

export function isAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
