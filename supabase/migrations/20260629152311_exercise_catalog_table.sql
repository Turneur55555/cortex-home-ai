
CREATE TABLE IF NOT EXISTS public.exercise_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  group_name text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exercise_catalog_name_idx ON public.exercise_catalog (lower(name));

ALTER TABLE public.exercise_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercise_catalog_select" ON public.exercise_catalog;
CREATE POLICY "exercise_catalog_select" ON public.exercise_catalog
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "exercise_catalog_insert" ON public.exercise_catalog;
CREATE POLICY "exercise_catalog_insert" ON public.exercise_catalog
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "exercise_catalog_update" ON public.exercise_catalog;
CREATE POLICY "exercise_catalog_update" ON public.exercise_catalog
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "exercise_catalog_delete" ON public.exercise_catalog;
CREATE POLICY "exercise_catalog_delete" ON public.exercise_catalog
  FOR DELETE USING (auth.uid() IS NOT NULL);

INSERT INTO public.exercise_catalog (name, group_name, sort_order) VALUES
('Développé couché barre', 'Pectoraux', 1),
('Développé couché haltères', 'Pectoraux', 2),
('Développé incliné barre', 'Pectoraux', 3),
('Développé incliné haltères', 'Pectoraux', 4),
('Développé décliné haltères', 'Pectoraux', 5),
('Écarté couché haltères', 'Pectoraux', 6),
('Écarté câble croisé', 'Pectoraux', 7),
('Pec deck machine', 'Pectoraux', 8),
('Pompes', 'Pectoraux', 9),
('Dips', 'Pectoraux', 10),
('Écarté incliné haltères', 'Pectoraux', 11),
('Tirage vertical poignée large', 'Dos', 1),
('Tirage vertical poignée serrée', 'Dos', 2),
('Tirage vertical poignée neutre', 'Dos', 3),
('Rowing barre', 'Dos', 4),
('Rowing haltère unilatéral', 'Dos', 5),
('Rowing machine poignée V', 'Dos', 6),
('Tirage horizontal câble', 'Dos', 7),
('Traction prise large', 'Dos', 8),
('Traction prise neutre', 'Dos', 9),
('Pull-over haltère', 'Dos', 10),
('Tirage horizontal assis poitrine', 'Dos', 11),
('Développé militaire barre', 'Épaules', 1),
('Développé militaire haltères', 'Épaules', 2),
('Élévations latérales haltères', 'Épaules', 3),
('Élévations latérales câble', 'Épaules', 4),
('Élévations frontales haltères', 'Épaules', 5),
('Oiseau haltères', 'Épaules', 6),
('Face pull câble', 'Épaules', 7),
('Arnold press', 'Épaules', 8),
('Développé militaire haltères assis', 'Épaules', 9),
('Curl barre droite', 'Biceps', 1),
('Curl barre EZ', 'Biceps', 2),
('Curl haltères alternés', 'Biceps', 3),
('Curl marteau haltères', 'Biceps', 4),
('Curl incliné haltères', 'Biceps', 5),
('Curl câble basse poulie', 'Biceps', 6),
('Curl concentré haltère', 'Biceps', 7),
('Curl haltères', 'Biceps', 8),
('Curl pupitre barre EZ', 'Biceps', 9),
('Extension triceps câble corde', 'Triceps', 1),
('Extension triceps câble barre droite', 'Triceps', 2),
('Barre au front', 'Triceps', 3),
('Extension triceps haltère unilatéral', 'Triceps', 4),
('Kickback triceps haltère', 'Triceps', 5),
('Dips triceps banc', 'Triceps', 6),
('Dips barres parallèles', 'Triceps', 7),
('Extension triceps haltère nuque', 'Triceps', 8),
('Extension triceps poulie haute', 'Triceps', 9),
('Squat barre', 'Jambes', 1),
('Squat gobelet', 'Jambes', 2),
('Squat hack machine', 'Jambes', 3),
('Leg press', 'Jambes', 4),
('Fente avant barre', 'Jambes', 5),
('Fente avant haltères', 'Jambes', 6),
('Fente bulgare haltères', 'Jambes', 7),
('Leg extension machine', 'Jambes', 8),
('Leg curl allongé machine', 'Jambes', 9),
('Leg curl assis machine', 'Jambes', 10),
('Romanian deadlift', 'Jambes', 11),
('Leg press incliné', 'Jambes', 12),
('Soulevé de terre roumain barre', 'Jambes', 13),
('Soulevé de terre roumain haltères', 'Jambes', 14),
('Squat avant barre', 'Jambes', 15),
('Hip thrust barre', 'Fessiers', 1),
('Hip thrust machine', 'Fessiers', 2),
('Abducteur machine', 'Fessiers', 3),
('Kickback câble fessier', 'Fessiers', 4),
('Soulevé de terre jambes tendues', 'Fessiers', 5),
('Adducteur machine', 'Fessiers', 6),
('Crunch', 'Abdominaux', 1),
('Crunch câble', 'Abdominaux', 2),
('Planche', 'Abdominaux', 3),
('Relevé de jambes suspendu', 'Abdominaux', 4),
('Relevé de buste banc incliné', 'Abdominaux', 5),
('Russian twist', 'Abdominaux', 6),
('Mountain climbers', 'Abdominaux', 7),
('Wheel rollout', 'Abdominaux', 8),
('Crunch câble debout', 'Abdominaux', 9),
('Crunch câble à genoux', 'Abdominaux', 10),
('Crunch inversé banc', 'Abdominaux', 11),
('Crunch machine', 'Abdominaux', 12),
('Hyperextension banc', 'Abdominaux', 13),
('Planche latérale', 'Abdominaux', 14),
('Relevé de jambes chaise romaine', 'Abdominaux', 15),
('Rotation câble assis', 'Abdominaux', 16),
('Rotation câble debout', 'Abdominaux', 17),
('Extension mollets debout', 'Mollets', 1),
('Extension mollets assis machine', 'Mollets', 2),
('Extension mollets leg press', 'Mollets', 3),
('Soulevé de terre', 'Polyarticulaire', 1),
('Soulevé de terre sumo', 'Polyarticulaire', 2),
('Shrug barre', 'Polyarticulaire', 3),
('Rowing debout barre', 'Polyarticulaire', 4),
('Tapis de course', 'Cardio', 1),
('Vélo elliptique', 'Cardio', 2),
('Rameur', 'Cardio', 3),
('Corde à sauter', 'Cardio', 4),
('Burpees', 'Cardio', 5)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
