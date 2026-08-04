/**
 * SOURCE DE VÉRITÉ UNIQUE — configuration Supabase officielle du projet.
 *
 * POURQUOI CETTE CONFIGURATION EST FORCÉE :
 * L'intégration Lovable Cloud injecte automatiquement, à chaque build, des
 * variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` qui pointent
 * vers un AUTRE projet Supabase (instance Cloud auto-provisionnée). Ce fichier
 * `.env` est auto-généré et gitignoré : impossible de le corriger durablement.
 *
 * Conséquence : preview, publication et CI parleraient à des bases différentes,
 * ce qui a déjà provoqué des diagnostics faux (tables/RPC « manquantes » alors
 * qu'elles existent en réalité sur la base officielle).
 *
 * Décision produit (31/07/2026) : la SEULE base autorisée est
 * `bcwfvpwxzlmkxobvbtzp`. Les valeurs ci-dessous sont donc épinglées
 * volontairement, et les variables d'environnement sont ignorées quand elles
 * ne correspondent pas à ce projet.
 *
 * Ces valeurs ne sont pas des secrets : URL publique + clé anon publiable,
 * destinées au bundle client (la sécurité repose sur le RLS).
 *
 * COMMENT SUPPRIMER CE FICHIER PLUS TARD :
 * Le jour où l'environnement injectera `VITE_SUPABASE_URL` pointant vers
 * `bcwfvpwxzlmkxobvbtzp`, la garde de `client.ts` utilisera automatiquement les
 * variables d'environnement. Il suffira alors de supprimer ce module et ses
 * imports — aucun autre changement nécessaire.
 */

export const SUPABASE_PROJECT_REF = "bcwfvpwxzlmkxobvbtzp";

export const SUPABASE_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;

export const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjd2Z2cHd4emxta3hvYnZidHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjU5NzgsImV4cCI6MjA5NDUwMTk3OH0.wYsoYUMaYDuEv91TbpFBz3fAGTAXO6eh3vHuWrLbsek";

/** Clé de stockage de session, dérivée du projet officiel. */
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
