# Mémoire projet — cortex-home-ai

## Dernière mise à jour
2026-07-05

## Moteur d'analyse par exercice (2026-07-05) — NOUVELLE FEATURE
Transforme chaque exercice de l'historique en fiche d'analyse intelligente. Décisions actées avec Nathan : (1) IA rédactionnelle **hybride à la demande** — moteur déterministe par défaut + bouton « Analyse IA approfondie » optionnel ; (2) objectif utilisateur **inféré + réglage explicite optionnel** ; (3) **fiche unifiée remplaçante** ; (4) livraison en une passe.

### Domaine pur — `src/lib/fitness/analysis/` (zéro React, testé)
- `types.ts` — types + labels (TrainingObjective, MuscleRole, PhysicalTrait, ExerciseAnalysis, etc.).
- `muscleRoles.ts` — `resolveMuscleRoles()` : décompose un exercice en principal/secondaire/stabilisateur. Repli 1 = `exerciseToMuscles` (mapping plat existant), repli 2 = muscles résolus par l'IA (`muscle_groups`), repli 3 = **modèle biomécanique générique** (jamais vide, `isGeneric:true`).
- `physicalImpact.ts` — vecteur largeur/épaisseur/force/hypertrophie/explosivité/stabilité/posture/mobilité, pondéré par mouvement + plage de reps réelle + objectif.
- `profile.ts` — `inferObjective()`/`buildProfileContext()` : priorité objectif explicite > signaux Corps (body_fat/muscle_mass trend) + goals > plage de reps. Utilise `body_tracking`.
- `comparison.ts` — évolution charge/reps/volume/1RM dernière séance vs précédente + PR + état (progression/stagnation/régression/nouveau) + explication. Réutilise `sets.ts`.
- `recommendations.ts` — moteur de recommandations (charge/reps/série/amplitude/excentrique/technique/fréquence/récup) selon état + reps + récup + objectif.
- `imbalance.ts` — déséquilibres déduits de la **recovery map** (aucune requête sup.) : push/pull, haut/bas, muscle négligé, récup incomplète, progression insuffisante.
- `relevance.ts` — score ★1-5 + label (essentiel/recommandé/secondaire/peu pertinent) + raisons, selon profil+objectif.
- `narrative.ts` — textes déterministes (analyse rédigée + résumé intelligent), repli par défaut instantané/offline.
- `engine.ts` — `analyzeExercise(input)` agrège tout. `index.ts` = façade publique.
- `engine.test.ts` — 25 tests (vitest). ⚠️ vitest non installable ici (registre privé Lovable `europe-west4-npm.pkg.dev` bloqué 403 par la policy réseau) → tests lancés avec un vitest isolé depuis registry.npmjs.org : **55/55 verts**. tsc du moteur pur : clean.

### Hooks — `src/hooks/`
- `useExerciseAnalysis.ts` — assemble les entrées depuis les caches existants (`useExerciseSetHistory`, `useWorkouts`→`useRecoveryMap`, `useBodyMeasurements`, `useGoals`, `useTrainingObjective`), mémoïse `analyzeExercise`. **Zéro requête supplémentaire.**
- `useDeepExerciseAI.ts` — IA à la demande via `useQuery` `enabled:false` + `refetch()`, cache `staleTime:Infinity` (pas de re-appel en rouvrant la fiche). Appelle l'edge `analyze-exercise`.
- `useTrainingObjective.ts` — objectif explicite stocké dans `user_preferences.ai_preferences` (JSON, **aucune migration** — choix délibéré vu le drift migrations documenté).

### UI — `src/components/fitness/ExerciseAnalysisSheet.tsx`
Fiche unifiée (drop-in, mêmes props qu'`ExerciseStatsSheet`) : résumé intelligent + pertinence ★, `ExerciseRankCard` (rang RPG/XP/progression réutilisé tel quel), analyse rédigée + bouton IA + sélecteur d'objectif, graphes poids/volume/1RM (repris d'ExerciseStatsSheet), comparaison, muscles par rôle (barre sollicitation + pastille récup), impact physique, recommandations, déséquilibres, détail des séries. **Branchée** dans `WorkoutCard.tsx` et `ActiveWorkoutView.tsx` (imports repointés). `ExerciseStatsSheet.tsx` conservé mais **superseded** (plus référencé en render — supprimable plus tard sur validation).

### Edge — `supabase/functions/analyze-exercise/`
Gemini 2.5 Flash, prose FR 4-6 phrases, CORS/auth/rate-limit (`analyze_exercise`, 20/h). Retourne `{ text }`. Nécessite le secret `GEMINI_API_KEY` (déjà présent). Le bouton se dégrade proprement si l'edge est indisponible (texte déterministe conservé).
- **Fichier auto-contenu (choix délibéré, source de vérité = repo)** : contrairement aux fonctions sœurs qui importent `../_shared/rate-limit.ts`, `analyze-exercise/index.ts` **inline** le rate-limit. Raison : le bundler du déploiement MCP place l'entrypoint sous `source/` et ne peut pas résoudre un import remontant `../_shared`. En gardant la logique inline, le fichier du **dépôt peut être déployé BYTE-POUR-BYTE identique** → aucune divergence repo/prod possible (demande explicite de Nathan, 2026-07-05). Le NB en tête du fichier documente ce choix.
- État déploiement : projet `bcwfvpwxzlmkxobvbtzp`, **v2 ACTIVE**, verify_jwt. `index.ts` déployé = **byte-pour-byte identique** au fichier du dépôt (vérifié via `get_edge_function` ; sha256 repo = `2c49495c…`, 7352 o). deno.json déployé = import map minimal (`@supabase/supabase-js@2.49.4`) équivalent au `functions/deno.json` partagé du repo (les compilerOptions y sont des hints de types locaux, sans effet runtime).
- ⚠️ Piège MCP rencontré : un redéploiement échoue avec `import map path does not exist … source/file:///…` si on ne passe pas `import_map_path` explicitement — **toujours fournir `import_map_path: "deno.json"`** lors d'un redéploiement de fonction existante via MCP. MCP aussi instable par moments (déconnexions).

## Nettoyage complet du code mort (2026-07-05)
- Rapport détaillé : `CLEANUP_AUDIT_REPORT.md` (racine du repo).
- Frontend : `src/ui/` supprimé, `src/lib/fitness/index.ts` (façade jamais utilisée) supprimé, `src/components/recipe/` entier supprimé (feature création de recette jamais construite — seule la lecture `useRecipes`/`useRecipe` survit), 30 composants shadcn/ui inutilisés supprimés, `RestTimer.tsx` (remplacé par `RestTimerBar.tsx`+`useRestTimer`), `BodyHighlighterRenderer.tsx` (remplacé par `MuscleMap.tsx`), `HomeDashboard.tsx`, `ReportSummaryWidget.tsx`, `useNutritionCalculator.ts`, `useProgress.ts`, `use-mobile.tsx`, `motion.ts`, `hashing.ts`, `SwipeableExerciseRow.tsx`, `recipeTypes.ts` + son test, `auth-middleware.ts`, `client.server.ts`.
- npm : 31 dépendances + 1 devDependency supprimées (radix-ui inutilisés, dnd-kit, cmdk, embla-carousel-react, react-hook-form, react-day-picker, input-otp, vaul, react-resizable-panels, @testing-library/react). `vitest` monté en v4 (faille critique corrigée, tests toujours verts). 0 vulnérabilité npm restante.
- ⚠️ **Rappel projet** : `dossiers, contrats, taches, taches_recurrentes, dossier_documents, cp_*, dsn, echeances, affiliations_mutuelle, historique_imports, imports, regles_analyse, arrets_maladie, ca_praticiens, controle_lignes, silae_sync_logs, stc, profiles, app_settings, activity_log` appartiennent au projet **Contrôle de Paie séparé** qui partage cette base — ne jamais les toucher depuis une session cortex-home-ai. `activity_log` en particulier alimentée par des triggers sur les tables paie (182 lignes), découvert pendant cet audit.
- DB : 6 tables mortes supprimées (migration `20260705120933_drop_orphaned_unused_tables`) : `training_programs`, `program_weeks`, `program_sessions`, `program_exercises` (ancienne feature "Coach IA V2 Programs", hooks déjà absents du repo), `stock_history` (feature Stocks/Maison, `use-stocks.ts` absent), `food_search_history` (jamais lue, index déjà signalé unused). Types Supabase régénérés.
- Conservé par précaution (voir rapport pour détails) : `home_subcategories` (54 lignes, écrite par un trigger mais jamais lue — à trancher côté produit), `data_backups`/`compute_fitness_stats`/`rls_auto_enable`/`cleanup_old_pdfs`/`cleanup_expired_cache`/`ensure_home_categories_for_me` (fonctions sans appelant trouvé mais profil admin/cron/sécurité, pas assez de certitude pour supprimer), 5 Edge Functions sans appel frontend mais conçues pour déclenchement externe (cron/webhook), `@cloudflare/vite-plugin`/`@tanstack/router-plugin` (liés au build Cloudflare Workers, non testables ici).
- **Bug `PROFILE_BASE_QK` confirmé et corrigé (même jour)** : `signOut()` (`use-auth.tsx`) ne vidait aucun cache react-query → fuite de données entre comptes si changement de compte sans rechargement complet. Fix : `queryClient.clear()` dans `signOut()`. `PROFILE_BASE_QK` reste utilisé en interne (clé de repli) mais n'est plus exporté.

## Audit + reconstruction complète des migrations (2026-07-05)
- Rapport détaillé : `MIGRATION_AUDIT_REPORT.md` (racine du repo).
- `supabase/migrations/` passe de 82 à **141 fichiers** : 58 migrations manquantes reconstruites verbatim depuis `supabase_migrations.schema_migrations.statements` (le SQL exact exécuté en prod, pas une approximation), 2 fichiers renommés à leur vrai timestamp prod, 1 snapshot non-historique ajouté pour 3 tables (`activity_log`, `dossier_documents`, `taches_recurrentes`) dont l'origine est introuvable.
- **120/120 migrations prod désormais présentes dans le repo avec version+nom identiques.** Aucune modification du schéma de production.
- ⚠️ Restent non résolus (voir rapport §6) : 20 migrations locales jamais trackées en prod (au moins 5 confirmées jamais appliquées : `calendar_tokens`, `daily_activity`, `compute_level_from_xp`, `award_xp_on_goal_complete`, `award_time_of_day_badges`) ; anomalie `reminders` (dropped par une migration non trackée le 19 juin mais toujours vivante avec son schéma enrichi — origine de la recréation introuvable) ; rejeu complet des 141 migrations jamais testé (pas de Docker/Supabase CLI disponibles dans cette session).

## ⚠️ IMPORTANT — Origine des IDs "SUP-XXXX-XXXX"
Ces IDs ne viennent PAS de Supabase (dashboard/support) : ils sont générés par notre propre logger client `src/lib/error-logger.ts` (`generateSupportId()`) et stockés dans la table `public.error_logs` (colonne `support_id`). Pour investiguer un "SUP-...", toujours commencer par :
```sql
select * from public.error_logs where support_id = 'SUP-...';
```
Ne PAS supposer que c'est lié à un log Postgres/Storage/Edge Function juste parce que le timing coïncide (erreur commise le 2026-07-05, corrigée ensuite).

## Fix CI storage bucket pdfs (2026-07-05, sans rapport avec les IDs SUP-)
- `.github/workflows/migrate.yml` step "Ensure storage bucket pdfs" faisait un `POST /storage/v1/bucket` à chaque run CI touchant `supabase/migrations/**`, même bucket déjà existant → `ERROR: duplicate key value violates unique constraint "buckets_pkey"` côté Postgres (bruit, sans impact utilisateur).
- Fix : `GET /storage/v1/bucket/pdfs` préalable, POST seulement si absent.

## Fix bruit hydratation React sur "/" (2026-07-05) — cause réelle des SUP-MR7LCKN4-61KC, SUP-MR7LYHIW-87MD, SUP-MR7MJHXQ-3OJ5 et consorts
- Route `/` = `src/routes/_authenticated/index.tsx`, sous `_authenticated.tsx` qui a `ssr: false` (décision actée juin 12, chantier persistance de session). Le root `__root.tsx` enrobe `<Outlet/>` dans un `<Suspense fallback={<LoadingScreen/>}>`.
- Conséquence connue et non-fatale de `ssr:false` + Suspense root : React jette parfois en prod "Minified React error #418" (mismatch hydratation) ou "#422" (Suspense boundary hydration → bascule client-side). React se rétablit tout seul en re-rendant côté client ; aucune casse fonctionnelle observée.
- `error-logger.ts` avait déjà un filtre `/hydrat/i` avec le commentaire "hydration mismatch warnings" — mais il ne matchait jamais le texte minifié de prod (`"Minified React error #418..."` ne contient pas "hydrat"). Résultat : ces erreurs bénignes généraient un `support_id`, un toast "Une erreur s'est produite" visible utilisateur, et une ligne `error_logs` à chaque occurrence (plusieurs fois par jour depuis au moins le 16 juin).
- Fix : ajout d'un pattern `/react\.dev\/errors\/4(18|19|21|22|23|25)\b/` dans `NOISE_PATTERNS` (tous les codes d'erreur React liés à l'hydratation/Suspense). Complète l'intention déjà présente du filtre `/hydrat/i`, ne change rien au comportement fonctionnel.
- Si ce bruit doit un jour être éliminé à la racine (pas juste filtré), regarder l'interaction `ssr:false` sur `_authenticated` + `<Suspense>` racine dans `__root.tsx`.

## Fix race condition exercise_sets (2026-07-05) — cause de SUP-MR1OQX7K-Y8B5, SUP-MR4KR2Y8-WMLB (duplicate key exercise_sets_exercise_id_set_number_key, /seances)
- `ActiveExerciseCard.tsx` : les boutons « Ajouter une série » et « Reprendre les charges précédentes » n'étaient gardés que par `addSet.isPending`/`updateSet.isPending`. Or `handleRestoreLastSession` boucle sur plusieurs `await addSet.mutateAsync(...)` séquentiels : `isPending` retombe à `false` entre deux itérations, ré-activant brièvement les deux boutons. Un clic pendant cette fenêtre calculait `nextNumber` depuis un `sortedSets` pas encore à jour → même `set_number` que celui en cours de création par la boucle → violation UNIQUE.
- Fix : état local `isBusy` qui couvre toute la durée de l'opération (boucle de restauration incluse), remplace les deux `disabled=` séparés.
- Défense en profondeur : `useAddExerciseSet` (`use-fitness.ts`) retry maintenant une fois sur conflit Postgres `23505` en relisant le `max(set_number)` serveur, au lieu de laisser échouer l'ajout de série (couvre aussi le cas multi-onglets/multi-appareils).

## Deux bugs déjà corrigés en direct sur la BDD prod, jamais commités en migration (2026-07-05)
- `SUP-MQZAWMJ6-3VU7` (StorageApiError "new row violates row-level security policy", /seances, 29 juin) : upload photo exercice sur chemin `user-exercise/<user_id>/...` — l'ancienne policy générique checkait `(storage.foldername(name))[1] = auth.uid()` (attendu pour un chemin plat `<user_id>/fichier`), donc toujours fausse pour ce chemin imbriqué. Une policy dédiée `exercise-images user subfolder {upload,select,delete}` (`[2] = auth.uid()`) existe **déjà en prod** et couvre le cas (RLS = OR des policies) → plus d'occurrence depuis. Migration jamais retrouvée dans le repo.
- `nutrition_meal_check` (2 occurrences, 16 juin, /fitness) : le slug `"petit-dej"` utilisé partout dans l'app (`lib/nutrition/meals.ts`) violait la contrainte CHECK de `public.nutrition.meal` qui n'acceptait que `'petit-dejeuner'`. **Déjà corrigé en prod** (`ALTER ... CHECK (meal = ANY (ARRAY['petit-dej','petit-dejeuner',...]))`) — confirmé par 34 lignes `meal='petit-dej'` en base et aucune récidive depuis. Le repo contient bien une entrée `20260616143452_fix_nutrition_meal_check_petit_dej` dans l'historique **remote** des migrations (`list_migrations`), mais **aucun fichier .sql correspondant n'existe dans `supabase/migrations/`**.

## ⚠️ DRIFT MAJEUR migrations repo vs prod (découvert 2026-07-05)
- `list_migrations` (MCP Supabase) recense **120 migrations appliquées** sur le projet `bcwfvpwxzlmkxobvbtzp`. Le dossier `supabase/migrations/` du repo n'en contient que **82**. **58 migrations existent en prod sans fichier .sql correspondant dans GitHub** (dont les deux ci-dessus), notamment tout un bloc juin 21 → juillet 3 (RLS/perf hardening, exercise_sets, coach IA v2, nutrition v2, catalogue foods, saved_meals, weekly_reports, backups...).
- Conséquence : rejouer les migrations du repo sur une base fraîche (nouvelle branche Supabase, restauration, onboarding dev) **ne reproduirait pas l'état réel de prod** et réintroduirait des bugs déjà corrigés (ex. les deux ci-dessus).
- Pas traité dans cette session (hors périmètre de la demande initiale) — nécessite un audit dédié : `supabase db diff` / comparaison migration par migration pour reconstituer les .sql manquants avant de les committer.

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

## Nutrition — Audit complet + corrections (2026-07-03, session Claude Cowork)
Rapport : `AUDIT_NUTRITION.md` (dossier Drive). Note avant : 64/100.
- **Bug B1 corrigé (corruption)** : `SavedMealsSheet` stockait `base_*` scalés au lieu de /100 g → réédition faussait les macros. Convention documentée : `base_*` = valeurs /100 g quand `consumed_unit` = g/ml, sinon « par portion ». 6 lignes corrompues réparées en prod (whey ×5 nutrition + 1 saved_meal_item).
- **Autres fixes** : B2 cache recherche empoisonné (useFoodSearch guard abort), B3 recette ×N (consumed_quantity), B4 virgule FR (parseDecimal + editDraft dans MealScan/Voice/Favorites), B5/B6 parseISO, B7 suppression immédiate + undo par ré-insertion, B8 consumed_grams_per_unit dans saved_meal_items + RPCs, B9 clampMacroSet avant insert IA.
- **Nouveau module** : `src/lib/nutrition/meals.ts` (MEAL_SLUGS/LABELS/isMealSlug/scalePer100/clampMacroSet) — utilisé par 7 fichiers, plus de duplication.
- **Hooks typés** : types.ts complété à la main (7 tables V2 + 3 RPC) ; use-saved-meals, use-nutrition-favorites, useMealPlan, useRecipes, useFrequentFoods sans `as any`/loose client.
- **Perf** : RPC `frequent_foods` (remplace 300 lignes client), staleTime useNutrition 30s / goals 5min, edge `food-lookup` v5 (upserts USDA parallèles + rate-limit 150/h) → recherche froide ~4s → ~2,3s (vérifié logs).
- **DB (4 migrations, appliquées prod + repo)** : 20260702202410 rattrapage saved_meals/saved_meal_items/nutrition_favorites+policies, ...202431 grams_per_unit+RPCs, ...202446 frequent_foods, ...202452 drop index dupliqués (foods, nutrition_goals) + policies recipes par action.
- **GoalsSheet** : TDEE avec objectif sèche(−300)/maintien/prise(+300), plancher 1200 kcal.
- Push : 7 commits via GitHub web upload (36c7da6→596bf5b). ⚠️ tsc a ~100 erreurs préexistantes (framer-motion types, auth wrapper Lovable) non liées.
- Reste à faire (audit) : fibres persistées, courbe poids/calories, préférences alimentaires → recipe-assistant, leaked password protection (dashboard), refactor NutritionTab (687 l.).
