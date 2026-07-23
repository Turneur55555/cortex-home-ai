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

**4ème incident (23/07/2026, commit `238a9db`, `gpt-engineer-app[bot]`) :** malgré le garde-fou
CI ci-dessous, `types.ts` a régressé vers une version antérieure à ~40 migrations (poussée
directement sur `main`, hors PR). Le check `supabase-types.yml` a bien **détecté** la dérive
(run échoué le jour même), mais comme le check ne faisait qu'échouer sans corriger, la régression
est restée en place sur `main` pendant des heures — 5 commits suivants ont continué à construire
par-dessus un `types.ts` cassé, sans qu'aucun humain ne remarque l'échec CI. Détection seule ≠
prévention quand le canal qui casse le fichier ne passe pas par une PR review. D'où le changement
de principe 3 ci-dessous (voir « Les garde-fous CI »).

## Les principes

1. **La base de données est la source de vérité unique.** `types.ts` est un **artefact généré**,
   jamais une source à éditer.
2. **Génération officielle uniquement.** Les types se produisent via la CLI Supabase
   (`supabase gen types typescript --project-id … --schema public`) — aucune extension manuelle.
3. **Bloquant sur PR, auto-corrigé sur push direct à `main`.** Une PR qui merge un `types.ts`
   divergent est bloquée (aucun commit automatique — c'est à l'auteur de régénérer). Un push
   direct sur `main` (Lovable / `gpt-engineer-app[bot]`, qui ne passe pas par une PR) qui laisse
   `types.ts` divergent est **corrigé automatiquement** par la CI, qui régénère depuis la base et
   committe (`ci: auto-corrige la dérive types.ts…`) — jamais l'inverse, la régénération vient
   toujours de la base réelle, jamais d'une copie locale. Voir le 4ème incident ci-dessus : un
   simple échec visible ne suffit pas à empêcher la régression de perdurer si personne ne
   l'ausculte avant le prochain commit.
4. **Détection immédiate.** Toute divergence (table/colonne manquante ou en trop) casse la CI
   de façon visible et traçable (sur PR) ou déclenche une correction tracée (sur push `main`).

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
| **`supabase-types.yml`** — job `check-pr` | PR vers `main` touchant `types.ts` | **Bloquant, aucun commit.** Échoue si `types.ts` diverge de la base ; à l'auteur de régénérer et re-pousser. |
| **`supabase-types.yml`** — job `fix-push` | push `main` touchant `types.ts` (hors migrations) | **Auto-corrige.** Régénère depuis la base et committe si `types.ts` divergeait — attrape les pushs directs (Lovable/`gpt-engineer-app[bot]`) qui ne passent jamais par une PR review. |
| **`migrate.yml`** (étape finale) | push `main` avec migrations | Après application des migrations, régénère `types.ts` depuis la base et committe si besoin (`npm run gen:types` oublié avant le push). |
| **`typecheck.yml`** | toute PR + push `main` | Filet côté code : `tsc` casse si du code référence une table disparue. Zéro maintenance. |

Le contrôle de conformité base⇄types est fait par `scripts/check-supabase-types.mjs` : il
compare, au niveau **sémantique** (tables + colonnes, tolérant au formatage), les types générés
depuis la base et le fichier committé, et liste précisément ce qui manque / est en trop.

### Pourquoi pas de check base⇄types sur les PR qui ajoutent une migration ?

Une PR qui ajoute une migration référence une table **pas encore appliquée** à la base (elle le
sera au merge, par `migrate.yml`). Un check base⇄types y verrait un faux écart : le job `check-pr`
de `supabase-types.yml` s'en retire automatiquement dans ce cas précis (diff `supabase/migrations/**`
entre la base de la PR et `HEAD`) ; ces PR restent couvertes par le garde-fou **`tsc`**
(`typecheck.yml`), et la conformité base⇄types est vérifiée sur `main` juste après application des
migrations, par `migrate.yml`.

### Pourquoi une PR est bloquante mais un push direct est auto-corrigé ?

Une PR passe par une review humaine (ou par Claude Code, qui lit le résultat du check avant de
merger) : un échec y est vu et actionnable avant que le code n'atteigne `main`. Un push direct
(Lovable/`gpt-engineer-app[bot]`) n'a pas cette étape — un simple échec CI y est une alarme que
personne ne regarde forcément (c'est exactement ce qui s'est passé le 23/07/2026, voir le 4ème
incident plus haut). Corriger automatiquement depuis la base, qui est par construction toujours
juste, ferme cette fenêtre de risque sans compromettre la garantie « la base fait foi ».

## Bootstrap (une seule fois)

Le premier passage de `supabase-types.yml`/`migrate.yml` peut signaler un écart si le `types.ts`
committé (format Lovable) diffère du générateur officiel. Correction unique : `npm run gen:types`
puis committer — la base fait foi désormais.

## Limite connue

Le check couvre **tables + colonnes**. Les vues/fonctions/enums ne sont pas comparés finement
(rarement la cause d'incident). Le garde-fou `tsc` couvre tout ce que le code utilise réellement.
