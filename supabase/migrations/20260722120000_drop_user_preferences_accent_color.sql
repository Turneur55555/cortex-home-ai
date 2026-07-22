-- Retrait de accent_color (user_preferences) : le sélecteur de couleur
-- d'accent utilisateur est remplacé par RankTheme (le rang pilote désormais
-- --primary/--ring/--gradient-* — voir src/components/rpg/rankTheme.ts).
-- Colonne inutilisée par l'app depuis ce changement, aucune autre table/
-- fonction/policy n'en dépend (grep supabase/ : uniquement les migrations
-- qui l'ont créée).
ALTER TABLE public.user_preferences DROP COLUMN IF EXISTS accent_color;

NOTIFY pgrst, 'reload schema';
