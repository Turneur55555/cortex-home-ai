# Mémoire projet — cortex-home-ai

## Dernière mise à jour
2026-06-28

## ⚠️ Règle : mettre ce fichier à jour à la fin de chaque session
Toujours mettre à jour ce fichier avec les nouveaux composants, hooks, migrations, features découverts.

## Mise à jour du jour (2026-06-28) — Différentiateurs + Refactor God Hook

### Différentiateurs Séances
- `WorkoutTimer.tsx` (NOUVEAU) : composant isolé avec son propre `setInterval`. Seul lui re-render chaque seconde, plus l'arbre entier de `ActiveWorkoutView` (perf 🔴 corrigé).
- `ActiveWorkoutView.tsx` : streak badge 🔥 dans le header via `useFitnessStreak`. Prop `recoveryMap` ajoutée et passée à chaque `ActiveExerciseCard`.
- `ActiveExerciseCard.tsx` : badges ⚠ "muscle fatigué" (status="fatigued" via recoveryMap + `exerciseToMuscles`). Chip "Suggéré : X kg × N reps · RPE 7" via `recommendLoad()` (Epley inverse modulé récupération).
- `SeancesTab.tsx` : `recoveryMap` transmis à `ActiveWorkoutView`.

### Refactor God Hook use-fitness.ts (🔴 corrigé)
- `hooks/useNutritionGoals.ts` (NOUVEAU) : `NutritionGoals` type + 2 hooks
- `hooks/useBodyTracking.ts` (NOUVEAU) : 3 hooks body tracking
- `hooks/useNutritionData.ts` (NOUVEAU) : 6 hooks nutrition journalière
- `use-fitness.ts` : re-exports rétro-compat, réduit ~1013 → ~650 lignes, zéro import cassé

## Mise à jour du jour (2026-06-28) — 10 quick wins Séances
- `src/lib/fitness/config.ts` : **nouveau fichier**, constante `GYMS` partagée (`["Keep Cool", "On Air"]`). Import dans StartWorkoutSheet + WorkoutSheet.
- `seances.tsx` (route) : suppression du doublon bouton Coach IA + `ProgramSheet` (le Coach IA est déjà dans `SeancesTab.tsx`).
- `StartWorkoutSheet.tsx` : nom de séance auto-rempli (`getDefaultName()` → "Séance du Lundi soir"). Import GYMS depuis config.
- `WorkoutSheet.tsx` : suppression du `RestTimer` (inutile dans le flux rétroactif). Import GYMS depuis config. Suppression `restTimerOpen` state et import `Timer`.
- `ActiveExerciseCard.tsx` : haptic feedback `navigator.vibrate(50)` à la validation de série. Placeholder numériques remplis avec valeurs réelles (plus de "—" incompatible avec type=number). Zone de tap Trash élargie `w-5 → w-11`.
- `ActiveWorkoutView.tsx` : chronomètre séance `text-sm → text-2xl font-bold`. "Salle inconnue" cachée en UI.

## Mise à jour précédente (2026-06-25)
- SéancesTab : bloc "Séances de la semaine" rendu repliable (comme l'Historique complet), avec le bouton "Détails" conservé et le chevron d'expansion.
- CorpsTab : suppression totale de la carte IMC, du calcul BMI et des imports liés (`Scale`, `useUserPreferences`, `height_cm`).
- BDD : migration ajoutant la colonne `completed` sur `exercise_sets` pour la validation set-by-set.
- Hook `use-fitness.ts` : cast temporaire `as any` sur le payload de `useUpdateExerciseSet` le temps de régénérer les types Supabase.
- Build production OK.

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

### Fitness — V1 set-by-set + RPE (juin 13) — TERMINÉ
- Table exercise_sets (id, exercise_id FK, user_id, set_number, reps, weight, rpe 0-10, notes, created_at). RLS, UNIQUE(exercise_id, set_number).
- lib/fitness/sets.ts (WorkingSet, setsTonnage, bestEstimated1RM, topSet, totalReps, averageRpe, summarizeSets), hooks/useExerciseSets.ts, use-fitness.ts useAddWorkout étendu (setDetails), WorkoutSheet éditeur série-par-série.

### Nutrition
- Macros quotidiennes (NutritionSheet, PortionEditModal)
- Scan repas IA (MealScanSheet) + Scan code-barres (BarcodeScannerSheet)
- Recherche aliments via **USDA FoodData Central + catalogue Supabase** (edge `food-lookup` → `services/foodCatalog.ts`). ⚠️ Open Food Facts retiré ; `services/openFoodFacts.ts` n'est plus qu'un shim de type (ré-exporte `FoodResult` via foodCatalog). Résidus à nettoyer (commentaires, libellé visible NutritionTab L273).
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
- `lib/authDiagnostics.ts`, `lib/authSession.ts` (restoreAuthSession, refreshAuthSession), client.ts persistentStorage + PKCE, use-auth.tsx scheduleRefresh, _authenticated.tsx ssr:false, routes/reset-password.tsx, e2e/auth-persistence.spec.ts

### Contrôle de Paie
- ⚠️ Projet SÉPARÉ, sans lien avec Icortex — ne pas intégrer dans cette app

### Sécurité & Perf (juin 5 + juin 12)
- Audit RLS complet (sec1-sec6), révocation accès anon, indexes manquants, optimize_rls_policies_initplan, optimize_realtime_messages_policy

---

## Règles UX importantes
- Interface fluide, design premium
- Animations légères
- Pas de popup inutile
- Responsive parfait mobile obligatoire

---

## Renderer SVG canonique
- BodyMap.tsx = seul renderer SVG actif (mode "recovery" + mode "measurement")
- Importé dans SeancesTab.tsx et CorpsTab.tsx

## Points de vigilance
- use-pantry.ts existe sans route visible → feature en cours ou à connecter
- Contrôle de Paie = projet SÉPARÉ, sans lien avec Icortex

---

## Fitness — Coach IA V2 (juin 14)
- Tables Supabase : training_programs, program_weeks (périodisation), program_sessions, program_exercises. RLS auth.uid()=user_id, index, cascades. Migrations additives appliquées en prod.
- Domaine pur : lib/fitness/periodization.ts (generateProgramWeeks, modèles linear/undulating/block, deload, phaseLabel) + lib/fitness/loadRecommendation.ts (recommendLoad : auto-régulation RPE = reps en réserve via Epley inverse, modulée par la récupération).
- hooks/usePrograms.ts : usePrograms, useProgramWeeks, useCreateProgram (peuple program_weeks via la périodisation pure), useUpdateProgram, useDeleteProgram. Cast `supabase as any` (types.ts non régénéré).
- components/fitness/ProgramSheet.tsx : création + aperçu live périodisation + liste/détail. Branché via bouton « Coach IA » dans routes/_authenticated/fitness/index.tsx (en-tête).
- 30 tests unitaires des fonctions pures : OK.

## Nutrition — V2 (juin 14)
- Tables Supabase : recipes, recipe_ingredients (FK items pour macros via *_per_100g), meal_plans. Réutilise items et shopping_list. RLS + index. Migrations additives en prod.
- Domaine pur : lib/nutrition/recipes.ts (recipeMacros, perServing, scaleServings, sumMacros) + lib/nutrition/shoppingList.ts (aggregateNeeds, buildShoppingList = besoins moins stock).
- hooks/useRecipes.ts (CRUD recettes + macros calculées) ; hooks/useMealPlan.ts (planning hebdo + useGenerateShoppingList + useSaveShoppingList vers shopping_list).
- components/fitness/MealPlanSheet.tsx : planning semaine + génération liste de courses. Branché via bouton « Planning de la semaine » dans NutritionTab.tsx.

## Process (juin 14)
- Après chaque change : tester sur le site déployé (Cloudflare Workers, worker tanstack-start-app) et indiquer le résultat à Nathan.

## V3 — Coach recovery-aware (juin 14)
- lib/fitness/recoveryAdvice.ts (pur, + recoveryAdvice.test.ts) : MUSCLE_AI_NAME (MuscleId→nom edge minuscule), worstStatus, selectionRecovery, readyAlternatives, buildAiRecoveryContext.
- CoachSheet.tsx : prop recoveryMap → pastilles de récup par muscle + avertissement muscles fatigués + suggestions muscles prêts ; envoie `recovery` à l'edge. Fix : noms de muscles passés en minuscules (aiMuscleNames) car l'edge valide en minuscules (génération muscu était cassée avant).
- SeancesTab.tsx : passe recoveryMap (déjà calculé) à CoachSheet.
- Edge supabase/functions/coach-workout : déployée v7 via MCP Supabase (normalizeMuscle + buildRecoverySection à partir de body.recovery). ⚠️ La version déployée fait foi et DIVERGE du repo (le repo n'a pas _shared/ai.ts). Modifier l'edge = redéployer via MCP, pas via GitHub. Le Publish Lovable n'écrase pas le runtime edge.
- Hébergement réel : Lovable (cortex-home-ai.lovable.app). Déploiement = Publish/Update dans le projet Lovable après commit GitHub.

## Refonte Fitness UX/UI premium (en cours — 2026-06-17)
**Décisions actées avec Nathan :**
- Nouvelle **navigation globale** = 5 modules : Accueil · Séances · Corps · Nutrition · Profil (même ordre mobile/desktop). Les onglets internes de `/fitness` (Corps/Séances/Nutrition) deviennent des routes top-level `/seances`, `/corps`, `/nutrition`. L'ancienne page `/fitness` redirige.
- **Maison (`/stocks`) et Rappels (`/rappels`) → sections dans Profil** (retirés du bottom-nav, features conservées).
- **Accueil** = dashboard fitness premium (récup, objectifs, dernières séances, stats hebdo, calories in/out, poids, badges, succès, raccourci création séance).
- **Corps** : `body_tracking` contient déjà toutes les mensurations (weight, body_fat, muscle_mass, chest, waist, hips, left/right_arm, left/right_thigh) → aucune migration, juste l'UI. IMC = poids+taille. Galerie photos avant/après **reportée**.
- **Coach IA** conservé dans Séances.
- **Design** : polir/uniformiser sans changement radical (glassmorphism léger déjà présent).
- **Déploiement** : code direct GitHub poussé via Claude in Chrome (autonomie Nathan, pas de token manuel) → Publish Lovable → test live.
- **Ordre des travaux** : Nav → Accueil → Séances → Corps → Nutrition (+nettoyage OFF) → Profil → passe design.
- ⚠️ e2e/02-navigation.spec.ts à mettre à jour (testids nav-stocks/nav-documents supprimés du bottom-nav).

## Nutrition — Saisie vocale (2026-06-28)
- **Edge function `supabase/functions/parse-meal-text/index.ts`** (déployée ACTIVE sur projet `bcwfvpwxzlmkxobvbtzp`)
  - Reçoit `{ text: string }` (3–2000 chars), parse via Gemini 2.5 Flash (tool calling `save_meal`)
  - Retourne `{ items[], meal?, confidence?, details? }` — un item par aliment identifié avec kcal/P/G/L
  - Rate limit : 30 appels/heure (action `parse_meal_text`) via `_shared/rate-limit.ts`
  - Toujours HTTP 200, erreurs dans `{ error: "..." }`
- **Composant `src/components/fitness/VoiceLogSheet.tsx`** (nouveau)
  - Push-to-talk via `onPointerDown`/`onPointerUp`/`onPointerCancel` (iOS-safe)
  - `SpeechRecognition` / `webkitSpeechRecognition`, lang `fr-FR`, continuous: false
  - Guard `hasSpeechRecognition` — masque le micro si API indisponible
  - Auto-parse au résultat final de speech
  - Textarea fallback toujours visible (séparateur "ou tape")
  - Panel de révision : modifier inline (name + 4 macros), supprimer, totaux, sélecteur repas
  - Confirmation via `useAddNutritionBatch` (batch insert)
  - Imports : `Loader2, Mic, MicOff, Plus, Sparkles, Trash2` from lucide-react
- **`NutritionTab.tsx`** : bouton « Vocal » (icône Mic) ajouté dans la rangée d'actions, `voiceOpen` state, render conditionnel `<VoiceLogSheet>`
