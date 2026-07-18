# Workflow : Régénération des types Supabase

## Situation

Tu as modifié le schéma Supabase (ajouté/modifié une table, colonne, etc.) et tu veux committer tes
changements en toute sécurité.

## Procédure

### 1. Écrire la migration Supabase

```bash
# Crée un fichier SQL avec un timestamp
supabase migration new add_my_table
# Produit : supabase/migrations/20260718123456_add_my_table.sql

# Édite le fichier avec ta DDL (CREATE TABLE, ALTER TABLE, etc.)
echo "CREATE TABLE my_table (id UUID PRIMARY KEY, name TEXT NOT NULL);" >> \
  supabase/migrations/20260718123456_add_my_table.sql
```

### 2. Régénérer les types

**Important** : tu dois avoir `SUPABASE_ACCESS_TOKEN` dans ton environnement.

```bash
npm run gen:types
# Génère `src/integrations/supabase/types.ts` depuis la base en ligne.
# Cela inclut la nouvelle table et ses colonnes.
```

Si tu vois une erreur, vérifie :
- `SUPABASE_ACCESS_TOKEN` est défini et valide
- La CLI Supabase est installée (`supabase --version`)

### 3. Tester localement

```bash
npm run typecheck
# Vérifie que ton code TypeScript utilise les types correctement.

npm run check:types
# Vérifie que types.ts correspond à la base (redondant si gen:types a marché,
# mais utile pour valdier avant un commit).
```

### 4. Committer migration + types

```bash
git add supabase/migrations/20260718123456_add_my_table.sql \
        src/integrations/supabase/types.ts
git commit -m "feat: add my_table to Supabase schema"
git push
```

## ⚠️ Pièges courants

### Pièges 1 : Oublier de régénérer les types

Si tu ajoutes une migration mais pas de types.ts correspondant :
- ✅ Le pre-commit local ne bloque rien (pas encore d'automatisation locale robuste).
- ✅ La PR passe (typecheck.yml ne tourne qu'en PR si migration + types.ts divergent).
- ❌ Le merge sur `main` échoue : `migrate.yml` détecte l'écart et bloque.

**Correction** : `npm run gen:types` puis committe les types.

### Piège 2 : Éditer types.ts à la main

**JAMAIS** édite `src/integrations/supabase/types.ts` manuellement.

Si un type est faux :
1. Modifie le schéma Supabase (la DDL de la migration, pas types.ts).
2. Régénère avec `npm run gen:types`.
3. Committe la migration + le types.ts généré.

### Piège 3 : Push sans token SUPABASE_ACCESS_TOKEN

Si tu es hors ligne ou sans token :
```bash
# ❌ Ça échoue :
npm run gen:types
# Error: SUPABASE_ACCESS_TOKEN not found
```

**Solution** : Obtiens un token sur https://app.supabase.com/account/tokens puis :
```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."
npm run gen:types
```

### Piège 4 : Confondre base locale (Supabase local) et base remote (production)

Le token `SUPABASE_ACCESS_TOKEN` pointe toujours sur la **base remote** (production Supabase).

Si tu veux tester une migration localement :
```bash
supabase start   # Lance une base locale
supabase db push # Applique les migrations à la base locale
npm run gen:types # ⚠️ Génère quand même depuis le remote (à cause du token)
```

Pour tester types.ts localement, tu dois générer depuis la base locale (complexe). Alternative :
pousse la PR et laisse `typecheck.yml` vérifier en CI.

---

## Commandes rapides

| Besoin | Commande |
|--------|----------|
| Nouvelle migration | `supabase migration new <nom>` |
| Régénérer types | `npm run gen:types` |
| Vérifier conformité | `npm run check:types` |
| Vérifier code TypeScript | `npm run typecheck` |

---

## Références

- Architecture complète : `docs/architecture/supabase-types-source-of-truth.md`
- Audit des garde-fous : `docs/architecture/audit-supabase-types-generation.md`
- Types Supabase générés : `src/integrations/supabase/types.ts` (lisible, généré)
- Migration Supabase : `supabase/migrations/*.sql`

