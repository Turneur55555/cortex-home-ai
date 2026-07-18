# Audit de détection des dérives Git ↔ Supabase

## Objectif

Détecter automatiquement et continuellement les incohérences d'état entre :
- Les migrations SQL commises dans Git (`supabase/migrations/`)
- Les migrations appliquées dans Supabase (schema_migrations)

## Types de dérives détectées

### 1. **REMOTE_ONLY** — Migration orpheline en base
Une migration est appliquée en Supabase **mais introuvable** dans Git.

**Causes possibles :**
- Migration créée via le CLI Supabase (ex. `supabase db pull-changes`)
- Édition directe de la base (ex. via la console Supabase)
- Suppression accidentelle de la migration du dépôt Git

**Risque:** 💥 **CRITIQUE**
- Impossible de reproduire l'état de la base localement
- Risque de divergence lors du déploiement
- Peut causer des conflits lors d'un `supabase db push`

**Correction:**
```bash
supabase migration repair --linked --status reverted <VERSION>
```

---

### 2. **DELETED_IN_GIT** — Migration supprimée en Git mais toujours appliquée
Une migration figure dans `schema_migrations` mais a été supprimée du dépôt.

**Causes possibles :**
- `git rm supabase/migrations/...` suivi de `git push` sans synchroniser Supabase
- Rebase qui retire une migration

**Risque:** 💥 **CRITIQUE**
- Impossible de rejouer l'historique du dépôt
- Incohérence du modèle de données
- Les nouveaux clones échoueront (migration manquante)

**Correction:**
- Restaurer la migration depuis Git : `git checkout <sha> -- supabase/migrations/...`
- Ou déclarer comme reverted en base : `supabase migration repair --status reverted <VERSION>`

---

### 3. **NOT_APPLIED** — Migration dans Git mais non appliquée
Une migration Git existe **mais n'a jamais été appliquée** en Supabase (status != "APPLIED").

**Causes possibles :**
- Migration créée localement mais push interrompu
- Migration ajoutée à une branche non mergée

**Risque:** ⚠️ **MOYEN**
- Normal pour les migrations en cours de développement
- Critique si une migration est oubliée sur main

**Correction:**
```bash
git push origin main  # Déclenche le workflow migrate.yml
```

---

## Système de détection

### Script : `scripts/audit-migration-drift.mjs`

```bash
# Exécution locale
node scripts/audit-migration-drift.mjs

# Via npm
npm run audit:drift
```

**Prérequis :**
- CLI Supabase installé (`supabase` accessible en PATH)
- Projet linké : `supabase link --project-ref bcwfvpwxzlmkxobvbtzp`
- Accès à Supabase (token + projet ref)

**Exit codes :**
- `0` : Aucune dérive — Git et Supabase synchronisés ✅
- `1` : Dérive(s) détectée(s) — Audit requis ❌
- `2` : Erreur de configuration/connectivité ⚠️

**Sortie :**
```
═══════════════════════════════════════════════════════════════
  Audit : Détection des dérives Git ↔ Supabase
═══════════════════════════════════════════════════════════════

📊 Comparaison : 164 migrations Git vs 164 versions en base

✅ Aucune dérive — Git et Supabase sont synchronisés
```

---

### Workflow : `.github/workflows/audit-migration-drift.yml`

**Déclenché automatiquement :**
1. **Quotidien** — 08:00 UTC (via cron)
2. **Push sur main** — Lors de modifications dans `supabase/migrations/`
3. **Manuel** — Via `workflow_dispatch` dans GitHub Actions

**Intégration au workflow migrate.yml :**
L'audit s'exécute **après chaque push de migrations** pour vérifier l'état post-migration :
```yaml
- name: Audit - Detect Git ↔ Supabase drift
  if: steps.push.outputs.success == 'true'
  run: node scripts/audit-migration-drift.mjs || true
```

---

## Flux de correction

### Cas 1 : Migration orpheline détectée

```
❌ CRITIQUE : 1 migration(s) orpheline(s) en base
   [20260515092345] Appliquée en Supabase, absente de Git (orpheline)
           → Correction : supabase migration repair --linked --status reverted 20260515092345
```

**Actions :**
1. **Enquête :** Vérifier comment cette migration s'est retrouvée en base
2. **Correction :**
   ```bash
   # Option A : Retirer de la base (orpheline reconnaissable)
   supabase migration repair --linked --status reverted 20260515092345
   
   # Option B : Restaurer dans Git et synchroniser
   # (si la migration a de la valeur)
   git log --all -- 'supabase/migrations/*20260515092345*'
   git checkout <SHA> -- supabase/migrations/20260515092345_*.sql
   npm run validate:supabase:fix
   git add supabase/migrations/
   git commit -m "fix: restore accidentally deleted migration"
   git push origin main
   ```

---

### Cas 2 : Migration supprimée dans Git mais toujours en base

```
❌ CRITIQUE : 1 migration(s) supprimée(s) en Git
   [20260514100000] Supprimée dans Git mais toujours APPLIED en base
           → Vérifier l'historique Git ou restaurer via supabase migration repair
```

**Actions :**
1. **Inspection :** `git log -p -- 'supabase/migrations/*20260514100000*'`
2. **Décision :**
   - Si migr. utile → restaurer depuis l'historique Git
   - Si migr. inutile → marquer comme reverted :
   ```bash
   supabase migration repair --linked --status reverted 20260514100000
   ```

---

### Cas 3 : Migration en local mais non appliquée

```
⚠️  ATTENTION : 2 migration(s) non appliquée(s)
   [20260518000000] État : PENDING (attendu : APPLIED)
           → Vérifier le statut : git log -1 supabase/migrations/*20260518000000*
```

**Actions :**
- Vérifier que la migration est committée et pushée :
  ```bash
  git log --oneline -- supabase/migrations/20260518000000*.sql
  git push origin main  # Redéclenche le workflow migrate.yml
  ```

---

## Intégration dans le pipeline CI/CD

### Before each migration push (`migrate.yml`)

```yaml
jobs:
  validate:
    # Valider l'idempotence des migrations
    
  migrate:
    # 1. Link au projet
    # 2. Réparer les orphelins
    # 3. Push les migrations
    # 4. Vérifier que types.ts correspond
    # 5. ✨ Audit drift (POST-MIGRATION)  ← NOUVEAU
```

### Daily audit (`audit-migration-drift.yml`)

```yaml
on:
  schedule:
    - cron: '0 8 * * *'  # 08:00 UTC tous les jours
  workflow_dispatch      # Manuel si besoin
  push:
    paths:
      - 'supabase/migrations/**'
```

---

## Checklist de sécurité

- [ ] Aucune migration orpheline en base
- [ ] Aucune migration supprimée en Git mais toujours appliquée
- [ ] Toutes les migrations Git sont appliquées (ou pending localement)
- [ ] Les types TypeScript sont synchronisés avec la base
- [ ] Le workflow `audit-migration-drift.yml` passe ✅

---

## Debug avancé

### Voir l'état exact de la base

```bash
supabase link --project-ref bcwfvpwxzlmkxobvbtzp
supabase migration list --linked --output json | jq .
```

**Champs clés :**
- `version` : identifiant de la migration (timestamp)
- `status` : `APPLIED`, `PENDING`, `REVERTED`, ou `REMOTE_ONLY`
- `timestamp` : date d'application

### Comparer manuellement

```bash
# Migrations en Git (ordonnées)
ls -1 supabase/migrations/*.sql | sed 's/.*\///' | sed 's/_.*//' | sort

# Migrations en base
supabase migration list --linked --output json | jq -r '.[] | .version' | sort

# Diff visuel
comm -23 <(ls...) <(supabase migration list...)
```

### Restaurer une migration supprimée

```bash
# Retrouver le commit où elle existait
git log -p --all -- 'supabase/migrations/*TIMESTAMP*' | head -200

# Restaurer
git show <SHA>:supabase/migrations/TIMESTAMP_name.sql > supabase/migrations/TIMESTAMP_name.sql

# Valider & push
npm run validate:supabase:fix
git add supabase/migrations/
git commit -m "fix: restore migration TIMESTAMP_name"
git push origin main
```

---

## Limitations connues

1. **Migrations supprimées très anciennes :** Peuvent ne pas apparaître dans `git log` si les refs ont été purgées
2. **Statut hors-ligne :** L'audit nécessite l'accès à Supabase (pas possible en offline)
3. **Drift détecté trop tard :** Si une migration orpheline existe depuis longtemps, elle n'est visible qu'au premier audit

---

## FAQ

**Q: Pourquoi Git n'est-il pas la source unique ?**
R: Git est la source de vérité pour le **code** des migrations. Mais en production, Supabase est la source de vérité pour l'**état appliqué**. L'audit synchronise les deux.

**Q: Peut-on automatiquement réparer les dérives ?**
R: Non. Réparer une dérive nécessite une décision métier (restaurer ? supprimer ?). L'audit détecte seulement et propose des corrections.

**Q: Que faire si l'audit passe en local mais échoue en CI ?**
R: Vérifier que les secrets GitHub sont valides (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`).

**Q: L'audit ralentit-il le workflow migrate ?**
R: Non, il est asynchrone et ne bloque pas le push.

---

## Ressources

- [Supabase CLI — migration list](https://supabase.com/docs/reference/cli/supabase-migration-list)
- [Supabase CLI — migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair)
- [schema_migrations table (Postgres)](https://www.postgresql.org/docs/current/sql-createtable.html)
