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
| **`supabase-types.yml`** | PR **et** push `main` touchant `types.ts` (hors migrations) | Régénère depuis la base et **échoue** si `types.ts` diverge. Sur PR, c'est un check bloquant (statut requis) : aucune édition manuelle ou régénération erronée de `types.ts` ne peut atteindre `main` sans être détectée. Attrape aussi les régénérations Lovable qui effacent des tables. |
| **`migrate.yml`** (étape finale) | push `main` avec migrations | Après application des migrations, vérifie que `types.ts` correspond à la base (sinon on a oublié `npm run gen:types`). |
| **`typecheck.yml`** | toute PR + push `main` | Filet côté code : `tsc` casse si du code référence une table disparue. Zéro maintenance. |

Le contrôle de conformité base⇄types est fait par `scripts/check-supabase-types.mjs` : il
compare, au niveau **sémantique** (tables + colonnes, tolérant au formatage), les types générés
depuis la base et le fichier committé, et liste précisément ce qui manque / est en trop.

### Pourquoi pas de check base⇄types sur les PR qui touchent une migration ?

Une PR qui ajoute une migration référence une table **pas encore appliquée** à la base (elle le
sera au merge, par `migrate.yml`). Un check base⇄types y verrait un faux écart. Ce cas précis est
donc délégué au garde-fou **`tsc`** (`typecheck.yml`) et à la vérification `migrate.yml`,
**après** application des migrations sur `main`.

Pour toute PR qui touche `types.ts` **sans** toucher de migration (le cas d'une édition manuelle
ou d'une régénération incorrecte), `supabase-types.yml` tourne directement sur la PR et bloque le
merge en cas de dérive — voir « À activer côté GitHub » ci-dessous.

### À activer côté GitHub (une fois, manuellement)

Pour que ce check bloque *réellement* le merge, il faut le déclarer comme **status check requis**
sur `main` : Settings → Branches → Branch protection rule (`main`) → Require status checks to pass
→ cocher `types.ts conforme à la base` (job de `supabase-types.yml`) et `TypeScript (tsc)`
(`typecheck.yml`). Sans cette étape, le workflow tourne et échoue visiblement, mais GitHub autorise
tout de même le merge d'une PR rouge.

## Bootstrap (une seule fois)

Le premier passage de `supabase-types.yml`/`migrate.yml` peut signaler un écart si le `types.ts`
committé (format Lovable) diffère du générateur officiel. Correction unique : `npm run gen:types`
puis committer — la base fait foi désormais.

## Limite connue

Le check couvre **tables + colonnes**. Les vues/fonctions/enums ne sont pas comparés finement
(rarement la cause d'incident). Le garde-fou `tsc` couvre tout ce que le code utilise réellement.

## Lovable — pas de protection native de fichier

Lovable ne propose pas de mécanisme pour marquer un fichier comme protégé/exclu de sa génération.
Si Lovable régénère `types.ts` depuis sa propre compréhension du schéma (au lieu de la base réelle),
rien ne l'empêche de le pousser directement sur `main`. La protection ne peut donc pas venir de
Lovable lui-même : elle vient entièrement des garde-fous après coup (`supabase-types.yml` bloquant
sur PR, vérification post-push sur `main`, `.gitattributes` marquant le fichier `linguist-generated`
pour signaler visuellement dans les diffs GitHub que ce n'est pas un fichier à relire/éditer).
Si Lovable introduit un jour un mécanisme de fichiers protégés/exclus, l'activer sur ce fichier
en complément (pas en remplacement) des garde-fous CI existants.
