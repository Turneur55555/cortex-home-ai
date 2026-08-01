-- Correctif critique : signup cassé pour tout nouvel utilisateur.
--
-- Audit (voir MEMORY.md) : le trigger `on_auth_user_created_home_categories`
-- sur `auth.users` appelle `seed_default_home_categories()`, qui appelle
-- `_seed_home_categories_for_user(uuid)`, laquelle INSERT dans
-- `public.home_categories` — une table supprimée par la migration
-- `20260714145745_ae103805-61da-4ed3-8d66-58d07c94cdf4.sql` (suppression
-- complète de l'ancienne fonctionnalité "Home" : `items`,
-- `home_subcategories`, `home_categories`). Cette migration a supprimé les
-- tables et `ensure_home_categories_for_me()`, mais a OUBLIÉ le trigger et
-- ses deux fonctions — laissant `auth.users` avec un trigger AFTER INSERT
-- qui échoue systématiquement (`relation "public.home_categories" does not
-- exist`), cassant tout signup réel.
--
-- Classification (§ audit du brief) : A — totalement obsolète. Confirmé :
--  - `public.home_categories`/`home_subcategories`/`items` n'existent plus ;
--  - aucune architecture de remplacement ("Home") n'existe dans le schéma
--    actuel ;
--  - `_seed_home_categories_for_user` n'a qu'un seul appelant
--    (`seed_default_home_categories`), lui-même appelé uniquement par ce
--    trigger ;
--  - aucune référence côté frontend (grep `src/` : aucun résultat, hormis
--    la définition générée dans `types.ts`, un artefact, pas un appelant).
--
-- Correction minimale cohérente avec l'architecture réelle : supprimer le
-- trigger et les deux fonctions devenues orphelines. `on_auth_user_created`
-- (→ `handle_new_user`, écrit dans `public.profiles`, table existante) est
-- laissé strictement intact — audité, sain, aucune référence à une table
-- disparue.

DROP TRIGGER IF EXISTS on_auth_user_created_home_categories ON auth.users;
DROP FUNCTION IF EXISTS public.seed_default_home_categories() CASCADE;
DROP FUNCTION IF EXISTS public._seed_home_categories_for_user(uuid) CASCADE;
