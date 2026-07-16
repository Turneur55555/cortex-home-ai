# Slugs de repas (`nutrition.meal`)

## Incident de référence

Le 16/07/2026, insérer un aliment dans « Goûter » échouait en production avec
l'erreur Postgres `new row for relation "nutrition" violates check constraint
"nutrition_meal_check"` (code `23514`). Cause : le frontend, plusieurs Edge
Functions et la contrainte SQL avaient chacun leur propre liste de slugs de
repas, et une migration ajoutant `gouter` à la contrainte existait dans le
repo mais n'avait jamais été appliquée en production — pendant que le
frontend proposait déjà « Goûter » dans ses menus. Ce document et les
garde-fous qu'il décrit existent pour que ça ne se reproduise pas.

## Source unique de vérité

**`supabase/functions/_shared/meals.ts`** est la définition canonique de
`MEAL_SLUGS` (et de `MealSlug`, `isMealSlug`). C'est la seule liste à
modifier pour ajouter, renommer ou retirer un repas.

Deux consommateurs, aucune duplication :

- **Edge Functions** (`scan-meal`, `parse-meal-text`, `analyze-image`,
  `analyze-pdf`) importent directement `../_shared/meals.ts` (import Deno
  relatif classique — voir [la doc Supabase sur le partage de code entre
  fonctions](https://supabase.com/docs/guides/functions/import-maps#sharing-code)).
- **Le frontend** (`src/lib/nutrition/meals.ts`) réexporte `MEAL_SLUGS` /
  `MealSlug` / `isMealSlug` depuis ce même fichier via un import relatif
  inter-dossiers (`../../../supabase/functions/_shared/meals.ts`), permis par
  `allowImportingTsExtensions` dans `tsconfig.json`. Ce fichier frontend
  ajoute uniquement ce qui est propre à l'UI : `MEAL_LABELS` (libellés FR),
  `MEAL_OPTIONS` (pour les `<select>`), et les helpers de bornage des macros
  (`clampMacroSet`, `scalePer100`, sans rapport avec les slugs).

Pourquoi ce sens de dépendance (frontend → Edge Functions) plutôt que
l'inverse : les Edge Functions tournent sous Deno et sont déployées par CLI
(`supabase functions deploy`), qui ne suit que le graphe d'imports relatifs
sous `supabase/functions/`. Faire dépendre les Edge Functions de `src/`
risquerait de casser le déploiement CI sans avertissement avant le prochain
push sur `main`. Le frontend, lui, est buildé par Vite qui n'a pas cette
contrainte — `npm run build` et `npm run typecheck` valident immédiatement
que la réexport fonctionne.

La contrainte SQL `nutrition_meal_check` (voir plus bas) autorise en plus un
alias historique, `petit-dejeuner`, conservé uniquement pour ne pas casser
les lignes déjà en base écrites avant le renommage en `petit-dej`. Cet alias
**n'est volontairement pas dans `MEAL_SLUGS`** : aucun nouveau code ne doit
jamais l'écrire.

## Comment ajouter un nouveau repas

1. Ajoute le slug à `MEAL_SLUGS` dans `supabase/functions/_shared/meals.ts`.
2. Ajoute son libellé FR à `MEAL_LABELS` dans `src/lib/nutrition/meals.ts`.
3. Écris une migration SQL qui recrée `nutrition_meal_check` en incluant le
   nouveau slug (`DROP CONSTRAINT IF EXISTS` puis `ADD CONSTRAINT` avec le
   tableau complet — voir
   `supabase/migrations/20260716124014_fb1c66b5-2ed6-4855-a3b3-20229e7925d1.sql`
   pour un exemple). **Applique-la en production** (`supabase db push` ou
   équivalent) — l'avoir dans le repo ne suffit pas, c'est exactement ce qui
   a causé l'incident du 16/07/2026.
4. Lance `npm test -- src/lib/nutrition/meals.sync.test.ts` : il échoue tant
   que la migration n'est pas cohérente avec `MEAL_SLUGS`.
5. Régénère les types Supabase si le schéma de colonnes a changé (voir
   ci-dessous) — pas nécessaire pour une simple valeur autorisée en plus
   dans une contrainte CHECK, `nutrition.meal` reste typé `string | null`
   côté généré.
6. Déploie les Edge Functions concernées (`scan-meal`, `parse-meal-text`,
   `analyze-image`, `analyze-pdf`) — automatique au prochain push sur `main`
   via `.github/workflows/deploy-functions.yml` si un fichier sous
   `supabase/functions/` a changé.

## Comment retirer ou renommer un repas

Ne **jamais** retirer une valeur de la contrainte SQL tant que des lignes en
base l'utilisent encore (migration de données d'abord, contrainte ensuite).
Ajoute l'ancienne valeur à une liste d'alias legacy documentée (comme
`petit-dejeuner` aujourd'hui) plutôt que de la supprimer silencieusement.

## Régénérer les types Supabase générés

`src/integrations/supabase/types.ts` est régénéré (ou corrigé à la main en
son absence) après toute migration qui change les colonnes, tables ou types
d'une table — pas après un simple changement de valeurs autorisées dans un
`CHECK`. Pour régénérer :

```
supabase gen types typescript --project-id bcwfvpwxzlmkxobvbtzp > src/integrations/supabase/types.ts
```

ou via l'outil MCP `generate_typescript_types` si disponible dans la session.
Vérifie ensuite `npm run typecheck` et `npm run build`.

## Garde-fous automatiques

- **`src/lib/nutrition/meals.test.ts`** — tests unitaires : chaque slug
  valide est accepté, valeurs invalides rejetées (null, vide, espaces,
  casse, accents, alias legacy, anglais, injection SQL…).
- **`src/lib/nutrition/meals.sync.test.ts`** — garde-fou anti-dérive :
  frontend et Edge Functions résolvent exactement la même liste ; chaque
  valeur de `MEAL_SLUGS` est autorisée par la contrainte SQL la plus
  récente ; aucune liste dupliquée de slugs de repas ailleurs dans le repo.
- **`src/lib/nutrition/nutritionMealCheck.test.ts`** — test d'intégration
  (nécessite `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`,
  `skip` sinon) : insertion réelle d'un aliment par repas valide, rejet
  d'une valeur invalide avec le code Postgres `23514`, déplacement d'un
  aliment entre chaque paire de repas (fonctionnalité « déplacer vers »).
- **`.github/workflows/meal-slugs-check.yml`** — exécute ces tests en CI sur
  toute PR/push touchant les fichiers de repas ou les migrations.
- **`.husky/pre-commit`** — exécute les mêmes tests localement avant tout
  commit qui touche un fichier lié aux repas.

Ces quatre garde-fous ne peuvent PAS empêcher un développeur d'oublier
d'*appliquer* une migration écrite en production (ils valident le contenu du
repo, pas l'état de la base distante) — c'est la cause exacte de l'incident
du 16/07/2026. Vérifie toujours `supabase migration list` (ou l'outil MCP
`list_migrations`) après avoir écrit une migration pour confirmer qu'elle
est bien appliquée au projet distant, pas seulement présente dans le repo.
