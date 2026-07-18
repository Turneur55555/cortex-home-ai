# Audit : Supabase Types Generation (2026-07-18)

## Résumé exécutif

L'objectif de garantir que `types.ts` **ne dérive jamais** est partiellement atteint. Les garde-fous
CI existent et efficaces **sur `main`**, mais trois **failles critiques** permettent un drift local
ou en PR avant merge.

**Risque résiduel** : un développeur peut créer une migration et la pousser sans jamais régénérer
les types — la divergence ne sera visible que **après le merge**, quand `migrate.yml` applique la
migration et découvre l'écart.

---

## État des garde-fous actuels

| Garde-fou | Localisation | État | Couverture | Faille |
|-----------|--------------|------|-----------|--------|
| **Prévention suppression/renommage migrations** | `.husky/pre-commit` | ✅ OK | Empêche les modifications orphelines locales | N/A |
| **Validation statique migrations** | `.husky/pre-commit` + `migrate.yml` | ✅ OK | Idempotency, fonction `touch_updated_at`, etc. | N/A |
| **Typecheck TypeScript** | `typecheck.yml` + pre-commit | ✅ OK | Détecte si du code référence une table disparue | Zéro couverture : ne détecte pas **l'absence** d'une table. |
| **Vérification base⇄types (main only)** | `supabase-types.yml` | ✅ OK | Détecte drift après push on `types.ts` sans migrations | ❌ **Ne s'exécute jamais sur PR** → une migration peut être mergée sans vérification types. |
| **Vérification base⇄types post-migration** | `migrate.yml` (étape 4b) | ⚠️ FRAGILE | Échoue si types.ts ne correspond pas après push migration | ❌ **Condition** : `if: steps.push.outputs.success == 'true'`. Si push échoue, le check ne tourne pas → on peut avoir une base inconsistante et ignorer l'erreur. |
| **Script de vérification** | `scripts/check-supabase-types.mjs` | ⚠️ NON TESTÉ | Détection sémantique tables + colonnes | ❌ Zéro couverture de test — critère impossible à valider. |

---

## Trois failles critiques

### 1️⃣ Aucun hook pre-commit pour `types.ts` après migrations

**Scénario de drift** :
```bash
# Dev ajoute une migration
echo "CREATE TABLE new_table (id uuid PRIMARY KEY);" > supabase/migrations/20260718_new.sql

# Dev committe migration + types.ts (inchangé)
git add supabase/migrations/ types.ts
git commit -m "feat: add new_table"

# Le types.ts n'a jamais été régénéré — le hash diff le révèlerait mais rien n'exige
# une régénération.
```

**Conséquence** :
- La migration passe le pre-commit (pas de validation types vs. migrations).
- Elle passe `typecheck.yml` sur la PR (types.ts complet au moment de la PR).
- Elle passe `migrate.yml` sur `main`… **jusqu'à l'étape 4b**, qui échoue avec un message peu
  explicite.
- Pendant ce temps, la base contient la table mais `types.ts` ne la connaît pas — risque de
  confusion sur `main` pendant quelques minutes.

**Correction manquante** : Le pre-commit devrait détecter quand une migration est modifiée et
exiger une régénération de types.ts **avant** le commit.

---

### 2️⃣ Vérification base⇄types ne s'exécute **jamais** sur PR

**Scénario** :
```yaml
# PR ajoute une migration et type.ts
# supabase-types.yml a une condition : "push branches: [main]"
# → sur une PR, aucun check base⇄types.

# Conséquence : une PR peut merger avec une migration et un types.ts divergent
# (par ex. types.ts oublie une colonne).
```

**Couverture actuelle** :
- `typecheck.yml` couvre les PR **au niveau du code** : si du code référence la colonne, il
  échoue.
- Mais si la **migration ajoute une colonne** et que **types.ts oublie cette colonne**, et que
  **aucun code ne la référence**, l'erreur passe inaperçue en PR.

**Correction manquante** : Ajouter un check base⇄types **prédictif** en PR qui simule la base
post-migration et vérifie que types.ts serait valide.

---

### 3️⃣ Check post-migration ne s'exécute que si push réussit

**Scénario** :
```bash
# migrate.yml étape 3 (Push) échoue — tentatives épuisées, job échoue.
# Étape 4b (Check types.ts) ne s'exécute JAMAIS (condition: steps.push.outputs.success == 'true')

# Conséquence :
# - La migration n'a pas été appliquée à la base.
# - Mais types.ts a peut-être été modifié en amont (committé avec la migration).
# - On reste dans un état inconsistent.
```

**Correction manquante** : Le check types.ts devrait s'exécuter **même** si le push échoue,
pour s'assurer qu'au moment du merge, la base et types.ts sont en sync (une fois le push réessayé
manuellement).

---

## Vérifications à ajouter

### V1. Hook pre-commit : Détection de régénération manquée

**Objectif** : Empêcher un commit qui modifie une migration mais ne régénère pas types.ts.

**Implémentation** :
```bash
# .husky/pre-commit (ajouter avant la fin du script)

# Détecte si des migrations changent mais types.ts n'est pas régénéré
if git diff --cached --name-only | grep -q "supabase/migrations/"; then
  # Des migrations changent → types.ts doit changer aussi (typiquement).
  # Heuristique : générer depuis la base (si accessible) et comparer.
  if command -v supabase >/dev/null 2>&1; then
    FRESH=$(supabase gen types typescript --project-id ... 2>/dev/null || echo "")
    if [ -n "$FRESH" ]; then
      # Comparer le hash — s'il diffère, types.ts doit être régénéré.
      ...
    fi
  fi
fi
```

**Défi** : Générer depuis la base localement exige `SUPABASE_ACCESS_TOKEN` (pas toujours dispo).
Solution : heuristique basique en l'absence du token, ou skip local + vérification CI.

**Recommandation** : Implémenter dans CI (PR), pas en local (trop coûteux).

---

### V2. PR check : Vérification prédictive types.ts

**Objectif** : En PR, si une migration est ajoutée, vérifier que types.ts serait valide **après**
application (sans attendre le merge).

**Implémentation** :
```yaml
# .github/workflows/typecheck.yml
# Ajouter un job qui, en PR avec migration :
# 1. Génère les types "frais" (depuis le schéma+migration merged)
# 2. Compare avec le types.ts committé
# 3. Échoue si diverge
```

**Défi** : Générer les types exige une base (ou une simulation). Options :
- Lancer une base Supabase temporaire (coûteux, lent ~2 min).
- Parser les migrations pour construire un schéma prédit (fragile).
- Parser le types.ts existant et vérifier que les migrations y ajoutent uniquement des types
  connues (vérifie surtout les DELETE/MODIFY, pas les ADD).

**Recommandation** : Parser les migrations pour détecter les ADD/DROP/ALTER, puis comparer aux
types.ts. Optionnel : valider une base temporaire pour les DROP/MODIFY.

---

### V3. Post-migration check : Toujours exécuter

**Objectif** : S'assurer que types.ts ↔ base sont syncs **après** chaque migration, même en cas
de retry.

**Implémentation** :
```yaml
# migrate.yml
# Renommer l'étape 4b en "final-check" et la rendre **inconditionnelle**
# Ajouter un `continue-on-error: true` sur le push, de sorte que le check
# tourne même si le push échoue.
```

---

### V4. Test du script check-supabase-types.mjs

**Objectif** : Valider que le script détecte bien les dérives (tables manquantes, colonnes en trop).

**Implémentation** :
```javascript
// scripts/check-supabase-types.test.mjs

test('détecte une table manquante en types.ts', () => {
  const fresh = /* types généré avec table "foo" */;
  const committed = /* types.ts sans table "foo" */;
  const result = checkConformity(fresh, committed);
  assert(result.missingTables.includes('foo'));
});

// + cas : colonnes manquantes, colonnes en trop, tables en trop, zéro tables.
```

---

## Impact des corrections

| Correction | Local | PR | Main post-merge | Coût |
|------------|-------|----|----|------|
| V1: Hook pre-commit | ✅ Prévient | N/A | N/A | Bas (local seulement) |
| V2: PR check prédictif | N/A | ✅ Détecte | N/A | Moyen (requête Supabase ou parsing) |
| V3: Post-migration check inconditionnelle | N/A | N/A | ✅ Garantit | Très bas (existe déjà) |
| V4: Test du check script | ✅ Confiance | ✅ CI | ✅ CI | Bas (tests unitaires) |

---

## Priorités

1. **V4 (Test du check script)** — Priorité **CRITIQUE** : c'est le cœur de la conformité.
   Impossible de valider que le check fonctionne sans test.

2. **V3 (Post-migration check inconditionnelle)** — Priorité **HAUTE** : simple à implémenter,
   élimine un cas où on ignore un drift.

3. **V2 (PR check prédictif)** — Priorité **HAUTE** : prévient les merges de migrations
   divergentes en PR.

4. **V1 (Hook pre-commit)** — Priorité **MOYENNE** : utile mais coûteux localement. La CI
   rattrape la balle si oublié.

---

## Limitation acceptée

Le check couvre **tables + colonnes** seulement. Enums, vues, fonctions ne sont pas comparés
finement (rarement cause de drift). Si besoin : ajouter une passe supplémentaire en `check-supabase-types.mjs`.

---

## Références

- Stratégie complète : `docs/architecture/supabase-types-source-of-truth.md`
- Workflow CI : `.github/workflows/{supabase-types,migrate}.yml`
- Script de vérification : `scripts/check-supabase-types.mjs`
- Hook pre-commit : `.husky/pre-commit`

