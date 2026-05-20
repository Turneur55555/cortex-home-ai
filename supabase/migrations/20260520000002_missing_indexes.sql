-- ============================================================
-- Indexes manquants sur rate_limits
-- Note : idx_rate_limits_user_action (user_id, action, window_start)
--        existe déjà (migrations 20260510160630 et 20260517100000).
--        On ajoute uniquement l'index simple sur window_start,
--        absent de toutes les migrations précédentes.
-- ============================================================

-- Index sur rate_limits.window_start
-- Optimise le cleanup et les queries de rate-limit par fenêtre temporelle
CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx
  ON rate_limits(window_start);

COMMENT ON INDEX rate_limits_window_start_idx IS
  'Optimise le cleanup et les queries de rate-limit par fenêtre temporelle';
