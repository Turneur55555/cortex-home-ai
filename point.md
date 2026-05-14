# Point d'architecture — Fitness module
_Date : 2026-05-14 — Branche : `claude/reorder-nav-tabs-zoaLw`_

---

## 1. Ce qui a été fait : modularisation de SeancesTab

### Avant
`SeancesTab.tsx` était un fichier monolithique de **893 lignes** contenant la totalité
de la logique, des composants et des utilitaires du module Séances.

### Après
**SeancesTab.tsx → 132 lignes** (pure orchestration).

9 composants extraits dans `src/components/fitness/` :

| Fichier | Rôle | Lignes |
|---|---|---|
| `WorkoutCard.tsx` | Carte séance — exercices, swipe delete, photo, stats | 304 |
| `WorkoutSheet.tsx` | Formulaire nouvelle/refaire séance | 244 |
| `ExerciseStatsSheet.tsx` | Sheet stats par exercice (graphique poids/volume + PR) | 212 |
| `WorkoutProgressCharts.tsx` | Mini-graphiques top exercices | 91 |
| `SwipeableExerciseRow.tsx` | Ligne swipeable révélant le bouton delete | 68 |
| `EditableText.tsx` | Texte éditable inline avec icône crayon | 50 |
| `PhotoModal.tsx` | Modal photo exercice (voir / modifier / supprimer) | 46 |
| `WorkoutDeleteDialog.tsx` | Dialog de confirmation suppression séance | 40 |

2 utilitaires extraits dans `src/utils/fitness/` :

| Fichier | Contenu |
|---|---|
| `exercise-stats.ts` | `computePRs()`, `mockWeightHistory()` |
| `hashing.ts` | `simpleHash()` (déterministe, évite les re-renders aléatoires) |

`ExerciseStatsSheet.tsx` a été mis à jour pour importer `mockWeightHistory`
depuis `utils/` au lieu de le définir en double.

Les mutations Supabase (`useUpdateWorkoutName`, `useUpdateExercise`,
`useDeleteExercise`, `useAddExerciseToWorkout`) ont été ajoutées à
`src/hooks/use-fitness.ts`.

Aucun changement de comportement, aucun changement de design.

---

## 2. Audit architecture — état actuel

### Structure existante

```
src/
  lib/fitness/
    muscleMapping.ts    ← MuscleId type, MUSCLE_META, regex exercice→muscles
    recovery.ts         ← computeRecovery(), STATUS_COLORS, STATUS_LABELS
  hooks/
    use-fitness.ts      ← toutes les queries/mutations Supabase fitness
  utils/fitness/
    exercise-stats.ts   ← computePRs(), mockWeightHistory()
    hashing.ts          ← simpleHash()
  components/fitness/
    MuscleBodyMap.tsx   ← ancien rendu (JSON externe) — voir §3
    MuscleMap.tsx       ← nouveau rendu (SVG hardcodé) — voir §3
    muscles/
      front.tsx         ← SVG face (20+ paths, typé MuscleId)
      back.tsx          ← SVG dos (20+ paths, typé MuscleId)
    WorkoutCard.tsx
    WorkoutSheet.tsx
    ExerciseStatsSheet.tsx
    WorkoutProgressCharts.tsx
    EditableText.tsx
    SwipeableExerciseRow.tsx
    PhotoModal.tsx
    WorkoutDeleteDialog.tsx
  routes/_authenticated/fitness/
    SeancesTab.tsx      ← orchestration séances
    CorpsTab.tsx
    NutritionTab.tsx
    CoachSheet.tsx      ← IA coach + MUSCLE_OPTIONS (voir §2.2)
  data/
    bodymap-paths.json  ← silhouettes SVG, muscles: [] vide
```

### Points positifs

- `computeRecovery()` est une **fonction pure** dans `lib/` — zéro dépendance UI, testable
- `MuscleId` TypeScript type enforced aux boundaries composants (`front.tsx`, `back.tsx`)
- `muscleMapping.ts` centralise les regex exercice→muscles
- Zéro dépendance circulaire domaine ↔ UI
- Le module fitness est bien isolé du reste de l'app

### Couplages détectés

#### 🔴 Critiques

**RED-1 — Couleurs recovery définies en 3 endroits**

| Fichier | Constante | Format alpha |
|---|---|---|
| `lib/fitness/recovery.ts` | `STATUS_COLORS` | hex pur |
| `components/fitness/MuscleMap.tsx` | `FILL_COLORS` + `STROKE_COLORS` | `#RRGGBB33` |
| `components/fitness/MuscleBodyMap.tsx` | `STATE_COLORS` | `#rrggbb28` |

Changer le thème recovery = toucher 3 fichiers. Aucune source de vérité.

---

**RED-2 — `MUSCLE_ID_MAP` dans un composant UI**

`MuscleBodyMap.tsx` lignes 11–32 contient un tableau de 30 entrées
mappant les IDs SVG (`pec_l`, `quad_r`…) vers les `MuscleId` du domaine.
C'est un **adaptateur domaine** qui vit dans un composant UI.
Non importé depuis `muscleMapping.ts`. Silencieusement invalide si le JSON change.

---

**RED-3 — `MUSCLE_OPTIONS` dupliqué et divergent dans CoachSheet**

```ts
// CoachSheet.tsx
export const MUSCLE_OPTIONS = [
  { id: "pectoraux", label: "Pectoraux" },
  { id: "jambes",    label: "Jambes" },   // ← absent de muscleMapping.ts
  { id: "cardio",    label: "Cardio" },   // ← non-entraînable dans le domaine
];
```

La liste UI diverge du domaine. L'IA peut générer un plan avec des slugs
(`"jambes"`, `"cardio"`) que `computeRecovery()` ne connaît pas.

---

**RED-4 — Trois systèmes de nommage en parallèle**

| Système | Exemples | Fichiers |
|---|---|---|
| `MuscleId` — français canonique | `"pectoraux"`, `"quadriceps"` | `muscleMapping.ts`, `front.tsx`, `back.tsx` |
| IDs SVG — anglais abrégé | `"pec_l"`, `"quad_r"`, `"delt_fl"` | `bodymap-paths.json`, `MuscleBodyMap.tsx` |
| Liste UI mixte | `"jambes"`, `"cardio"`, `"fessiers"` | `CoachSheet.tsx` |

Un slug peut traverser toutes les couches sans erreur TS et ne jamais matcher.

#### 🟡 Importants

**AMBER-1 — `fmtHours()` dupliquée**
Même fonction dans `MuscleBodyMap.tsx` (ligne 240) et `MuscleMap.tsx` (ligne 155).
Non extraite dans `utils/fitness/formatting.ts`.

**AMBER-2 — Tableau `LEGEND` dupliqué**
Défini localement dans `MuscleBodyMap.tsx` et `MuscleMap.tsx` au lieu
d'être exporté depuis `recovery.ts`.

**AMBER-3 — Transformation workouts → domaine inline dans deux composants**
```ts
computeRecovery(
  workouts.map((w) => ({
    date: w.date,
    exercises: w.exercises?.map((ex) => ({ name: ex.name })) ?? null,
  }))
)
```
Ce mapping Supabase → domaine est copié dans `MuscleBodyMap` et `MuscleMap`.
Un hook `useRecoveryMap(workouts)` centraliserait ça.

---

## 3. MuscleBodyMap vs MuscleMap — verdict

### Différences structurelles

|  | `MuscleBodyMap.tsx` | `MuscleMap.tsx` |
|---|---|---|
| Source SVG muscles | JSON externe (`bodymap-paths.json`) | `front.tsx` / `back.tsx` (statique) |
| Muscles dans la source | **`"muscles": []` — vide** | 20+ paths par vue |
| Type safety IDs | `string` + `as never` hack | `MuscleId` TypeScript |
| Mapping SVG→domaine | `MUSCLE_ID_MAP` (30 entrées, inline) | Pas nécessaire |
| Utilisé dans l'app | ✅ `SeancesTab.tsx` ligne 61 | ❌ Nulle part |
| Fonctionnel | ❌ **Non** | ✅ Oui |

### Constat critique

`bodymap-paths.json` a `"muscles": []` dans front et back.
Le fichier ne contient que les silhouettes — les paths musculaires
n'ont jamais été peuplés.

**Résultat en production aujourd'hui :**
`MuscleBodyMap` affiche une silhouette sans aucun muscle interactif.
Tout `MUSCLE_ID_MAP`, `getColors()`, `handleMuscle()` est du code mort —
`data.muscles.map(...)` itère sur un tableau vide.

`MuscleMap` est l'implémentation complète et fonctionnelle,
mais elle n'est câblée nulle part.

### Action à faire

Remplacer dans `SeancesTab.tsx` :
```tsx
// Avant
import { MuscleBodyMap } from "@/components/fitness/MuscleBodyMap";
// ...
<MuscleBodyMap />

// Après
import { MuscleMap } from "@/components/fitness/MuscleMap";
// ...
<MuscleMap />
```

Puis supprimer `MuscleBodyMap.tsx` et `bodymap-paths.json`.

---

## 4. Roadmap refactoring — par priorité

### Sprint 1 — Gains rapides, zéro régression (2–3h)

- [ ] **Brancher `MuscleMap`** dans `SeancesTab` + supprimer `MuscleBodyMap` et le JSON vide
- [ ] **Consolider les couleurs** — un seul `RECOVERY_COLORS` dans `recovery.ts`, importé partout
- [ ] **Extraire `fmtHours`** → `src/utils/fitness/formatting.ts`
- [ ] **Exporter LEGEND** depuis `recovery.ts`, supprimer les copies locales
- [ ] **Déplacer `MUSCLE_ID_MAP`** → `src/lib/fitness/bodyMapMapping.ts`
  _(peut être supprimé si MuscleBodyMap est supprimé)_

### Sprint 2 — Cohérence des slugs (3–4h)

- [ ] **Corriger `MUSCLE_OPTIONS`** dans `CoachSheet` — dériver depuis `muscleMapping.ts`
- [ ] **Décider du statut de `"jambes"` et `"cardio"`** : alias de groupe ou ajout au domaine ?
- [ ] **Créer `useRecoveryMap(workouts)`** — centraliser la transformation Supabase → domaine

### Sprint 3 — Architecture cible (4–6h)

- [ ] **Façade domaine** `src/lib/fitness/index.ts` — un seul point d'entrée
- [ ] **Couche `/mapping`** si d'autres renderers SVG sont envisagés

### Architecture cible

```
src/
  lib/fitness/           ← domaine pur (zéro import React)
    muscleMapping.ts     ← MuscleId, MUSCLE_META, exercice→muscles
    recovery.ts          ← calculs + RECOVERY_COLORS (source unique)
    index.ts             ← façade

  hooks/
    use-fitness.ts       ← queries/mutations Supabase
    useRecoveryMap.ts    ← transformation workouts → Map<MuscleId, Recovery>

  utils/fitness/
    formatting.ts        ← fmtHours, formatWeight, etc.
    exercise-stats.ts    ← computePRs, mockWeightHistory
    hashing.ts

  components/fitness/
    MuscleMap.tsx        ← seule implémentation canonique
    muscles/
      front.tsx
      back.tsx
    WorkoutCard.tsx
    WorkoutSheet.tsx
    ExerciseStatsSheet.tsx
    WorkoutProgressCharts.tsx
    EditableText.tsx
    SwipeableExerciseRow.tsx
    PhotoModal.tsx
    WorkoutDeleteDialog.tsx
```

---

## 5. Score global

| Dimension | Score | Justification |
|---|---|---|
| Domaine pur (`lib/`) | 🟢 | `recovery.ts` et `muscleMapping.ts` propres, zéro import React |
| Boundary domaine ↔ UI | 🟡 | Couleurs fugent × 3, transformations dupliquées × 2 |
| Type safety | 🟢 | `MuscleId` enforced aux boundaries, pas de `any` dans les paths |
| DRY | 🔴 | Couleurs × 3, `fmtHours` × 2, `LEGEND` × 2, `MUSCLE_OPTIONS` dupliqué |
| Cohérence des slugs | 🔴 | 3 conventions simultanées (français / anglais abrégé / mixte UI) |
| Implémentation canonique | 🔴 | `MuscleBodyMap` en prod mais cassé, `MuscleMap` fonctionnel mais non câblé |

**Verdict global : 🟡 PARTIEL**
La fondation domaine est solide. Les problèmes sont de surface (duplication,
divergence de slugs, mauvais composant câblé) et corrigibles sans refactoring profond.
