-- stock_history: tracks every stock change (manual, nutrition, scan, bulk)

CREATE TABLE IF NOT EXISTS public.stock_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id         uuid        REFERENCES public.items(id) ON DELETE SET NULL,
  item_name       text        NOT NULL CHECK (char_length(item_name) BETWEEN 1 AND 200),
  action_type     text        NOT NULL CHECK (action_type IN ('added', 'removed', 'adjusted', 'consumed', 'moved')),
  quantity_before float,
  quantity_after  float,
  source          text        NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('manual', 'nutrition', 'scan', 'bulk')),
  meal_name       text,
  room_id         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own stock history"
  ON public.stock_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_stock_history_user ON public.stock_history (user_id, created_at DESC);
CREATE INDEX idx_stock_history_item ON public.stock_history (item_id) WHERE item_id IS NOT NULL;
