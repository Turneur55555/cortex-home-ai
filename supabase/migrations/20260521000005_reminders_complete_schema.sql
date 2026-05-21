-- Complète le schéma reminders si 20260521000004 a créé la table avant 20260521171624.
-- Toutes les colonnes sont ajoutées avec ADD COLUMN IF NOT EXISTS — safe sur DB existante.

-- Enums (idempotents)
DO $$ BEGIN
  CREATE TYPE public.reminder_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reminder_status AS ENUM ('todo', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reminder_recurrence AS ENUM ('none', 'daily', 'weekly', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Colonnes manquantes (no-op si elles existent déjà)
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS description        text,
  ADD COLUMN IF NOT EXISTS category           text,
  ADD COLUMN IF NOT EXISTS all_day            boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority           public.reminder_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS status             public.reminder_status   NOT NULL DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS recurrence         public.reminder_recurrence NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_until   timestamptz,
  ADD COLUMN IF NOT EXISTS notify_before_minutes integer  NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS favorite           boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at       timestamptz;

-- Index supplémentaires du schéma complet
CREATE INDEX IF NOT EXISTS idx_reminders_user_status   ON public.reminders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_user_favorite ON public.reminders (user_id, favorite) WHERE favorite = true;

-- Realtime (idempotent via ALTER PUBLICATION … IF NOT EXISTS n'existant pas,
-- ON CONFLICT est géré nativement par Postgres)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.reminders REPLICA IDENTITY FULL;
