-- Lot V8.3 — catalogue HYROX complet : les 9 postes officiels dans
-- exercise_reference (discipline "hyrox"), pour composer une séance
-- entière depuis le picker sans aucune saisie libre. Chaque libellé
-- correspond aux motifs du modèle métier (hyroxEngine.repMetricKeysFor)
-- et ouvre donc directement la bonne Hero Card. "Rameur" = nomenclature
-- du moteur (STATION_IDS) ; "RowErg" tapé librement reste couvert par
-- les motifs. Idempotent (UNIQUE discipline_id+name), rejouable.

-- 1) Normalise la casse des lignes auto-créées en séance ("Sled pull"
--    → "Sled Pull") : l'unicité est sensible à la casse, sans cela le
--    seed créerait un doublon visuel dans le picker. Ne renomme que si
--    la forme officielle n'existe pas déjà.
UPDATE public.exercise_reference AS er
SET name = official.name
FROM (
  VALUES
    ('Running'),
    ('SkiErg'),
    ('Sled Push'),
    ('Sled Pull'),
    ('Burpee Broad Jump'),
    ('Rameur'),
    ('Farmer Carry'),
    ('Sandbag Lunges'),
    ('Wall Balls')
) AS official(name)
WHERE er.discipline_id = 'hyrox'
  AND lower(er.name) = lower(official.name)
  AND er.name <> official.name
  AND NOT EXISTS (
    SELECT 1
      FROM public.exercise_reference e2
     WHERE e2.discipline_id = 'hyrox'
       AND e2.name = official.name
  );

-- 2) Seed/normalisation des 9 postes — sort_order = ordre officiel de
--    course (SIMULATION_ORDER, footings intercalés). Les lignes déjà
--    présentes récupèrent leur catégorie et leur rang officiels.
INSERT INTO public.exercise_reference (name, category, sort_order, discipline_id)
VALUES
  ('Running',           'Postes officiels', 1, 'hyrox'),
  ('SkiErg',            'Postes officiels', 2, 'hyrox'),
  ('Sled Push',         'Postes officiels', 3, 'hyrox'),
  ('Sled Pull',         'Postes officiels', 4, 'hyrox'),
  ('Burpee Broad Jump', 'Postes officiels', 5, 'hyrox'),
  ('Rameur',            'Postes officiels', 6, 'hyrox'),
  ('Farmer Carry',      'Postes officiels', 7, 'hyrox'),
  ('Sandbag Lunges',    'Postes officiels', 8, 'hyrox'),
  ('Wall Balls',        'Postes officiels', 9, 'hyrox')
ON CONFLICT (discipline_id, name)
DO UPDATE SET category = EXCLUDED.category, sort_order = EXCLUDED.sort_order;
