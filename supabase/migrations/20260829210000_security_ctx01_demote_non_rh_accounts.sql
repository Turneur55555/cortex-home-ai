-- SECURITY DATA FIX — CTX-01, volet données (décision de Nathan, 28/08/2026).
--
-- La migration 20260829140000 a refermé la faille STRUCTURELLE (DEFAULT
-- 'gestionnaire' → 'none', is_paie_staff() vérifie désormais le rôle), mais
-- elle n'a volontairement touché AUCUNE ligne existante : distinguer un vrai
-- gestionnaire de paie d'une inscription Cortex ayant hérité du défaut est
-- une décision métier, pas une déduction technique.
--
-- Éléments factuels relevés en production (28/08/2026) pour éclairer cette
-- décision — aucune activité RH pour aucun des deux comptes ci-dessous :
--   · samuel.bohbot2@icloud.com — 15 séances et 372 repas Cortex,
--     0 dossier responsable, 0 tâche assignée, 0 import RH.
--     Profil d'utilisateur fitness, jamais du staff paie.
--   · alain75017@gmail.com      — 0 activité Cortex, 0 activité RH.
--   · attal.nathan@gmail.com    — compte propriétaire, créé ~10 min après la
--     migration initiale du schéma paie (20260521203001) : conservé
--     'gestionnaire', c'est le seul accès RH légitime.
--
-- Décision validée par Nathan : rétrograder les deux comptes non-RH en
-- 'none'. Réversible en une requête si l'un d'eux devait finalement recevoir
-- un accès paie.
--
-- Ciblage par email (et non par UUID) : c'est l'identifiant métier stable et
-- lisible en revue. La clause `role <> 'none'` rend la migration idempotente
-- et sans effet si elle est rejouée.
UPDATE public.profiles
SET role = 'none', updated_at = now()
WHERE lower(email) IN ('samuel.bohbot2@icloud.com', 'alain75017@gmail.com')
  AND role <> 'none';
