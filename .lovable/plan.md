# Refonte page Profil — Cortex Home AI

Refonte complète de `/profil` en page premium, sobre, orientée compte/progression/personnalisation. L'Accueil reste l'expérience immersive. **Aucune notion premium/abonnement** (conforme à la décision précédente).

## Nouvelles tables Supabase (migration unique)

```text
user_preferences   theme, accent_color, units (metric/imperial), animations_enabled,
                   notifications_enabled, ai_preferences (jsonb)
user_badges        badge_key, label, icon, unlocked_at
user_stats         xp, level, total_actions (compteurs agrégés, 1 ligne / user)
user_activity      type, label, metadata (jsonb), created_at  (timeline)
```

- RLS `auth.uid() = user_id` (ALL, authenticated) sur les 4 tables
- `user_preferences` et `user_stats` : 1 ligne/user, upsert via hook
- `user_activity` : index `(user_id, created_at desc)`, on garde les 20 derniers à l'affichage
- Trigger `updated_at` standard

## Hooks (nouveau, src/hooks/)

- `useUserPreferences` — get/upsert, React Query
- `useUserBadges` — liste + dernier débloqué
- `useUserStats` — xp / level / dérivés (level = floor(sqrt(xp/50)))
- `useUserActivity` — timeline 10 derniers, realtime optionnel

## Composants (src/components/profile/)

Nouveaux, tous mobile-first, glassmorphism léger, animations Framer subtiles :

- `ProfileHeader` — avatar éditable (initiale ou photo), salutation dynamique (Bonjour/Bonsoir + prénom), email discret, badge niveau, streak compact, bouton édit
- `ProgressionCard` — poids actuel/objectif, moyenne protéines (7j), jours de suivi, % objectifs (anneaux minimalistes, Recharts)
- `GoalsManager` — réutilise `useGoals` existant, UI cartes compactes, create/edit/delete inline, % + date cible
- `BadgesStrip` — 3-5 derniers badges + level/XP, lien "voir tout"
- `ActivityTimeline` — 5 derniers items max, icône + label + relative time
- `PersonalizationPanel` — toggles (theme, animations, notifications), select unités, color picker accent
- `SecurityPanel` — email (read-only), changer mot de passe (Supabase auth), export données (JSON download), supprimer compte (confirm dialog), déconnexion

## Page

`src/routes/_authenticated/profil.tsx` — réécriture complète, sections empilées dans cet ordre :
Header → Progression → Objectifs → Badges → Activité → Personnalisation → Sécurité

Skeletons par section, error boundaries locales.

## Détails techniques

- Avatar : bucket Supabase Storage `avatars` (public read, write `auth.uid()::text = (storage.foldername(name))[1]`)
- Changement mot de passe : `supabase.auth.updateUser({ password })`
- Export données : serverFn `exportUserData` qui agrège items, nutrition, workouts, goals, preferences → JSON download
- Suppression compte : serverFn `deleteUserAccount` (admin client) → supprime data + `auth.admin.deleteUser`
- Thème/accent : applique sur `<html>` via classes Tailwind + CSS custom property `--primary`
- XP/badges : pas d'attribution automatique dans cette itération (lecture seule depuis tables, alimentées plus tard depuis l'Accueil/actions)

## Ce qui ne change pas

- Accueil (`/`), navigation, autres routes, BodyMap, fitness, stocks, home — intouchés
- Hooks existants (`useProfile`, `useGoals`, `useStreak`, `useProgress`) — réutilisés
- Architecture `/src/lib/fitness/` — intouchée

## Livraison

1. Migration SQL (4 tables + bucket avatars + policies)
2. 4 hooks
3. 7 composants profile/
4. 2 serverFn (export, delete account)
5. Réécriture `profil.tsx`
6. Mise à jour mémoire sécurité (nouvelles tables RLS)
