# Intégration du dataset externe `hasaneyldrm/exercises-dataset`

**Statut : infrastructure complète posée (schéma bibliothèque d'exercices + multi-média + fusion manuelle + interface d'administration, voir §14), migration NON appliquée à la production, import réel jamais exécuté.** Voir §8 (runbook historique) et §14.7 (runbook à jour) pour l'exécution contrôlée. Document produit le 2026-07-28, renforcé le 2026-07-28 (v2, §3bis), 2026-07-29 (v3, §11/§12), 2026-07-30 (v4, §13), puis le 2026-07-31 (v5 — changement de stratégie : plus aucune fusion automatique, bibliothèque complète avec fusion manuelle depuis une interface d'administration, §14) suite aux demandes de Nathan.

---

## 1. Analyse du dépôt GitHub

Dépôt : `github.com/hasaneyldrm/exercises-dataset`.

- `data/exercises.json` — 1 324 enregistrements, validés par `data/exercises.schema.json`.
- `images/`, `videos/` — miniatures 180×180 et GIFs d'animation.
- Chaque enregistrement expose : `id`, `name` (anglais uniquement), `category`, `body_part`, `equipment`, `target`/`muscle_group`, `secondary_muscles[]`, `instructions.<lang>` (10 langues dont `fr`), `instruction_steps.<lang>`, `image`, `gif_url`, `media_id`, `attribution`, `created_at`.
- **Limite structurelle importante** : seules les **instructions** sont traduites en 10 langues (dont le français). **Le nom de l'exercice (`name`) n'existe qu'en anglais.** Il n'y a pas de champ `name_fr`. Toute correspondance basée sur le nom entre le référentiel Cortex (noms français) et ce dataset (noms anglais) devra donc s'appuyer sur : muscle/équipement/catégorie en appoint, et in fine sur une revue humaine pour les cas ambigus — voir section 3.
- Licence : code/structure MIT ; images et GIFs © Gym visual (gymvisual.com), réutilisables avec attribution conservée.

## 2. Stratégie d'intégration recommandée

Conforme à l'architecture existante décrite dans `docs/architecture/exercise-central-architecture.md` : **`exercise_reference` reste l'unique référentiel d'identité** (invariant §9.6 de ce document — aucune seconde table de catalogue d'identité). Le dataset externe ne devient donc jamais une source d'identité parallèle : il **enrichit** des lignes existantes ou **crée** de nouvelles lignes dans `exercise_reference`, jamais autre chose.

Trois issues possibles par enregistrement du dataset, décidées par un score de correspondance (0 à 1, voir §3) :

| Score | Décision | Effet |
|---|---|---|
| ≥ `AUTO_MERGE_THRESHOLD` (0.82) | `auto_merge` | Enrichit la ligne `exercise_reference` existante — **additif uniquement**, aucun champ déjà renseigné n'est écrasé (voir §4). |
| ≤ `CREATE_NEW_THRESHOLD` (0.35) | `create_new` | Aucune ligne existante ne ressemble à cet exercice → nouvelle ligne `exercise_reference` créée, déjà enrichie. Ne peut jamais créer de doublon (même contrainte unique `(discipline_id, name)` que le reste du système, upsert `onConflict`). |
| entre les deux | `needs_review` | Dépôt dans `exercise_dataset_candidates` (`status='pending'`), **aucune écriture sur `exercise_reference`**. Traitement humain requis. |

## 3. Algorithme de correspondance

Implémenté dans `supabase/functions/_shared/exerciseDatasetMatching.ts` (source unique, réexporté côté client dans `src/lib/fitness/exerciseDatasetMatching.ts` pour test — même convention que `_shared/meals.ts` / `lib/nutrition/meals.ts`). Combine désormais **5 signaux indépendants** (renforcement v2, §3bis) :

| Signal | Poids | Détail |
|---|---|---|
| Nom | 0.55 (1 si égalité exacte, indépendamment des autres signaux) | Coefficient de Dice sur les tokens, comparé contre **tous** les candidats de nom : nom FR fourni, traduction exacte dictionnaire, traduction phrase best-effort, nom EN brut, synonymes dataset — contre `name` **et** tous les `aliases` existants. |
| Muscle principal | 0.20 | `exercise_reference.category` vs `muscle_group`/`target`/`body_part` du dataset **traduit EN->FR**. |
| Muscles secondaires | 0.10 | `config.secondary_muscles` existant (si déjà enrichi) vs `secondary_muscles[]` du dataset traduit. |
| Équipement | 0.10 | `config.equipment` existant, ou à défaut déduit par mots-clés du libellé FR (`extractEquipmentFromFrenchLabel`), vs `equipment` dataset traduit. |
| Catégorie | 0.05 | `exercise_reference.category` vs `category` dataset traduit (signal faible, souvent générique côté dataset). |

- **Garde-fou de sécurité inchangé** : la somme des 4 signaux d'appoint (muscle + secondaire + équipement + catégorie) plafonne à 0.45, **strictement inférieure** à `AUTO_MERGE_THRESHOLD` (0.82) — aucune combinaison de ces signaux seuls ne peut jamais déclencher une fusion automatique sans un minimum de correspondance de nom. Vérifié par test dédié (`"garde-fou : muscle + muscles secondaires + équipement + catégorie seuls ne peuvent jamais atteindre le seuil de fusion automatique"`).
- Un nom anglais sans traduction connue et sans recouvrement lexical avec le nom français existant reste sous le seuil de fusion automatique → part en revue, jamais fusionné à tort. C'est le comportement voulu : en cas de doute, on ne fusionne pas.

## 3bis. Couche de traduction/alias EN<->FR (renforcement demandé par Nathan)

Fichier : `supabase/functions/_shared/exerciseTranslations.ts` (réexporté dans `src/lib/fitness/exerciseTranslations.ts`, testé dans `exerciseTranslations.test.ts`).

- **`EXACT_NAME_TRANSLATIONS_EN_TO_FR`** — dictionnaire haute précision nom-à-nom pour ~90 exercices courants, incluant tels quels les exemples fournis (`Bench Press → Développé couché`, `Lat Pulldown → Tirage vertical`, `Seated Cable Row → Tirage horizontal assis`, `Face Pull → Face Pull`, `Romanian Deadlift → Soulevé de terre roumain`). Un hit ici produit un score de nom de 1 (fusion possible si aucun autre signal ne contredit), consommé par `bestNameSimilarity` comme candidat prioritaire.
- **Traduction phrase best-effort** (`translateExerciseNameToFrench`) — substitution ordonnée (phrases les plus longues d'abord) d'un dictionnaire ~90 entrées couvrant le vocabulaire musculation courant (press/press militaire, row/rowing, curl, extension, squat, deadlift, fly/écarté, equipment...). Sert de repli quand l'exact-match échoue, et alimente aussi la génération d'alias (ci-dessous).
- **`MUSCLE_TRANSLATIONS_EN_TO_FR`** / **`EQUIPMENT_TRANSLATIONS_EN_TO_FR`** — dictionnaires muscle/équipement EN->FR utilisés par les 4 signaux d'appoint du scoring (§3).
- **`extractEquipmentFromFrenchLabel`** — heuristique inverse par mots-clés (barre, haltères, câble, machine, poulie...) pour déduire l'équipement implicite d'un exercice Cortex existant qui n'a pas encore de `config.equipment` renseigné (cas de tous les exercices jamais enrichis).
- **`buildAliasesForDatasetRecord`** (dans `exerciseDatasetMatching.ts`, consomme la couche de traduction) — génère la liste dédupliquée des alias à persister : nom EN brut, traduction exacte, traduction phrase, synonymes dataset — en excluant systématiquement le nom canonique lui-même. **Ces alias sont réellement écrits sur `exercise_reference.aliases`** par l'edge function (union avec les alias existants, jamais de remplacement — voir §6), ce qui permet à `searchExercises` (`src/lib/fitness/exerciseCatalog.ts`) de retrouver un exercice dans les deux langues ("lat pulldown" ET "tirage vertical" retrouvent la même ligne une fois l'import réel exécuté).
- **`config` stocke désormais les valeurs FR traduites comme clés primaires** (`muscle_group`, `secondary_muscles`, `equipment`) exploitées par les futurs re-matchs, et conserve les valeurs anglaises brutes sous `*_en` pour audit — voir `buildConfigPayload` dans l'edge function.
- **Limite assumée** : ces dictionnaires sont construits manuellement (haute précision, couverture volontairement large sur le vocabulaire le plus courant) plutôt que par traduction automatique généraliste (éviterait tout non-sens grammatical mais serait moins prévisible/auditable). Un nom d'exercice absent des deux dictionnaires reste comparé via recouvrement de tokens sur le nom EN brut — dégrade gracieusement vers `needs_review` plutôt que de produire une fausse traduction.

## 4. Modifications de la base de données

Migration : `supabase/migrations/20260728123000_exercises_dataset_enrichment.sql` — additive uniquement, aucune suppression, aucune ligne existante touchée par la migration elle-même.

1. `exercise_reference` — 3 nouvelles colonnes nullable : `dataset_source`, `dataset_exercise_id`, `dataset_synced_at`. Index unique partiel `(dataset_source, dataset_exercise_id) WHERE dataset_exercise_id IS NOT NULL` (anti-doublon d'import, jamais une contrainte sur les colonnes existantes).
   - Les colonnes descriptives utilisées pour l'enrichissement (`description`, `media` jsonb, `config` jsonb, `aliases` text[]) **existent déjà** dans `exercise_reference` (réservées à cet usage, voir `exercise-central-architecture.md` §2.2) — aucune nouvelle colonne descriptive n'était nécessaire.
2. Nouvelle table `exercise_dataset_candidates` — file de revue des correspondances incertaines. RLS `service_role` uniquement (aucun système de rôle admin n'existe encore côté Cortex pour exposer une UI de revue authentifiée — hors périmètre de cette intégration, à cadrer séparément si une UI de revue est souhaitée).

**Aucune autre table n'est touchée** : `exercises`, `exercise_sets`, `workout_segments`, `workouts`, `exercise_history`, `user_exercise_illustrations` restent strictement inchangées. Comme elles pointent déjà vers `exercise_reference.id` (jamais vers un nom dupliqué), enrichir une ligne `exercise_reference` en place **ne casse aucune relation existante** : le même `id` continue de désigner le même exercice pour tout l'historique.

## 5. Fichiers modifiés/créés

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260728123000_exercises_dataset_enrichment.sql` | Schéma additif (§4). |
| `supabase/functions/_shared/textNormalize.ts` | `normalizeForMatch`, isolée pour éviter une dépendance circulaire entre le moteur de scoring et la couche de traduction. |
| `supabase/functions/_shared/exerciseTranslations.ts` | Couche de traduction/alias EN<->FR (§3bis) — source unique. |
| `supabase/functions/_shared/exerciseDatasetMatching.ts` | Moteur de scoring multi-signaux pur (source unique) + `buildAliasesForDatasetRecord`. |
| `src/lib/fitness/exerciseDatasetMatching.ts` | Réexport pour test/usage frontend futur. |
| `src/lib/fitness/exerciseTranslations.ts` | Réexport de la couche de traduction pour test/usage frontend futur. |
| `src/lib/fitness/exerciseDatasetMatching.test.ts` | Tests unitaires du moteur de scoring (23 cas). |
| `src/lib/fitness/exerciseTranslations.test.ts` | Tests unitaires de la couche de traduction (11 cas). |
| `supabase/functions/import-exercises-dataset/index.ts` | Edge function d'import (fetch dataset → traduit → match → enrichir/créer/mettre en revue, alias générés persistés, rapport détaillé, sauvegarde avant tout run réel). |
| `supabase/functions/restore-exercises-dataset-import/index.ts` | Edge function de restauration exacte d'un run réel (§12). |
| `supabase/functions/_shared/exerciseDatasetReport.ts` | Génération du rapport détaillé du dry-run (§11) — source unique. |
| `src/lib/fitness/exerciseDatasetReport.ts` | Réexport du générateur de rapport pour test. |
| `src/lib/fitness/exerciseDatasetReport.test.ts` | Tests unitaires du rapport (7 cas). |
| `supabase/migrations/20260729120000_exercises_dataset_import_snapshot.sql` | Tables de sauvegarde/journalisation + fonction `restore_exercise_reference_import` (§12). |
| `src/lib/fitness/exerciseCatalog.ts` | `CatalogExercise.aliases?` (additif) + `searchExercises` cherche aussi dans les aliases. |
| `src/hooks/useExerciseCatalog.ts` | `DbCatalogRow` étendu (`aliases`, `media`, `description`, tous optionnels) ; `dbRowsToCatalog` propage `aliases` s'ils existent. |
| `scripts/dry-run-exercises-dataset.ts` | Rejoue le dry-run en local (lecture seule) à partir d'un export JSON des exercices existants + du dataset téléchargé — réutilise les mêmes modules `_shared` (§13). |

## 6. Code — comportement de l'edge function `import-exercises-dataset`

- Auth : `CRON_SECRET` ou `SUPABASE_SERVICE_ROLE_KEY` en `Authorization: Bearer` (même pattern que `cleanup-pdfs`) — jamais appelable par un utilisateur authentifié standard.
- **`dry_run: true` par défaut** — une exécution qui écrit réellement en base doit être explicitement demandée (`{"dry_run": false}`). Le dry-run ne fait **strictement aucune écriture** (pas même une sauvegarde) : uniquement un `select` en lecture seule sur `exercise_reference`, puis calcul et retour du rapport (§11). Rien n'est fusionné, créé, ni mis en file de revue tant que `dry_run:false` n'est pas explicitement demandé.
- Un run réel (`dry_run:false`) commence toujours par une sauvegarde complète (§12) avant la moindre écriture sur `exercise_reference` — si la sauvegarde échoue, la fonction s'arrête immédiatement sans avoir rien écrit d'autre.
- Pour chaque enregistrement du dataset :
  - Le nom canonique FR (`nameFr`) est dérivé via la couche de traduction (`exactTranslateExerciseName` en priorité, repli `translateExerciseNameToFrench`) — c'est ce nom qui est utilisé pour la comparaison et pour créer une nouvelle ligne le cas échéant, jamais le nom anglais brut (conforme à l'exigence "l'application est entièrement en français").
  - `auto_merge` → relit la ligne cible, ne complète que les champs actuellement `NULL` (`description`, `media`, `config`), ajoute les alias FR+EN générés (`buildAliasesForDatasetRecord`) à `aliases` (union, jamais de remplacement), pose `dataset_source`/`dataset_exercise_id`/`dataset_synced_at`.
  - `create_new` → upsert sur `(discipline_id, name)` avec le nom FR canonique — la même contrainte unique que `ExerciseResolutionService`, donc structurellement incapable de créer un doublon même en cas de ré-exécution. Aliases FR/EN générés dès la création.
  - `needs_review` → upsert dans `exercise_dataset_candidates` (`status='pending'`), payload brut conservé pour audit, alias FR/EN proposés inclus dans `match_reasons` à l'attention du relecteur humain (jamais appliqués tant que le statut reste `pending`).
- Instructions françaises utilisées directement depuis `instructions.fr` du dataset (déjà fournies, aucune génération/traduction automatique nécessaire — le dataset couvre déjà le français, voir §1). Champ `instructions_en` gardé dans `config` comme repli si jamais `fr` est absent pour un enregistrement donné.
- `config.muscle_group`/`secondary_muscles`/`equipment` stockent les valeurs **traduites en français** (clés primaires, relues par le scoring des imports suivants) ; les valeurs anglaises brutes restent disponibles sous `*_en` pour audit.

## 7. Tests à effectuer

**Déjà faits dans cette session :**
- `npm run test` (vitest) — 487 tests passés, dont 23 dans `exerciseDatasetMatching.test.ts` (égalité exacte, traduction exacte EN->FR, recouvrement partiel, muscles secondaires, équipement via config/heuristique, garde-fou anti-fusion-automatique-sans-nom, génération d'alias, classification des 3 seuils), 18 dans `exerciseTranslations.test.ts` (dictionnaire exact, traduction phrase, muscle/équipement, heuristique d'équipement inverse, + 7 cas issus de l'analyse §13 dont le test de non-régression "front"/"Barre au front") et 7 dans `exerciseDatasetReport.test.ts` (formatage pourcentage/décision, format exact de correspondance ambiguë demandé par Nathan, compteurs, liste jamais tronquée, libellé dry-run vs run réel).
- Deux dry-runs réels exécutés en lecture seule contre la production (`scripts/dry-run-exercises-dataset.ts`) — voir §13 pour la méthode et les résultats mesurés (37 → 48 fusions automatiques, 0 régression).
- `npx tsc --noEmit` — 0 erreur.
- `npx eslint` sur tous les fichiers modifiés/créés — 0 erreur.
- `node scripts/validate-supabase.mjs` — migrations valides et idempotentes.

**À faire avant tout import réel (voir runbook §8) :**
1. `dry_run: true` sur l'échantillon complet (1 324 enregistrements) et inspecter le résumé (`autoMerged`/`createdNew`/`queuedForReview`/`errors`) — vérifier que `queuedForReview` reste substantiel (attendu, vu la limite §1 sur les noms anglais) plutôt que `autoMerged` anormalement élevé (signe d'un seuil trop permissif).
2. Vérifier manuellement un échantillon (~20 lignes) de chaque catégorie de décision avant d'activer `dry_run: false`.
3. Après un premier run réel : requêter `exercise_reference` pour confirmer qu'aucune ligne `is_active`/`name`/`category` antérieure n'a changé de valeur (seules des colonnes NULL doivent avoir été remplies) — comparer un export avant/après sur `id, name, category, aliases, description, media, config`.
4. Revérifier les invariants listés en §9 (aucune donnée utilisateur perdue).

## 8. Runbook d'exécution (manuel, jamais automatique)

Cette intégration ne s'exécute jamais toute seule (pas de cron programmé) — décision volontaire vu la sensibilité des données utilisateur. Étapes pour Nathan :

```bash
# 1) Déployer les migrations (via CI habituelle migrate.yml, ou MCP Supabase apply_migration)
# 2) Déployer les edge functions
supabase functions deploy import-exercises-dataset
supabase functions deploy restore-exercises-dataset-import

# 3) Dry-run complet (STRICTEMENT aucune écriture, pas même une sauvegarde)
curl -X POST https://<project>.functions.supabase.co/import-exercises-dataset \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
# -> Répond avec { ..., "report": "=== Rapport du dry-run ... ===\n...", "ambiguousMatches": [...] }
# Lire "report" (texte prêt à l'emploi, liste COMPLÈTE des correspondances
# ambiguës avec décomposition par signal — voir §11) avant toute autre étape.

# 4) (Optionnel) Dry-run limité pour inspection rapide
curl ... -d '{"dry_run": true, "limit": 50}'

# 5) Ne passer à l'étape 6 qu'après avoir lu et validé le rapport de l'étape 3.
#    Tant que cette validation explicite n'a pas eu lieu, ne PAS appeler
#    dry_run:false — c'est la seule chose qui déclenche une écriture.

# 6) Exécution réelle (sauvegarde automatique prise avant la moindre écriture, voir §12)
curl ... -d '{"dry_run": false}'
# -> Répond avec { ..., "runId": "<uuid>", "report": "...", ... } — CONSERVER runId,
# c'est la clé de restauration (§12) si un problème est détecté après coup.

# 7) Revue de la file d'attente (correspondances incertaines)
#    via SQL editor Supabase ou MCP execute_sql :
select dataset_name, match_score, match_reasons, candidate_exercise_reference_id
from exercise_dataset_candidates where status = 'pending' order by match_score desc;

# Pour chaque ligne, après vérification humaine :
#   - approuver (fusionne manuellement dans exercise_reference, UPDATE status='approved')
#   - rejeter (UPDATE status='rejected', aucune action)
#   - créer un nouvel exercice (INSERT dans exercise_reference, UPDATE status='created_new')

# 8) En cas de problème détecté après l'import réel : restauration exacte (§12)
curl -X POST https://<project>.functions.supabase.co/restore-exercises-dataset-import \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"run_id": "<uuid retourné à l'\''étape 6>"}'
```

Images/GIFs : conservés en `media.thumbnail_url`/`media.gif_url` sous forme d'URL externe (CDN GitHub raw / gymvisual) pour cette première étape — pas de re-téléchargement/conversion WebP ni de mise en cache Supabase Storage dans ce lot (1 324 fichiers, coût et risque de rate-limit disproportionnés pour une première intégration ; l'affichage direct depuis l'URL externe fonctionne déjà et respecte l'attribution Gym visual requise par la licence). Le passage à un cache Storage local + conversion WebP est un chantier séparé, à cadrer une fois la fusion de données validée en production.

## 9. Risques identifiés

| Risque | Mitigation |
|---|---|
| Faux positif de fusion automatique (deux exercices distincts fusionnés à tort) | Seuil `AUTO_MERGE_THRESHOLD` volontairement haut (0.82), poids nom dominant (0.55, 1 si exact), muscle+secondaire+équipement+catégorie combinés (0.45 max) ne peuvent jamais l'atteindre seuls ; testé unitairement (garde-fou dédié). |
| Mauvaise traduction produit un alias ou un score erroné | Dictionnaire exact = liste explicite auditée (haute précision) ; traduction phrase = repli best-effort qui ne peut que dégrader vers `needs_review` (jamais halluciner une fusion), jamais utilisée seule pour dépasser le seuil sans recouvrement de tokens suffisant. |
| Duplication d'exercice (import relancé plusieurs fois) | Contrainte unique `(discipline_id, name)` sur `exercise_reference` (déjà en place, réutilisée) + `(dataset_source, dataset_exercise_id)` (nouvelle, partielle) — deux ceintures indépendantes. |
| Écrasement d'une donnée déjà saisie (manuelle ou import précédent) | L'edge function relit la ligne avant écriture et ne complète que les champs `NULL` ; `aliases` fait une union, jamais un remplacement. |
| Rupture de relation FK (`exercises.exercise_reference_id`, `workout_segments.exercise_id`, `user_exercise_illustrations.exercise_reference_id`) | Aucun `id` n'est jamais modifié ni supprimé par cette intégration — seules des colonnes annexes sur la ligne ciblée sont complétées. |
| Dataset externe indisponible/modifié en amont | L'edge function échoue proprement (HTTP 500, message explicite) sans avoir touché la base si le `fetch` initial échoue ; aucune écriture partielle avant d'avoir la liste complète. |
| Coût réseau/stockage du re-téléchargement de 1 324 médias | Différé volontairement (§8) — médias servis en lien direct pour cette étape. |
| Absence de système de rôle pour une UI de revue | File de revue accessible uniquement en `service_role`/SQL pour l'instant ; documenté comme limite assumée, pas un blocage pour la fusion additive elle-même. |
| Import réel lancé par erreur sans revue préalable du rapport | `dry_run: true` par défaut ; le rapport (§11) doit être lu et validé explicitement avant tout `dry_run:false` — aucune automatisation ne peut sauter cette étape. |
| Import réel produit un résultat indésirable une fois en base | Sauvegarde complète automatique avant toute écriture + restauration exacte via `run_id` (§12) — entièrement réversible. |
| Rollback lancé trop tard, après que l'utilisateur a déjà journalisé des séances sur un exercice nouvellement créé | Documenté comme limite assumée (§12) : restaurer supprime la ligne `exercise_reference` créée (les FK repassent à NULL, aucune perte de séance/série/répétition/charge, mais la séance perd son lien d'identité vers cet exercice précis) — à faire le plus tôt possible après l'import, idéalement avant toute nouvelle séance utilisateur. |

## 10. Vérification — conservation à 100 % des données utilisateur

Aucune ligne n'ayant encore été importée (voir statut en tête de document), cette section décrit les vérifications à exécuter **après** le premier run réel (§8), pas un état déjà constaté :

- [ ] `select count(*) from exercises` avant/après identique.
- [ ] `select count(*) from exercise_sets` avant/après identique.
- [ ] `select count(*) from workouts` avant/après identique.
- [ ] `select count(*) from exercise_history` avant/après identique (table write-only, voir dette 10.1 de `exercise-central-architecture.md` — non touchée par construction, cette intégration ne référence jamais cette table).
- [ ] `select count(*) from user_exercise_illustrations` avant/après identique.
- [ ] Pour chaque `exercise_reference.id` référencé par au moins une ligne `exercises`/`workout_segments`/`user_exercise_illustrations` : `name`, `category` inchangés avant/après (seules colonnes annexes NULL remplies).
- [ ] Un parcours manuel : ouvrir un programme existant, une séance historique, la fiche de progression d'un exercice déjà pratiqué → identiques à avant l'import.
- [ ] Graphiques de progression / PR / déséquilibres musculaires (`computePRs`, `computeBroadActivity`) inchangés pour l'historique existant (ces fonctions lisent par `identityKey`/`exercise_reference_id`, jamais impactées par un enrichissement de colonnes annexes sur la même ligne).

En cas de doute sur un résultat de vérification : ne pas exécuter `dry_run: false` en production tant que le doute n'est pas levé — conformément à la priorité absolue de conservation des données donnée par Nathan.

## 11. Rapport détaillé du dry-run (demandé par Nathan, 2026-07-29)

Implémenté dans `supabase/functions/_shared/exerciseDatasetReport.ts` (réexporté dans `src/lib/fitness/exerciseDatasetReport.ts`, testé dans `exerciseDatasetReport.test.ts`, 7 cas). Chaque appel à `import-exercises-dataset` — dry-run **ou** réel — retourne désormais, en plus des compteurs déjà existants (`autoMerged`/`createdNew`/`queuedForReview`/`skippedNoName`) :

- **`report`** (string) — rapport texte prêt à l'emploi, avec :
  - un en-tête récapitulatif (nombre total d'exercices analysés, nombre fusionnés automatiquement, nombre de nouveaux exercices créés, nombre nécessitant une validation manuelle, et — en dry-run — la mention explicite qu'aucune écriture n'a eu lieu) ;
  - la **liste complète et jamais tronquée** des correspondances classées `needs_review`, chacune au format demandé :
    ```
    Close Grip Lat Pulldown
    → Tirage vertical prise serrée

    Nom : 86 %
    Muscle principal : 100 %
    Muscles secondaires : 100 %
    Équipement : 100 %
    Catégorie : 100 %

    Score global : 88 %

    Décision : Validation manuelle
    ```
- **`ambiguousMatches`** (array structuré) — même contenu que la liste texte ci-dessus, sous forme programmable (`datasetName`, `matchedExistingName`, `breakdown` par signal, `score`, `decision`) pour un traitement outillé ultérieur si souhaité.

Le moteur de scoring (`scoreCandidate`, `_shared/exerciseDatasetMatching.ts`) expose désormais un `breakdown` (`MatchBreakdown`) avec le sous-score 0..1 de chacun des 5 signaux (nom, muscle principal, muscles secondaires, équipement, catégorie) en plus du score global — c'est cette décomposition qui alimente le rapport, calculée pour **toutes** les paires (existant, dataset), pas seulement celles qui finissent fusionnées.

**Aucune écriture n'accompagne la génération du rapport en dry-run** : le `select` initial sur `exercise_reference` est la seule opération DB de tout l'appel. Le rapport est le seul livrable — voir §12 pour ce qui se passe quand `dry_run:false` est explicitement demandé.

## 12. Sauvegarde et restauration (demandé par Nathan, 2026-07-29)

Migration : `supabase/migrations/20260729120000_exercises_dataset_import_snapshot.sql` — additive, ne touche aucune table existante.

### Mécanisme retenu

Plutôt qu'un `pg_dump` externe (nécessiterait un accès shell/CLI hors du périmètre d'une edge function) ou une sauvegarde de l'instance entière (disproportionné : cette intégration ne touche jamais que `exercise_reference`), le mécanisme retenu est un **snapshot ciblé, transactionnel, et automatique** :

1. **`exercise_reference_import_runs`** — une ligne par exécution réelle (`dry_run:false`), identifiée par un `run_id` (UUID généré côté edge function, retourné dans la réponse). Un dry-run ne crée jamais de run.
2. **`exercise_reference_import_backup`** — avant la moindre écriture, l'edge function snapshotte **l'intégralité** des lignes `exercise_reference` de la discipline `muscu` (pas seulement celles qui seront enrichies — sauvegarde complète, comme demandé), sous forme de copie JSON complète de chaque ligne (`row_data`). Si cette sauvegarde échoue, la fonction lève une erreur et s'arrête **avant toute autre écriture**.
3. **`exercise_reference_import_created`** — journalise chaque ligne nouvellement créée par le run (ces lignes n'ont pas d'état "avant" à restaurer : une restauration les supprime).
4. **Fonction Postgres `restore_exercise_reference_import(run_id)`** (`SECURITY DEFINER`, exécutable uniquement par `service_role`) — en une seule transaction :
   - supprime les lignes créées par ce run (`exercise_reference_import_created`) — **sans casse de FK** : `exercises.exercise_reference_id`, `workout_segments.exercise_id` et `user_exercise_illustrations.exercise_reference_id` sont `ON DELETE SET NULL` (voir `exercise-central-architecture.md` §2.3/§2.5/§2.6), donc aucune ligne `exercises`/séance/série n'est supprimée — seul le lien d'identité vers cet exercice précis repasse à NULL ;
   - restaure l'état exact (`row_data`) de chaque ligne enrichie par ce run (`exercise_reference_import_backup`).
5. **Edge function `restore-exercises-dataset-import`** — expose cette fonction via RPC, avec la même authentification (`CRON_SECRET`/service role) que l'import.

### Pourquoi ce mécanisme plutôt qu'un dump SQL classique

- **Précision** : restaure exactement et uniquement ce que CET import a touché — pas de risque d'écraser une autre modification survenue entre-temps sur une table sans rapport.
- **Disponible sans accès shell** : entièrement pilotable via les edge functions déjà en place, cohérent avec l'architecture 100 % Supabase managed du projet.
- **Rapide et atomique** : une fonction SQL en une transaction, pas un `pg_restore` qui nécessiterait de dépeupler puis repeupler des tables entières.
- **Complémentaire, pas exclusif** : rien n'empêche d'utiliser en plus la sauvegarde automatique quotidienne / point-in-time recovery de Supabase (Dashboard → Database → Backups) comme filet supplémentaire avant un premier run en production — recommandé mais non requis, ce mécanisme ciblé étant suffisant pour garantir la réversibilité exacte de cette intégration.

### Limite assumée

Si l'utilisateur commence à journaliser des séances sur un exercice **nouvellement créé** par l'import avant qu'une restauration n'ait lieu, restaurer supprime bien la ligne `exercise_reference` (elle n'existait pas avant) — les séances/séries/répétitions/charges déjà enregistrées ne sont **jamais supprimées** (aucune table utilisateur n'est touchée), mais elles perdent leur lien d'identité vers cet exercice précis (`exercise_reference_id` repasse à NULL, filet de compatibilité par nom déjà prévu par l'architecture existante, voir `exercise-central-architecture.md` §10.2). Conclusion pratique : traiter une restauration le plus tôt possible après un import réel, avant toute nouvelle séance utilisateur sur les exercices nouvellement créés.

## 13. Analyse des causes d'ambiguïté et renforcement du dictionnaire (2026-07-30, demandé par Nathan)

**Contexte** : le premier dry-run réel (exécuté en lecture seule contre la production le 2026-07-28, voir résultats ci-dessous) donnait 37 fusions automatiques sur 167 exercices existants — Nathan a demandé une phase d'analyse pour comprendre pourquoi, sans jamais baisser les seuils de sécurité.

### 13.1 Méthode

Deux dry-runs réels ont été exécutés (lecture seule, aucune écriture, aucune sauvegarde) :
1. Lecture SQL de `exercise_reference` (discipline `muscu`, 167 lignes) + téléchargement du dataset (1 324 enregistrements) + exécution du moteur de correspondance réel via un script local (`scripts/dry-run-exercises-dataset.ts`, réutilise les mêmes modules `_shared` que l'edge function — voir §5).
2. Après les améliorations décrites en §13.3, ré-exécution strictement identique pour mesurer l'effet réel, comparer les 37 fusions initiales aux nouvelles fusions (aucune régression tolérée), et confirmer par du code, pas par estimation.

### 13.2 Analyse des 750 correspondances ambiguës — regroupement par cause

Classification heuristique à partir de la décomposition par signal (`breakdown`) de chaque correspondance ambiguë du premier dry-run :

| Cause | Part | Explication |
|---|---|---|
| Score bas, proche du seuil de création | ~30 % | Le meilleur candidat existant n'a en réalité presque rien en commun avec l'exercice dataset — un signal isolé et faible (souvent la catégorie) suffit à dépasser de peu `CREATE_NEW_THRESHOLD` (0.35). Ce sont, pour l'essentiel, des exercices réellement absents du catalogue Cortex : leur décision naturelle serait `create_new`, pas une vraie ambiguïté de fusion. |
| Granularité du catalogue Cortex | ~30 % | Le nom ne se ressemble presque pas, mais muscle + équipement + catégorie concordent parfaitement — parce que Cortex n'a souvent qu'**une seule** ligne générique par mouvement de base (ex. une seule "Squat barre" pour toute la famille des squats) alors que le dataset détaille des dizaines de variantes nommées (glute bridge, rack pull, step-up, good morning…) qui partagent la même catégorie "Jambes"/"barre" sans être le même exercice. Aucun ajustement de dictionnaire ne peut résoudre ça sans risquer de fausses fusions — voir §13.5. |
| Variante technique nommée d'un mouvement déjà couvert | ~14 % | Nom, muscle, équipement et catégorie concordent fortement (score souvent 0.65–0.80), mais il s'agit de variantes techniques distinctes (hack squat, squat Zercher, squat sauté, développé jefferson, soulevé de terre unilatéral…). Fusionner automatiquement risquerait de confondre des mouvements réellement différents — **décision de contenu qui nécessite un jugement humain** (créer une entrée dédiée ou l'aliaser au mouvement générique), pas un manque de traduction. |
| Traduction partielle, aucun signal d'appoint | ~1,5 % | Vrai manque de dictionnaire résiduel (peu de cas restants après les ajouts de §13.3). |
| Cas mixtes | ~24 % | Combinaisons de signaux partiels sans cause dominante claire, à examiner au cas par cas. |

Ce même classement (recalculé après les améliorations, 754 lignes) est disponible entièrement filtrable dans le rapport interactif : https://claude.ai/code/artifact/ac5c768e-8f36-46d2-8a18-ee9a04ade097

### 13.3 Améliorations apportées (dictionnaire uniquement — aucun seuil modifié)

Toutes vérifiées par test unitaire (`exerciseTranslations.test.ts`) et par re-exécution empirique du dry-run réel — pas de simple estimation.

1. **Correction d'un mauvais rapprochement** : `"barbell sumo deadlift"` partait vers *"Soulevé de terre roumain barre"* au lieu de *"Soulevé de terre sumo"* (qui existe pourtant déjà dans Cortex), parce que cette dernière ligne n'a ni le mot "barre" dans son nom (heuristique équipement muette) ni une catégorie qui recoupe le vocabulaire muscle du dataset. Ajout d'une entrée de traduction exacte `"barbell sumo deadlift" → "Soulevé de terre sumo"` : corrige la cible ET obtient un score de 1 (fusion automatique).
2. **Vocabulaire générique manquant, découvert en comparant aux vraies valeurs du dataset** (1 324 enregistrements analysés directement, pas une supposition) :
   - `"lever"` et `"sled"` → `"machine"` — préfixes génériques du dataset (convention ExerciseDB) présents dans 72 et 13 noms d'exercice respectivement, jusque-là non traduits.
   - `"kneeling"` → `"à genoux"`, `"rear"` → `"arrière"`, `"twist"` → `"rotation"`.
   - Muscles : `"spine"` → `"dos"` (19 occurrences), `"cardiovascular system"` → `"cardio"` (29 occurrences, relie enfin les exercices cardio du dataset à la catégorie "Cardio" de Cortex), `"serratus anterior"`/`"levator scapulae"` → `"épaules"`.
   - Équipements : `"sled machine"` → `"machine"` (15 occurrences), `"assisted"` → `"machine assistée"` (15 occurrences), `"roller"`/`"wheel roller"` → `"roue abdominale"`, `"bosu ball"` → `"bosu"`.
3. **Deux synonymes exacts supplémentaires vérifiés** : `"barbell full squat" → "Squat barre"`, `"cable kneeling crunch" → "Crunch câble"` (définition standard du "cable crunch").
4. **Régression détectée et corrigée avant livraison** : une tentative d'ajout `"front" → "avant"` a été testée puis retirée après avoir cassé 2 fusions existantes — "front" est aussi un mot **français** déjà produit par une autre règle (`"lying triceps extension" → "Barre au front"`, skull crusher). La substitution en cascade repassait sur ce "front" français fraîchement inséré et le corrompait en "barre au avant". Un test de non-régression verrouille désormais ce cas précis (`exerciseTranslations.test.ts`). Cet incident illustre une règle générale ajoutée en commentaire dans le code : toute nouvelle entrée EN->FR doit être vérifiée contre les sorties françaises déjà produites par le dictionnaire.
5. **Exploitation des données existantes de Cortex (§13.4)** : aucune amélioration de dictionnaire n'en a résulté (voir constat négatif ci-dessous), mais l'exploration était nécessaire et honnête à rapporter.

**Aucun changement n'a touché `AUTO_MERGE_THRESHOLD`, `CREATE_NEW_THRESHOLD`, ni les poids de `scoreCandidate`** — uniquement les dictionnaires de traduction (`exerciseTranslations.ts`). C'est une contrainte volontaire : une correction du classement des candidats (traiter une donnée absente comme "neutre" plutôt que "0") a été envisagée puis écartée après analyse, car elle aurait pu, dans certaines configurations, permettre à un seul signal d'appoint disponible de compter comme si tous l'étaient — cassant l'invariant "les 4 signaux d'appoint combinés ne peuvent jamais, seuls, atteindre le seuil de fusion automatique". Le gain se fait donc exclusivement par le vocabulaire, jamais par la mécanique de score.

### 13.4 Exploitation des données existantes de Cortex — ce qui a été trouvé (et ce qui ne l'a pas été)

Explorations en lecture seule (aucune requête d'écriture) :

- **`exercises` (historique des séances, jointes à `exercise_reference` via `exercise_reference_id`)** : pour les 84 exercices `muscu` déjà utilisés en séance, les libellés historiquement journalisés sont — sans exception constatée — identiques (à la casse près) au nom canonique `exercise_reference.name`. **Constat négatif honnête** : il n'existe aucune variante de nom exploitable comme alias supplémentaire, parce que `ExerciseResolutionService` (voir `exercise-central-architecture.md` §4.1) normalise déjà tout au moment de l'écriture depuis la Phase 3 — il n'y a pas de réservoir caché de synonymes à exploiter côté séances.
- **`workout_template_exercises` (programmes/modèles)** : même constat — les noms utilisés dans les modèles sont ceux du catalogue, aucune variante.
- **`exercise_history`** (table write-only, jamais lue en production — voir dette 10.1 de `exercise-central-architecture.md`) : **seule source où une vraie variance de libellé existe**, car elle échappe à la résolution d'identité (ex. "Étirements & Retour au Calme" vs "Retour au calme & Étirements" dans le catalogue, ordre des mots inversé). Ces variantes concernent presque exclusivement des blocs de cours collectifs (Pilates, échauffement, retour au calme) sans équivalent dans un dataset de musculation anglophone — utile pour la recherche interne future, sans effet sur le matching EN->FR de cette intégration.
- **`exercises.muscle_groups`** (colonne IA pour les exercices personnalisés) : donnée disponible pour une poignée de lignes `exercise_reference` actuellement sans `category` (ex. "Farmer's Carry" → `[abdos, avant-bras, lombaires, trapèze]`, "Développé convergent à la poulie" → `[épaules, pectoraux, triceps]`). Piste réelle mais de faible volume (moins de 10 lignes concernées) : pourrait servir à *backfill* le signal muscle de ces lignes précises pour un futur import — non appliqué ici (ce serait une écriture sur `exercise_reference`, hors périmètre d'une phase d'analyse), simplement documenté comme amélioration possible avant un import réel si souhaité.
- **Favoris** : aucune table de favoris n'existe pour les exercices dans Cortex aujourd'hui (seules `food_favorites`/`nutrition_favorites` existent, côté nutrition) — signal absent, constaté plutôt qu'inventé.
- **Programmes (`training_programs`/`program_weeks`)** : aucune référence d'exercice (ces tables décrivent la structure de périodisation, pas les exercices eux-mêmes) — sans signal exploitable ici.

### 13.5 Nouveau dry-run — résultats mesurés

| Indicateur | Avant (28/07) | Après (30/07) | Delta |
|---|---|---|---|
| Fusionnés automatiquement | 37 | **48** | **+11 (+30 %)** |
| Nouveaux exercices à créer | 537 | 522 | −15 |
| Nécessitant une validation manuelle | 750 | 754 | +4 |
| Doublons évités | 37 | 48 | +11 |
| Régressions constatées | — | **0** | vérifié empiriquement (comparaison ligne à ligne des 37 fusions initiales) |

La légère hausse de la file de revue (+4) et la baisse des créations (−15) s'expliquent par les ajouts muscle/équipement (`spine`, `cardiovascular system`, `sled machine`, `assisted`) : quelques exercices auparavant classés `create_new` par manque total de signal ont désormais un score juste suffisant pour basculer en `needs_review` — un exercice de plus à valider manuellement plutôt que créé à l'aveugle est le comportement voulu, pas une régression.

### 13.6 Pourquoi le taux de fusion reste-t-il "faible" — réponse précise

Trois causes structurelles distinctes, par ordre de poids réel (voir §13.2) :

1. **Différences entre noms d'exercices — en grande partie résolu.** C'était la plus grosse source d'échec avant le renforcement du dictionnaire (aucune traduction ⇒ aucun rapprochement possible). Après §13.3, cette cause ne représente plus qu'environ 1,5 % des cas restants (bucket "traduction partielle, aucun signal"). Il reste toujours un plancher irréductible : un dictionnaire écrit à la main ne peut jamais couvrir 100 % des phrasés possibles de 1 324 noms sans accepter un risque de sur-généralisation — ce plancher est faible mais non nul.
2. **Granularité du catalogue Cortex — la cause dominante, ~44 % des cas combinés (30 % granularité + 14 % variantes nommées).** Cortex ne compte qu'une ligne générique par mouvement de base pour la plupart des familles d'exercices (un seul "Squat barre", un seul "Soulevé de terre roumain barre", un seul "Crunch câble"), alors que le dataset externe encode des dizaines de variantes techniques nommées par famille (squat : complet, hack, Zercher, sauté, rapide, jambes écartées, prise étroite, barre haute/basse… ; deadlift : sumo, roumain, jambe tendue, unilatéral…). Ce n'est pas un défaut du dataset ni de Cortex — c'est un **écart de granularité entre les deux référentiels**, qui ne peut être comblé ni par plus de traduction ni par un seuil plus bas, seulement par une décision de contenu (créer les variantes comme exercices distincts, ou les aliaser sciemment au mouvement générique, famille par famille) — un travail éditorial, pas un bug d'algorithme.
3. **Qualité/nature du catalogue Cortex actuel — cause secondaire mais réelle.** ~35 des 167 lignes `muscu` existantes ont une `category` NULL et sont, à l'examen, des blocs de cours collectifs (Pilates, échauffement, retour au calme, "Bloc Jambes & Fessiers (ex: Megaformer Lunges…)") — **pas des exercices de musculation au sens du dataset**, qui ne peuvent structurellement trouver aucune correspondance pertinente dans un dataset anglophone de renforcement musculaire. Elles gonflent légèrement le dénominateur "167 exercices existants" sans être de vraies cibles de fusion possibles.
4. **Aucune contrainte technique ni limite du moteur lui-même** n'explique le niveau observé : le garde-fou de sécurité (poids des signaux d'appoint plafonné à 0.45) fonctionne exactement comme conçu, et aucun signal disponible côté Cortex (séances, programmes, historique) n'a révélé de synonymes supplémentaires à exploiter (voir constat négatif §13.4) — la limite n'est donc ni un bug ni un manque d'exploitation des données, mais la conséquence directe et mesurée des deux causes ci-dessus.

**Recommandation** : ne pas chercher à pousser le taux de fusion automatique plus haut en assouplissant l'algorithme. Les ~104 "variantes techniques nommées" identifiées (§13.2) sont le seul levier restant à fort volume, et leur traitement correct exige un choix éditorial (nouvel exercice vs alias) fait par Nathan, famille par famille — un travail de curation de contenu, pas une tâche d'ingénierie supplémentaire. Le rapport interactif (§13.2) permet de filtrer précisément cette catégorie pour engager ce travail si souhaité.

---

## 14. Bibliothèque d'exercices — administration, multi-média, fusion manuelle (2026-07-31)

**Changement de stratégie demandé par Nathan**, remplaçant le modèle de décision automatique (auto_merge/needs_review/create_new, §2-§3) par un principe plus strict :

> Cortex reste **toujours** la source de vérité. Le dataset externe n'est qu'une source d'enrichissement. **Aucune fusion n'est plus jamais automatique**, quel que soit le score de similarité — chaque enregistrement du dataset devient une fiche `exercise_reference` indépendante (hors doublons techniques évidents), et toute fusion avec l'existant est une décision manuelle prise depuis une interface d'administration.

Le moteur de scoring à 5 signaux (§3) et la couche de traduction (§3bis) ne sont **pas jetés** : ils sont réutilisés tels quels pour calculer des **suggestions de similarité**, jamais pour décider d'une fusion.

### 14.1 Nouveau schéma (migration `20260731120000_exercise_library_admin.sql`, additive, non appliquée à la prod)

- **`exercise_families`** — regroupement d'affichage ("Développé couché" → barre/haltères/incliné/décliné/prise serrée...). `exercise_reference.family_id` (nullable) y pointe. Une famille ne change jamais l'identité d'un exercice (voir invariant §12.1 de `exercise-central-architecture.md` — `exercise_reference` reste l'unique référentiel) : c'est un regroupement de navigation, jamais un mécanisme de comparaison.
- **`exercise_reference.archived_at` / `merged_into_id`** (nouvelles colonnes) — support de l'archivage (soft delete, jamais physique) et de la traçabilité d'une fusion.
- **`exercise_media`** — remplace la limite "une seule image" : plusieurs photos/GIF/vidéos par exercice, un seul média "principal" par type (contrainte d'unicité partielle), `source` ('cortex'/'dataset') conservée pour l'audit. La colonne `media` (jsonb) existante n'est ni lue ni écrite par le nouveau code — elle reste un résumé legacy.
- **`exercise_similarity_pairs`** — suggestions de similarité entre deux `exercise_reference` (`exercise_id_a < exercise_id_b` pour l'unicité), `status` ('suggested'/'dismissed'/'merged'). Alimentée par le job `detect-exercise-similarities`, jamais appliquée automatiquement.
- **`exercise_merge_log`** — journal complet de chaque fusion manuelle : état exact avant fusion des deux lignes, IDs précis de toutes les lignes déplacées (`exercises`, `workout_segments`, `user_exercise_illustrations`, `exercise_media`) — permet une **annulation exacte**, jamais approximative.
- **Fonctions SQL `SECURITY DEFINER`** (exécutables uniquement par `service_role`, jamais par un client direct) :
  - `merge_exercise_references(keep_id, archive_id)` — repointe toutes les références vers `keep_id` (contrairement au rollback d'import qui met à NULL, ici on **repointe** : l'historique de l'exercice archivé continue de compter sous l'identité conservée), enrichit `keep_id` de façon additive (jamais n'écrase une valeur déjà présente), archive `archive_id` (`is_active=false`), journalise dans `exercise_merge_log`.
  - `undo_exercise_merge(merge_log_id)` — restaure exactement l'état d'avant fusion des deux lignes et ne redéplace que les lignes précisément journalisées par CETTE fusion.
  - `archive_exercise_reference` / `restore_exercise_reference` — archivage/restauration autonomes (hors fusion), toujours réversibles.
  - `delete_exercise_reference_if_unused` — suppression physique **uniquement** si l'exercice n'est référencé nulle part (séances, segments, photos, fusion) ; sinon ne fait rien et retourne `false` — ne supprime jamais une donnée utilisateur.

### 14.2 Import — nouvelle philosophie "bibliothèque complète"

`import-exercises-dataset` réécrit : ne calcule plus de score de correspondance avec l'existant. Pour chaque enregistrement du dataset :
1. Filtre les **doublons techniques évidents** (`_shared/exerciseDatasetDedup.ts`) — même exercice répété avec un simple marqueur de démonstration différent (angle caméra "(back pov)", version "v. 2", genre du modèle "(male)"/"(female)") — ne touche jamais deux enregistrements dont le nom diffère au-delà de ces marqueurs.
2. Crée une ligne `exercise_reference` **indépendante** (jamais un enrichissement d'une ligne Cortex existante) avec un nom canonique français (traduction exacte/phrase, comme avant). En cas de collision de nom avec une ligne déjà existante (Cortex ou dataset déjà importé dans ce run), désambiguïse en ajoutant le nom anglais d'origine entre parenthèses plutôt que d'échouer ou de fusionner silencieusement.
3. Crée les entrées `exercise_media` (photo + GIF, `source='dataset'`) associées.
4. Journalise la ligne créée (`exercise_reference_import_created`, mécanisme déjà existant) pour une restauration exacte via `restore-exercises-dataset-import`.

`dry_run: true` par défaut — toujours aucune écriture sans demande explicite. Le rapport dry-run (§11) reste valable pour les compteurs globaux, adapté aux trois issues désormais possibles : créé / doublon technique ignoré / nom vide ignoré (il n'y a plus d'issue "fusionné" à ce stade).

### 14.3 Détection de similarité — un job séparé, jamais un déclencheur de fusion

Nouvelle edge function `detect-exercise-similarities` (auth `CRON_SECRET`/service role, job batch comme `cleanup-pdfs`) : calcule `scoreExercisePair(a, b)` (nouvelle fonction dans `_shared/exerciseDatasetMatching.ts`, adapte un exercice Cortex en pseudo-enregistrement dataset pour **réutiliser `scoreCandidate` sans dupliquer la logique**) pour toutes les paires d'exercices `muscu` actifs, et enregistre celles au-dessus d'un seuil (`min_score`, défaut 0.5) dans `exercise_similarity_pairs` (`status='suggested'`). Ne réécrit jamais une paire déjà tranchée manuellement (`dismissed`/`merged`). `dry_run: true` par défaut. Coût O(n²) documenté : pour ~1 500 exercices (167 Cortex + ~1 300 dataset), environ 1,1 million de paires à évaluer — acceptable pour un job d'administration ponctuel, pas conçu pour tourner à chaque requête.

### 14.4 Interface d'administration

Route `/admin/exercises` (`src/routes/_authenticated/admin/exercises.tsx`), trois onglets :
- **Recherche & fusion** — recherche par nom, bascule "inclure les archivés", sélection de deux exercices pour comparaison côte à côte (catégorie, muscle principal, équipement, alias, source), score de similarité calculé à la volée côté client (`compareExercises`, réutilise `scoreExercisePair`), bouton "Fusionner" avec choix explicite de la fiche conservée, boutons Archiver/Restaurer/Supprimer par ligne.
- **Suggestions de similarité** — liste triée par score des paires `exercise_similarity_pairs` en attente, actions Fusionner / Ignorer.
- **Fusions récentes** — journal des fusions avec bouton Annuler par entrée non déjà annulée.

Toutes les mutations passent par l'edge function `admin-exercise-actions` (jamais un accès en écriture direct depuis le client — RLS de ces tables = `service_role` uniquement).

**Authentification admin** (`_shared/adminAuth.ts`) : ce n'est PAS le pattern `CRON_SECRET` des jobs batch — l'action est déclenchée par un utilisateur Cortex authentifié depuis le navigateur. `requireAdminUser` vérifie que le JWT Supabase Auth de l'appelant correspond à l'email autorisé. Cet email est **en dur dans le code** (`DEFAULT_ADMIN_EMAIL = "Turneur555@gmail.com"`), avec repli possible sur un secret Supabase `ADMIN_EMAIL` s'il est posé plus tard (`Deno.env.get("ADMIN_EMAIL") ?? DEFAULT_ADMIN_EMAIL`) — décision prise le 2026-07-31 (voir §15) pour qu'**aucune étape manuelle de configuration de secret ne soit nécessaire après le merge**. Mis à jour le 2026-07-29 : l'email autorisé est passé de `attal.nathan@gmail.com` à `Turneur555@gmail.com` (même logique, même unique compte administrateur — voir aussi le gate client dans `src/routes/_authenticated/admin/exercises.tsx`, qui doit toujours rester identique à cette valeur). `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement par la plateforme Supabase pour toute edge function déployée, sans configuration. **Limite assumée et documentée** : Cortex n'a aujourd'hui aucun système de rôle ; cet allow-list par email est un garde-fou minimal suffisant pour une application à propriétaire unique, à remplacer par un vrai système de rôles si Cortex accueille un jour plusieurs comptes avec des droits différents (même limite déjà documentée en §4 et dans `exercise-central-architecture.md` §12).

### 14.5 Ce qui n'a volontairement pas été construit dans cette itération

- **Gestion fine des médias depuis l'UI** (réorganiser, choisir le principal, supprimer/ajouter un média un par un) : le schéma (`exercise_media`, `is_primary`, `sort_order`) et le hook de lecture (`useExerciseMedia`) sont prêts, mais l'UI de gestion média n'a pas été construite dans cette passe (priorité donnée à recherche/comparaison/fusion/historique, le cœur de la demande). À ajouter dans une itération suivante sur cette même fondation.
- **Attribution de famille depuis l'UI** : `exercise_families`/`family_id` existent en base, sans écran dédié pour les assigner — même remarque, fondation posée, UI à construire ensuite.
- **UI de resurrection en cas de sélection de plus de 2 exercices dans le workflow "similaires"** : la comparaison reste volontairement limitée à une paire à la fois (cohérent avec "comparer deux fiches côte à côte" demandé).

### 14.6 Tests

- `exerciseDatasetDedup.test.ts` (8 cas) — détection des doublons techniques sur les cas réels observés lors de l'analyse §13 (pov/version/genre), non-fusion de deux variantes réellement distinctes, distinction par équipement.
- `exerciseDatasetMatching.test.ts` — 4 nouveaux cas pour `scoreExercisePair` (similarité forte, recherche dans les alias, score faible, confirmation que la fonction ne fait que scorer, jamais fusionner).
- Suite complète, `tsc --noEmit`, `npm run build` (généère `routeTree.gen.ts` avec la nouvelle route), `eslint`, `validate:supabase` : tous verts.

### 14.7 Runbook (mis à jour) — déploiement entièrement automatisé au merge

**Décision du 2026-07-31** (voir §15) : le merge sur `main` doit rendre la fonctionnalité entièrement
opérationnelle sans aucune étape manuelle. Deux ajustements ont été faits pour que ce soit vrai :

1. `.github/workflows/deploy-functions.yml` déploie désormais aussi `import-exercises-dataset`,
   `restore-exercises-dataset-import`, `detect-exercise-similarities` et `admin-exercise-actions` —
   ce workflow tourne sur tout push vers `main` touchant `supabase/functions/**`, donc automatiquement
   au merge.
2. `ADMIN_EMAIL` n'est plus un secret à poser à la main : email en dur dans `_shared/adminAuth.ts`
   avec repli sur un secret du même nom si posé plus tard (voir §14.4).

Séquence automatique déclenchée par le merge (aucune commande à taper) :
- `migrate.yml` (job `migrate`, condition `push sur main`) applique la migration.
- `supabase-types.yml` (job `fix-push`) régénère et committe `types.ts`.
- `deploy-functions.yml` déploie les 4 edge functions ci-dessus.
- Le frontend (route `/admin/exercises`) est live dès le déploiement habituel de l'app.

**Ce qui reste volontairement manuel** : l'import réel du dataset. `dry_run: true` par défaut dans
`import-exercises-dataset` — aucun cron, aucun déclencheur automatique ne l'appelle. Seul un appel
explicite `{"dry_run": false}` (ou un clic futur dans l'UI, non construit) écrit quoi que ce soit.

```bash
# 1) Dry-run import (toujours en premier, aucune écriture)
curl -X POST .../import-exercises-dataset -d '{"dry_run": true}'
# 2) Import réel (après validation du dry-run)
curl -X POST .../import-exercises-dataset -d '{"dry_run": false}'
# 3) Calcul des suggestions de similarité (une fois le catalogue importé)
curl -X POST .../detect-exercise-similarities -d '{"dry_run": false}'
# 4) Traitement des suggestions depuis /admin/exercises — jamais automatique
```

**Aucune étape ci-dessus n'a été exécutée dans cette session** — migration écrite mais non appliquée à la production, aucune donnée réelle modifiée, conformément à la demande explicite de Nathan.

## 15. Vérification pré-merge (2026-07-31, demande explicite de Nathan)

Avant de fusionner la branche `claude/cortex-exercises-dataset-integration-kajkk7` sur `main`,
Nathan a demandé une confirmation explicite que le merge rend la fonctionnalité **entièrement
opérationnelle sans aucune étape manuelle**, sauf l'import du dataset lui-même (qui doit rester
une décision manuelle). Vérification faite en lisant les workflows CI réels (pas une supposition) :

- **`migrate.yml`** — le job `migrate` (`if: github.ref == 'refs/heads/main' && github.event_name
  != 'pull_request'`) exécute `supabase db push --include-all` sur tout push vers `main` touchant
  `supabase/migrations/**`. **Le merge applique donc automatiquement la migration à la production**
  — ce n'est pas une étape manuelle en attente, c'est un déclenchement automatique du merge lui-même.
  Migration vérifiée strictement additive (aucun `DROP TABLE`/`DROP COLUMN`/`TRUNCATE`, les seuls
  `DELETE` sont à l'intérieur de `delete_exercise_reference_if_unused`, qui ne s'exécute que sur
  appel explicite depuis l'UI, jamais pendant l'application de la migration) et idempotente
  (`validate:supabase` vert).
- **`supabase-types.yml`** — régénère et committe `types.ts` automatiquement après application de
  la migration (comportement CI préexistant, pas modifié ici).
- **`deploy-functions.yml`** — **gap réel trouvé** : liste explicite de fonctions déployées, qui
  n'incluait aucune des 4 fonctions de cette fonctionnalité. Corrigé (ajout de
  `import-exercises-dataset`, `restore-exercises-dataset-import`, `detect-exercise-similarities`,
  `admin-exercise-actions` à la liste) — sans ce correctif, le merge aurait appliqué le schéma mais
  laissé les edge functions non déployées, nécessitant 4 commandes manuelles.
- **`_shared/adminAuth.ts`** — **gap réel trouvé** : dépendait d'un secret Supabase `ADMIN_EMAIL`
  jamais posé, ce qui aurait rendu `admin-exercise-actions` inopérante (500 systématique) après un
  déploiement pourtant réussi. Corrigé : email autorisé en dur dans le code
  (`DEFAULT_ADMIN_EMAIL`), avec repli sur un secret du même nom s'il est posé plus tard — aucune
  configuration manuelle requise pour un fonctionnement immédiat.
- **Import du dataset** — confirmé qu'aucun mécanisme (cron, trigger, appel automatique) ne
  l'exécute : `dry_run: true` reste le comportement par défaut de `import-exercises-dataset`, et rien
  dans le déploiement ne l'invoque. Reste, comme voulu, une action 100 % manuelle et déclenchée par
  Nathan.

Après ces deux corrections, vérifié à nouveau : `tsc --noEmit`, suite de tests complète (499 tests),
`eslint`, `validate:supabase`, et validité YAML du workflow modifié — tous verts.

**Incident détecté par la CI de la PR #24, avant merge** : `main` a reçu entre-temps une migration
d'une autre PR (`20260728120000_custom_food_barcode_creation.sql`) portant **le même horodatage**
que `20260728120000_exercises_dataset_enrichment.sql` de cette branche — collision invisible en local
(chaque branche ne voyait que ses propres migrations) mais détectée par le job `Validate migrations
(static)` de `migrate.yml`, qui s'exécute sur le commit de fusion réel de la PR. Corrigé en
renommant le fichier de cette branche en `20260728123000_exercises_dataset_enrichment.sql` (contenu
inchangé, seul l'horodatage change, ordre chronologique préservé par rapport aux migrations
suivantes de cette même fonctionnalité). Reproduit puis vérifié résolu via une fusion locale de test
(`git worktree` + `git merge --no-commit`) avant de pousser le correctif — le mécanisme de
vérification pré-merge (§15) a fonctionné exactement comme prévu : aucune régression n'a atteint
`main`.

## 16. Enrichissement de l'interface admin (2026-07-29, premier retour utilisateur post-merge)

Après le premier merge de la bibliothèque d'exercices, Nathan a testé l'interface `/admin/exercises`
et remonté deux incidents (corrigés séparément, voir historique de commits `f45cc20`/`83312a8` —
email admin remplacé + bug de casse sur le gate client) puis demandé cinq améliorations d'usage,
implémentées ici :

- **Groupe musculaire jamais vide** — `src/lib/fitness/muscleGroupInference.ts` (nouveau, testé).
  `resolveMuscleGroup` : `category` existante → `config.muscle_group` (futur enrichissement
  dataset) → déduction depuis le nom (réutilise `exerciseToMuscles`/`MUSCLE_META` de
  `muscleMapping.ts`, aucune règle dupliquée) → repli neutre `"Non catégorisé"`. Deux angles morts
  du moteur partagé corrigés localement, sans toucher `muscleMapping.ts` (utilisé par le calcul de
  récupération musculaire, hors périmètre de cette demande) : rotations d'épaule anciennement
  happées par la règle générique "oblique|rotation", et "développé" non qualifié (ex. "Développé
  convergent") qui ne matchait aucune règle pectoraux existante.
- **Backfill des données existantes** — migration `20260802120000_backfill_exercise_category.sql` :
  60 exercices Cortex sans `category` (essentiellement des blocs extraits de PDF de programmes)
  corrigés un par un (UPDATE nominatif, idempotent sur `category IS NULL`), chaque valeur vérifiée
  manuellement contre le nom réel plutôt qu'une règle générique appliquée en aveugle. Vérifié par
  requête en lecture seule contre la production avant merge (60/60 noms correspondent exactement).
  Portée strictement `category` — aucune séance/série/répétition/charge/record touchée.
- **Statistiques d'usage** — nouvelle action `usage_stats` sur l'edge function
  `admin-exercise-actions` (service_role) : nombre de séances distinctes + utilisations totales +
  "a déjà été fusionné" par exercice. Ne peut pas passer par un accès client direct : `exercises`
  est en RLS "propriétaire uniquement", un accès direct n'agrégerait que les séances de la personne
  connectée. Hook `useExerciseUsageStats`.
- **Présence de médias en un coup d'œil** — `useExerciseMediaSummary` (accès client direct,
  `exercise_media` est lisible par tout le monde) : badges Photo/GIF/Vidéo sur chaque ligne de la
  liste, seulement quand au moins un média du type existe.
- **Provenance affichée partout** — `deriveExerciseOrigin` : Cortex / Dataset / Fusionné (Fusionné
  si l'exercice a déjà reçu une fusion non annulée via `exercise_merge_log`), utilisé aussi bien
  dans la liste que dans la comparaison.
- **Comparaison avant fusion enrichie** — `CompareCard` affiche désormais, pour chaque fiche :
  provenance, compteurs de médias par type, groupe musculaire (résolu), muscles secondaires,
  équipement, catégorie, instructions, alias, variantes (même famille ou non) — et un bandeau
  recalculé à chaque changement de sélection indiquant precisément quels champs seront complétés
  sur la fiche conservée (reflète exactement la logique additive `coalesce` de
  `merge_exercise_references` : seuls les champs `NULL` de la fiche conservée sont complétés,
  jamais un remplacement).
