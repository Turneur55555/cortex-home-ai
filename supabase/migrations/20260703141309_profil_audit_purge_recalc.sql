-- ═══ Purge des badges dont le critère n'est PAS réellement atteint ═══
delete from public.user_badges ub
using public.badges_catalog bc
where ub.badge_key = bc.badge_key
  and coalesce((public.compute_fitness_stats(ub.user_id)->>bc.requirement_type)::numeric, 0) < bc.requirement_value;

-- ═══ XP des objectifs déjà complétés : dû mais jamais versé → marqué versé (crédité dans le recalcul ci-dessous) ═══
update public.goals set xp_awarded = true where is_completed = true and xp_awarded = false;

-- ═══ Recalcul XP/niveau : badges restants + objectifs complétés ═══
update public.user_stats us
set xp = coalesce(b.badge_xp, 0) + coalesce(g.goal_xp, 0),
    level = greatest(1, floor(sqrt((coalesce(b.badge_xp, 0) + coalesce(g.goal_xp, 0))::float / 100))::int + 1),
    updated_at = now()
from (select user_id, sum(xp_reward) as badge_xp from public.user_badges group by user_id) b
full join (select user_id, sum(coalesce(xp_reward,0)) as goal_xp from public.goals where xp_awarded group by user_id) g
  using (user_id)
where us.user_id = coalesce(b.user_id, g.user_id);

-- Utilisateurs sans badge ni objectif → 0 XP
update public.user_stats us
set xp = 0, level = 1, updated_at = now()
where not exists (select 1 from public.user_badges ub where ub.user_id = us.user_id)
  and not exists (select 1 from public.goals g where g.user_id = us.user_id and g.xp_awarded);

-- ═══ Baseline perte de poids : start_value = dernier poids connu à la création de l'objectif ═══
update public.goals g
set start_value = (
  select bt.weight from public.body_tracking bt
  where bt.user_id = g.user_id and bt.weight is not null and bt.date <= g.created_at::date
  order by bt.date desc limit 1
)
where g.goal_type = 'weight_loss' and g.start_value is null;

-- Si aucune pesée avant la création : première pesée après
update public.goals g
set start_value = (
  select bt.weight from public.body_tracking bt
  where bt.user_id = g.user_id and bt.weight is not null
  order by bt.date asc limit 1
)
where g.goal_type = 'weight_loss' and g.start_value is null;
