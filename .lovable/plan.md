
# Audit du module Maison

## Constat

Le module Maison a déjà été partiellement démantelé lors de sessions précédentes : aucune route (`/maison`, `/stocks`, `/pieces`...), aucun composant `HomeXxx`, aucun onglet dans `BottomNav`. Seuls des vestiges backend + une chaîne de code d'import (TransferPanel) subsistent.

Note importante : le mot « Maison » apparaît aussi dans `src/lib/fitness/config.ts` et `strengthEngine.ts` comme **lieu d'entraînement** (`GYMS = ["Maison", "Keep Cool", ...]`). Ce **n'est pas** le module Maison → à conserver (appartient au module Séance, hors périmètre).

## Vestiges à supprimer

### 1. Backend Supabase
- Table `home_categories` (+ policies, grants, trigger)
- Table `home_subcategories` (+ policies, grants, trigger)
- Table `items` (24 colonnes — stocks/inventaire Maison ; catégories `alimentation`, `pharmacie`, `habits`, `menager`)
- Fonction `ensure_home_categories_for_me()`
- Seed correspondant dans `handle_new_user()` s'il subsiste (à vérifier — la version actuelle ne seed que `users_profiles`)

Sauvegarde SQL du schéma + dump CSV des 3 tables dans `/mnt/documents/maison-backup-<date>/` avant `DROP`.

### 2. Code frontend (feature Transfer = ingestion Maison)
Le seul consommateur restant des tables Maison côté client est la feature Transfer, qui écrit dans `items` depuis :
- `src/features/transfer/**` (tout le dossier)
- `src/routes/_authenticated/documents.tsx` — 3 usages de `TransferPanel`
- `src/components/profile/pdf/ResultCard.tsx` — usage `TransferPanel`
- `src/components/profile/pdf/DocCard.tsx` — usage `TransferPanel` + `parseDocAnalysis`
- `src/components/profile/pdf/helpers.ts` — import de `TransferTarget`

Plan : retirer les `TransferPanel` de ces composants (Documents affiche juste l'analyse OCR sans bouton « Ajouter au stock »), supprimer `src/features/transfer/` entier, nettoyer `helpers.ts`.

À vérifier avant suppression : que Documents/PDF conservent leur affichage d'analyse (texte, JSON) — seule la partie « transférer vers stocks » disparaît.

### 3. Nettoyage cosmétique
- `src/services/README.md` : ligne 40 mentionne `homeCategories.ts` (fichier déjà inexistant)
- `src/components/BarcodeScannerSheet.tsx` : commentaires "Maison/stocks module deleted" (déjà nettoyé fonctionnellement, on peut retirer les commentaires morts)
- `src/components/fitness/NutritionSheet.tsx` : idem
- `src/hooks/useMealPlan.ts` : idem
- `src/lib/health/exportData.ts` : retirer `"items"` de la liste des tables exportées

### 4. Régénération auto
- `src/integrations/supabase/types.ts` sera régénéré après migration (tables retirées)

## Fichiers concernés

**À supprimer (10 fichiers) :**
```
src/features/transfer/components/TransferPanel.tsx
src/features/transfer/hooks/useTransfer.ts
src/features/transfer/services/transferService.ts
src/features/transfer/types/index.ts
src/features/transfer/utils/detectContent.ts
```

**À modifier (~8 fichiers) :**
```
src/routes/_authenticated/documents.tsx        (retirer TransferPanel, imports)
src/components/profile/pdf/ResultCard.tsx      (retirer TransferPanel)
src/components/profile/pdf/DocCard.tsx         (retirer TransferPanel)
src/components/profile/pdf/helpers.ts          (retirer TransferTarget)
src/components/BarcodeScannerSheet.tsx         (nettoyer commentaires)
src/components/fitness/NutritionSheet.tsx      (nettoyer commentaires)
src/hooks/useMealPlan.ts                       (nettoyer commentaires)
src/lib/health/exportData.ts                   (retirer "items")
src/services/README.md                         (retirer ligne homeCategories)
```

**Migration Supabase (1 fichier) :**
```
supabase/migrations/<date>_drop_maison_module.sql
  DROP FUNCTION public.ensure_home_categories_for_me();
  DROP TABLE public.items CASCADE;
  DROP TABLE public.home_subcategories CASCADE;
  DROP TABLE public.home_categories CASCADE;
```

## Tables Supabase supprimées
- `home_categories`
- `home_subcategories`
- `items`

Aucune FK entrante depuis d'autres tables (à confirmer via `read_query` avant `DROP` — si une FK existe on utilisera `CASCADE` de façon contrôlée).

## Edge Functions
Aucune edge function n'est propre au module Maison (`chat` et `coach-workout` mentionnent « maison » comme contexte texte uniquement — pas de lecture des tables). Rien à supprimer.

## Ordre d'exécution

1. Backup SQL + CSV des 3 tables → `/mnt/documents/maison-backup-<date>/`
2. Modifier le code frontend (retirer TransferPanel + imports, nettoyer commentaires)
3. Vérifier build + typecheck sur le code frontend seul
4. Créer la migration `DROP TABLE`
5. Après approbation & exécution de la migration, `types.ts` est régénéré
6. Dernier build/typecheck de contrôle

## Contraintes respectées

- **Aucun commit / merge** ne sera poussé — j'attends votre validation
- **Modules Séance, Nutrition, Progression, Dashboard, Auth, Profils, RPG** : aucun fichier touché
- **`fitness/config.ts` & `strengthEngine.ts`** : conservés tels quels (« Maison » = lieu d'entraînement, pas le module)
- **Historique entraînements/nutrition** : intact
- La feature Transfer alimentait exclusivement les tables Maison → suppression légitime

## Ce que je ferai ensuite (après votre GO)

Étape par étape avec `lint` / `typecheck` / `build` entre chaque, et rapport final listant : fichiers supprimés, fichiers modifiés, tables droppées, résultats des tests.

**Validez-vous ce plan ?**
