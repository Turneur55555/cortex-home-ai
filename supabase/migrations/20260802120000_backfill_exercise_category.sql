-- Complète le groupe musculaire principal (`category`) des exercices Cortex
-- existants qui n'en avaient jamais reçu — demandé par Nathan (2026-08),
-- interface d'administration de la bibliothèque d'exercices §14 : "je ne
-- veux plus jamais de badge de groupe musculaire vide".
--
-- Portée strictement limitée à `exercise_reference.category` (métadonnée de
-- catalogue), jamais aux séances/séries/répétitions/charges/records d'un
-- utilisateur. Correction manuelle, ligne par ligne, revue une à une contre
-- le nom réel de chaque exercice — pas une règle générique appliquée en
-- aveugle, pour éviter tout mauvais classement silencieux. Utilise le même
-- vocabulaire de catégories déjà en usage dans `exercise_reference.category`
-- (Pectoraux, Dos, Épaules, Biceps, Triceps, Jambes, Fessiers, Abdominaux,
-- Mollets, Cardio, Polyarticulaire) plus deux intitulés neutres pour les
-- mouvements sans muscle dominant (Échauffement, Récupération) — voir
-- `src/lib/fitness/muscleGroupInference.ts` pour la logique de résolution
-- appliquée aux futurs exercices (affichage), dont cette liste reprend
-- exactement le résultat pour les lignes concernées.
--
-- Idempotent : chaque UPDATE ne cible que `category IS NULL`, donc une
-- ré-exécution ne change plus rien une fois la colonne renseignée.
UPDATE public.exercise_reference SET category = 'Abdominaux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Abdominaux (ex: Bear, Pikes, Crunches lent)';
UPDATE public.exercise_reference SET category = 'Échauffement' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Activation Articulaire & Musculaire';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Back extension';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Banc Lombaire';
UPDATE public.exercise_reference SET category = 'Abdominaux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Bloc Core & Obliques (ex: Bear, Plank-to-Pike, Side Plank)';
UPDATE public.exercise_reference SET category = 'Polyarticulaire' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Bloc Haut du Corps & Stabilité (ex: Push-Ups, Bicep Curl, Tricep Extension)';
UPDATE public.exercise_reference SET category = 'Jambes' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Bloc Jambes & Fessiers (ex: Megaformer Lunges, Super Lunge, Skating)';
UPDATE public.exercise_reference SET category = 'Pectoraux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Chest incliné';
UPDATE public.exercise_reference SET category = 'Pectoraux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Chest press machine (incliné)';
UPDATE public.exercise_reference SET category = 'Abdominaux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Core & Obliques (ex: Planche lente, Crunches obliques, Pikes)';
UPDATE public.exercise_reference SET category = 'Abdominaux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Crunches inversés et Twist russes lents';
UPDATE public.exercise_reference SET category = 'Biceps' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Curl barre EZ poulie';
UPDATE public.exercise_reference SET category = 'Biceps' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Curl poulie unilatéral';
UPDATE public.exercise_reference SET category = 'Pectoraux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Développé convergent à la poulie';
UPDATE public.exercise_reference SET category = 'Pectoraux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'développé incliné convergent';
UPDATE public.exercise_reference SET category = 'Pectoraux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Écarté à la poulie vis à vis';
UPDATE public.exercise_reference SET category = 'Pectoraux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Écarté poulie basse (Tempo 3-0-1-0)';
UPDATE public.exercise_reference SET category = 'Échauffement' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Échauffement dynamique';
UPDATE public.exercise_reference SET category = 'Échauffement' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Échauffement dynamique (mobilisation articulaire et activation douce)';
UPDATE public.exercise_reference SET category = 'Échauffement' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Échauffement dynamique (mobilisation articulaire et respiration)';
UPDATE public.exercise_reference SET category = 'Échauffement' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Échauffement global (mobilisations articulaires)';
UPDATE public.exercise_reference SET category = 'Épaules' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Élévation frontale épaule';
UPDATE public.exercise_reference SET category = 'Épaules' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Élévation frontale unilatérale';
UPDATE public.exercise_reference SET category = 'Épaules' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Élévation latéral poulie';
UPDATE public.exercise_reference SET category = 'Récupération' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Étirements Post-séance (ischio, fessiers, dos)';
UPDATE public.exercise_reference SET category = 'Récupération' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Étirements Profonds & Respiration Consciente';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Extension dos';
UPDATE public.exercise_reference SET category = 'Triceps' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Extension tricepsà la poulie unilatéral';
UPDATE public.exercise_reference SET category = 'Triceps' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Extension unilatérale poulie haute';
UPDATE public.exercise_reference SET category = 'Polyarticulaire' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Farmer’s Carry';
UPDATE public.exercise_reference SET category = 'Jambes' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Fentes Lagree (lentes et contrôlées)';
UPDATE public.exercise_reference SET category = 'Polyarticulaire' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Flow Full Body (enchaînements contrôlés)';
UPDATE public.exercise_reference SET category = 'Polyarticulaire' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Full Body Flow (combinaison de mouvements lents et contrôlés)';
UPDATE public.exercise_reference SET category = 'Fessiers' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Glute Bridge Intensif & Leg Sweeps';
UPDATE public.exercise_reference SET category = 'Polyarticulaire' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Haut du corps & Gainage (ex: Push-ups lent, Cobra, Planche oblique)';
UPDATE public.exercise_reference SET category = 'Polyarticulaire' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Haut du Corps & Stabilité (ex: Ours, Push-ups lents, Charriot)';
UPDATE public.exercise_reference SET category = 'Jambes' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Jambes & Fessiers (ex: Lunges lents, Squats tenus, Cheval)';
UPDATE public.exercise_reference SET category = 'Jambes' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Jambes & Fessiers (ex: Squats piqués, Fentes ouvertes)';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Pull over poulie haute';
UPDATE public.exercise_reference SET category = 'Pectoraux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Push-Ups Lents & Pull-Overs (Standing Torso Twist, Bear)';
UPDATE public.exercise_reference SET category = 'Récupération' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Retour au calme (étirements doux et relaxation)';
UPDATE public.exercise_reference SET category = 'Récupération' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Retour au calme (étirements doux et respiration profonde)';
UPDATE public.exercise_reference SET category = 'Récupération' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Retour au calme & Étirements';
UPDATE public.exercise_reference SET category = 'Épaules' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Rotation externe de l’épaule à la poulie';
UPDATE public.exercise_reference SET category = 'Épaules' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Rotation interne de l’épaule';
UPDATE public.exercise_reference SET category = 'Épaules' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Rotation interne de l’épaule à 90 degrés';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Rowing t bar';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Rowing T-barre';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Rowing unilatéral poulie';
UPDATE public.exercise_reference SET category = 'Jambes' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Séquence Fentes Mega-Contrôlées (Carriage Lunge, Back Lunge)';
UPDATE public.exercise_reference SET category = 'Abdominaux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Série de Planche (avant, côtés) et Push-ups modifiés';
UPDATE public.exercise_reference SET category = 'Épaules' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Shrug altère';
UPDATE public.exercise_reference SET category = 'Abdominaux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Spider Kick & Bear Plank';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Tirage nuque';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Tirage poitrine prise neutre à la machine';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Tirage vertical gym80';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Traction anneau pronation';
UPDATE public.exercise_reference SET category = 'Dos' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Traction anneau supination';
UPDATE public.exercise_reference SET category = 'Abdominaux' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Variations de Plank & Pikes (Plank to Pike, Cobra)';
UPDATE public.exercise_reference SET category = 'Polyarticulaire' WHERE discipline_id = 'muscu' AND category IS NULL AND name = 'Wall Balls';

NOTIFY pgrst, 'reload schema';
