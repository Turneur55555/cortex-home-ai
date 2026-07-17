# Types Supabase — la base de données est la source de vérité

> Dette technique résolue le 17/07/2026. Objectif : rendre **impossible** une
> régression silencieuse de `src/integrations/supabase/types.ts`.

## Le problème (cause racine)

Toute l'application est typée via **un seul** point : `src/integrations/supabase/client.ts`
fait `createClient<Database>` où `Database` vient de `src/integrations/supabase/types.ts`.

Ce fichier était régénéré par **Lovable** à partir de sa propre connaissance du schéma —
**pas de la base réelle**. Les tables créées par **nos** migrations (`supabase/migrations/*.sql`,
appliquées à la base par l'Action `migrate.yml`, hors du circuit Lovable) lui étaient inconnues,
donc **effacées à chaque régénération**. Comme Lovable pousse directement sur `main` (sans PR) et
que le typecheck CI ne tournait que sur des chemins étroits, la casse passait **inaperçue**.

Résultat : 3 incidents où `workout_analyses`, `xp_events`, `seasons`, `sp_events`,
`user_season_progress` ont disparu, cassant la prod, réparés à la main.

## Les principes

1. **La base de données est la source de vérité unique.** `types.ts` est un **artefact généré**,
   jamais une source à éditer.
2. **Génération officielle uniquement.** Les types se produisent via la CLI Supabase
   (`supabase gen types typescript --project-id … --schema public`) — aucune extension manuelle.
3. **Aucune réparation silencieuse.** La CI ne corrige/committe jamais à notre place : elle
   **échoue** avec un message explicite si `types.ts` ne correspond plus à la base.
4. **Détection immédiate.** Toute divergence (table/colonne manquante ou en trop) casse la CI
   de façon visible et traçable.

## Comment (re)générer les types

```bash
# nécessite SUPABASE_ACCESS_TOKEN dans l'environnement
npm run gen:types      # régénère src/integrations/supabase/types.ts depuis la base
git add src/integrations/supabase/types.ts && git commit -m "chore(types): régénère depuis la base"
```

Ne **jamais** éditer `types.ts` à la main. Pour ajouter une table :
1. écrire la migration (`supabase/migrations/…sql`) ;
2. merger sur `main` → `migrate.yml` l'applique à la base ;
3. `npm run gen:types` puis committer les types régénérés.

## Les garde-fous CI

| Workflow | Déclencheur | Rôle |
|---|---|---|
| **`supabase-types.yml`** | push `main` touchant `types.ts` (hors migrations) | Régénère depuis la base et **échoue** si `types.ts` diverge. Attrape les régénérations Lovable qui effacent des tables. |
| **`migrate.yml`** (étape finale) | push `main` avec migrations | Après application des migrations, vérifie que `types.ts` correspond à la base (sinon on a oublié `npm run gen:types`). |
| **`typecheck.yml`** | toute PR + push `main` | Filet côté code : `tsc` casse si du code référence une table disparue. Zéro maintenance. |

Le contrôle de conformité base⇄types est fait par `scripts/check-supabase-types.mjs` : il
compare, au niveau **sémantique** (tables + colonnes, tolérant au formatage), les types générés
depuis la base et le fichier committé, et liste précisément ce qui manque / est en trop.

### Pourquoi pas de check base⇄types sur les PR ?

Une PR qui ajoute une migration référence une table **pas encore appliquée** à la base (elle le
sera au merge, par `migrate.yml`). Un check base⇄types y verrait un faux écart. Les PR sont donc
couvertes par le garde-fou **`tsc`** (`typecheck.yml`) ; la conformité base⇄types est vérifiée sur
`main`, **après** application des migrations.

## Bootstrap (une seule fois)

Le premier passage de `supabase-types.yml`/`migrate.yml` peut signaler un écart si le `types.ts`
committé (format Lovable) diffère du générateur officiel. Correction unique : `npm run gen:types`
puis committer — la base fait foi désormais.

## Limite connue

Le check couvre **tables + colonnes**. Les vues/fonctions/enums ne sont pas comparés finement
(rarement la cause d'incident). Le garde-fou `tsc` couvre tout ce que le code utilise réellement.
