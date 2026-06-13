# Mémoire projet — cortex-home-ai

## Dernière mise à jour
2026-06-13

## ⚠️ Règle : mettre ce fichier à jour à la fin de chaque session
Toujours mettre à jour ce fichier avec les nouveaux composants, hooks, migrations, features découverts.

---

## Ce que fait cette app
App **ICORTEX** (nom officiel dans les titres de pages) : assistant personnel multi-domaine (fitness, nutrition, maison, paie, rappels, documents). Interface premium mobile. Usage post-séance ou quotidien.

## Stack
- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (auth + BDD + Storage)
- TanStack Query (react-query)
- Lovable pour la génération UI
- Claude Code pour la logique domaine
- Déploiement : Cloudflare Workers (wrangler.jsonc)

---

## Architecture actée (Sprints 1 et 2 terminés)
- MuscleId en français canonique ("pectoraux", "quadriceps") = source de vérité
- MuscleMap.tsx = seul renderer SVG canonique
- useRecoveryMap() = hook central transformation Supabase → domaine
- RECOVERY_COLORS centralisé dans recovery.ts
- resolveMuscleSlugs() gère les alias ("jambes" → ["quadriceps", "ischio", "fessiers"])
- "cardio" a le flag isCardio: true, bypass computeRecovery()
- lib/fitness/index.ts = façade point d'entrée unique du domaine

## Composants supprimés définitivement
- MuscleBodyMap → supprimé Sprint 1
- bodymap-paths.json → supprimé Sprint 1

---

## Routes existantes
- `/` → index (home avec catégories)
- `/login` → connexion (email/password + Google OAuth)
- `/reset-password` → réinitialisation mot de passe (nouveau — juin 12)
- `/_authenticated/index` → accueil connecté
- `/_authenticated/fitness` → page fitness (onglets : Séances, Corps, Nutrition)
  - `CoachSheet` → sheet IA coach
  - `CorpsTab` → MuscleMap + récupération
  - `SeancesTab` → liste séances
  - `NutritionTab` → macros du jour
- `/_authenticated/profil` → profil redesigné (mai 23)
- `/_authenticated/stocks` → inventaire maison
- `/_authenticated/rappels` → rappels (kanban + calendrier)
- `/_authenticated/documents` → PDFs utilisateur
- `/_authenticated/preferences-alimentaires` → préférences alimentaires

---

## Domaines / Features

### Fitness (Sprints 1+2+3+4)
- Séances d'entraînement + WorkoutSheet + SwipeableExerciseRow
- MuscleMap SVG récupération par muscle
- ExercisePickerSheet, ExerciseStatsSheet, WorkoutProgressCharts
- Historique exercices (migration exercise_history mai 15)
- Lieu d'entraînement sur les workouts (migration add_gym_location_to_workouts juin 9)
- Badges fitness (lib/fitness/badges.ts + useUserBadges + useBadgeSystem)
- Objectifs (useGoals, GoalsSheet)
- Streak + activité (useStreak, useUserActivity, ActivityTimeline)

### Fitness — V1 Sprint 4 (juin 13)
- `lib/fitness/strength.ts` — estimate1RM (Epley), setTonnage, workoutTonnage, formatTonnage (créé par Lovable, validé)
- `hooks/useFitnessStreak.ts` — streak ISO-week ≥ N séances/semaine (créé par Lovable, validé)
- `components/fitness/RestTimer.tsx` — composant overlay : countdown ring SVG, son (Web Audio API), vibration, presets 60/90/120/180s
- `components/fitness/WorkoutSheet.tsx` — ajout bouton "Démarrer le repos" par exercice + intégration RestTimer + gym_location conservé
- `components/fitness/WorkoutCard.tsx` — 1RM estimé par exercice (Epley, affiché dans header groupe), tuile "Tonnage" utilise formatTonnage (remplace "Volume" + formatVolume local)
- WorkoutCard local était une version obsolète — remplacé par la version GitHub premium (buildGroups, ExerciseGroup, StatTile)
- ⚠️ Fichiers locaux (Google Drive) désynchronisés vs GitHub — workflow : lire sur GitHub raw avant toute modification
- Prochaine étape V1 : migration exercise_sets (set-by-set + RPE) — à valider SQL avant apply

### Nutrition
- Macros quotidiennes (NutritionSheet, PortionEditModal)
- Scan repas IA (MealScanSheet) + Scan code-barres (BarcodeScannerSheet)
- Recherche aliments OpenFoodFacts (useFoodSearch, FoodAutocomplete)
- Recettes (components/recipe/ : MacroProgress, NutritionBadge, PortionSelector, RecipeMacros)
- Portions en BDD (migration nutrition_portions)
- Préférences alimentaires (route dédiée)
- useNutritionCalculator

### Maison
- Stocks / inventaire (use-stocks, historique via stock_history)
- Rooms + compartiments (lib/maison/rooms.ts, rooms_compartments_refactor)
- Home catégories + sous-catégories (useHomeCategories, useHomeSubcategories, components/home/)
- Pantry (use-pantry.ts — hook présent, route non visible)
- Transfer feature (src/features/transfer/ : TransferPanel, useTransfer, transferService, detectContent)

### Rappels
- Table reminders (priorité, statut, récurrence, favoris)
- Vues : KanbanView, CalendarView, ReminderCard, ReminderSheet, SmartInput
- Hooks : useReminders, useReminderNotifications, useReminderShortcuts
- Temps réel via Supabase realtime

### Documents / PDFs
- Upload et stockage (use-documents, use-user-pdfs)
- Storage RLS policies (migration mai 20)

### Profil
- Redesign complet (migration profile_redesign_complete mai 23)
- ProfileHeader, EditPseudoSheet, ProgressSheet, ProgressionCard, StreakSheet, AppSheet, PersonalizationPanel
- useProfile, useProgress, useUserStats
- Synchronisation pseudo profil ↔ accueil (règle CLAUDE.md)

### Préférences utilisateur (nouveau — juin 12)
- Table user_preferences créée aujourd'hui
- useUserPreferences : theme (dark/light), accent_color, units (metric/imperial), animations, notifications, ai_preferences
- Valeurs par défaut : dark, #6c63ff, metric

### Auth — Persistance de session (gros chantier juin 12)
- **Problème résolu** : sessions perdues après reload / nouveau contexte / multi-onglets
- `lib/authDiagnostics.ts` — système de diagnostics auth complet, exposé globalement comme `window.__ICORTEX_AUTH_DIAGNOSTICS__` (getLog, clear, snapshot). Log tous les événements auth dans localStorage.
- `lib/authSession.ts` — `restoreAuthSession(source, waitMs)` + `refreshAuthSession(source)` : restauration robuste avec fallback sur onAuthStateChange + timeout retry
- `client.ts` — `persistentStorage` custom (fallback localStorage→sessionStorage), PKCE flow activé, `storageKey` explicite, `detectSessionInUrl: true`
- `use-auth.tsx` — `scheduleRefresh()` planifie le refresh 5 min avant expiry, `restoreAuthSession` au mount
- `_authenticated.tsx` — `ssr: false`, utilise `restoreAuthSession` dans beforeLoad (timeout 1500ms)
- `login.tsx` — `ssr: false`, diagnostics intégrés
- `routes/reset-password.tsx` — nouvelle page reset MDP (écoute event PASSWORD_RECOVERY)
- `e2e/auth-persistence.spec.ts` — test E2E : reload + nouveau contexte + multi-onglets
- `SecurityPanel.tsx` — `qc.cancelQueries()` avant signOut + `replace: true` sur navigate

### Rappels — Journal d'audit (juin 10)
- `lib/reminderAudit.ts` — log des payloads realtime postgres_changes en sessionStorage (500 entrées max)
- Exposé comme `window.__REMINDER_AUDIT__` (getLog, clear) pour debug prod
- useReminders.ts — branche le logReminderAudit sur le callback realtime

### Contrôle de Paie
- ⚠️ Projet SÉPARÉ, sans lien avec Icortex — ne pas intégrer dans cette app

### Sécurité & Perf (juin 5 + juin 12)
- Audit RLS complet (sec1-sec6)
- Révocation accès anon sur fonctions security definer
- Indexes manquants ajoutés
- optimize_rls_policies_initplan (juin 12)
- optimize_realtime_messages_policy (juin 12)

---

## Règles UX importantes
- Interface fluide, design premium
- Animations légères
- Pas de popup inutile
- Responsive parfait mobile obligatoire

---

## Composants supprimés définitivement (suite)
- MuscleMap.tsx → supprimé juin 12 (code mort, aucun import)
- profile/GoalsSheet.tsx → supprimé juin 12 (doublon, aucun import — fitness/GoalsSheet.tsx est la version active)
- renderers/BodyHighlighterRenderer.tsx → supprimé juin 12 (wrapper mort, aucun import)
- Icortex/ fichiers temporaires → supprimés juin 12 (rapports, guides, drafts — CLAUDE.md conservé)
- point.md racine → supprimé juin 12 (rapport architecture mai, obsolète)

## Renderer SVG canonique
- BodyMap.tsx = seul renderer SVG actif (mode "recovery" + mode "measurement")
- Importé dans SeancesTab.tsx et CorpsTab.tsx

## Points de vigilance
- use-pantry.ts existe sans route visible → feature en cours ou à connecter
- Contrôle de Paie = projet SÉPARÉ, sans lien avec Icortex
