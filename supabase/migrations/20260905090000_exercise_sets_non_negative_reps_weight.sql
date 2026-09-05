-- CHANTIER 9 (C2) — INTÉGRITÉ DES SÉRIES : NI RÉPÉTITIONS NI CHARGE NÉGATIVES.
--
-- LE DÉFAUT
-- ---------
-- `exercise_sets` ne portait AUCUNE contrainte de domaine sur `reps` et
-- `weight` (inventaire relevé en base : seuls `exercise_sets_set_number_check`
-- (set_number >= 1), les deux clés étrangères, la clé primaire et
-- `exercise_sets_exercise_id_set_number_key` existent). Or les champs de
-- saisie sont des `<input type="number">` sans borne basse : « -5 » était une
-- valeur acceptée par le client, écrite en local puis poussée telle quelle.
-- Une charge négative n'est pas une donnée d'entraînement : elle fausse le
-- tonnage, le 1RM estimé et la détection de progression côté serveur
-- (`award_xp_on_workout_complete` fait `MAX(weight)` / `SUM(weight * reps)`).
--
-- AUDIT DES DONNÉES EXISTANTES — FAIT AVANT D'ÉCRIRE CETTE MIGRATION
-- ------------------------------------------------------------------
-- Relevé le 05/09/2026 sur le projet bcwfvpwxzlmkxobvbtzp, sur les
-- 1 801 lignes de `exercise_sets` :
--   reps  : 3 NULL, 0 négative, 0 à zéro, min 1, max 30, 0 non entière
--   weight: 156 NULL, 0 négative, 20 à ZÉRO (poids de corps), min 0, max 100
-- AUCUNE ligne existante n'est en conflit avec la contrainte ci-dessous, qui
-- peut donc être posée et validée immédiatement, sans réécrire ni supprimer
-- la moindre donnée.
--
-- POURQUOI `>= 0` ET NON `> 0`
-- ----------------------------
-- 0 kg est une saisie LÉGITIME et présente en production (20 séries) : c'est
-- ainsi que se note un exercice au poids de corps. Une contrainte stricte
-- détruirait une donnée réelle. Le seuil est donc la seule chose que l'audit
-- justifie : refuser le NÉGATIF, rien de plus. `NULL` reste accepté (série
-- créée puis renseignée plus tard, cas nominal hors ligne).
--
-- POURQUOI C'EST SANS RISQUE POUR LE MOTEUR OFFLINE
-- -------------------------------------------------
-- `23514` (check_violation) est déjà classé dans `NON_RETRYABLE_PG_ERROR_CODES`
-- (`lib/offline/syncErrors.ts`) : une violation ne part donc PAS en boucle de
-- retry — l'opération passe `blocked`, visible dans le panneau de
-- synchronisation, la donnée locale conservée et arbitrable par
-- l'utilisateur. Et surtout, le client ne peut plus produire une telle valeur
-- depuis le chantier 9 (C1) : `parseSetFieldInput`
-- (`src/lib/fitness/sets.ts`) refuse le négatif, le NaN et le hors-bornes
-- avant toute écriture. Cette contrainte est donc un filet de sécurité
-- serveur, pas un chemin emprunté en fonctionnement normal.
--
-- Aucune policy RLS n'est touchée. Aucune colonne n'est ajoutée ni modifiée :
-- `src/integrations/supabase/types.ts` reste inchangé (les types générés ne
-- reflètent pas les CHECK).
-- Idempotente (`DROP ... IF EXISTS` avant chaque `ADD`, convention du dépôt
-- vérifiée par `npm run validate:supabase`) : rejouer cette migration ne doit
-- jamais échouer.
ALTER TABLE public.exercise_sets
  DROP CONSTRAINT IF EXISTS exercise_sets_reps_non_negative;
ALTER TABLE public.exercise_sets
  ADD CONSTRAINT exercise_sets_reps_non_negative
  CHECK (reps IS NULL OR reps >= 0);

ALTER TABLE public.exercise_sets
  DROP CONSTRAINT IF EXISTS exercise_sets_weight_non_negative;
ALTER TABLE public.exercise_sets
  ADD CONSTRAINT exercise_sets_weight_non_negative
  CHECK (weight IS NULL OR weight >= 0);
