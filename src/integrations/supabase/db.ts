import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * Échappatoire de typage pour les tables/RPC déjà présentes en base
 * (projet `bcwfvpwxzlmkxobvbtzp`) mais absentes de `types.ts`, qui est
 * regénéré depuis un autre projet et donc temporairement en retard.
 *
 * Règle projet : `src/integrations/supabase/types.ts` ne se corrige JAMAIS à la
 * main (la base est la source de vérité, cf.
 * docs/architecture/supabase-types-source-of-truth.md). En attendant un
 * `npm run gen:types` sur la bonne base, on utilise `db` — même client, même
 * session, même RLS — uniquement pour les objets concernés par cette dérive.
 *
 * Ne pas utiliser `db` pour les tables correctement typées : on perdrait
 * l'autocomplétion et la vérification des colonnes sans raison.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as SupabaseClient<any, "public", any>;
