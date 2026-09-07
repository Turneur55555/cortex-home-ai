# Brief Cowork — Déploiement feature fatigue + analyse + photos

## Contexte

Une PR est prête sur le repo `Turneur55555/cortex-home-ai`, branche `claude/custom-exercise-fatigue-debug-ds36qh`.

Elle corrige un bug critique (les exercices personnalisés ne contribuaient pas au calcul de fatigue musculaire) et ajoute deux nouvelles features.

## Ce que tu dois faire

### 1. Appliquer la migration Supabase

Projet : `bcwfvpwxzlmkxobvbtzp`

Ouvre le **SQL Editor** du dashboard Supabase et exécute le contenu du fichier suivant :

```
supabase/migrations/20260629000001_exercise_muscles_and_photos.sql
```

Ce script :
- Ajoute la colonne `muscle_groups text[]` à la table `exercises`
- Crée la table `user_exercise_illustrations` (photos d'exercices par utilisateur)
- Crée la table `workout_analyses` (analyses IA post-séance)

### 2. Déployer les deux nouvelles edge functions

Toujours sur le projet `bcwfvpwxzlmkxobvbtzp`, déploie via Supabase CLI ou le dashboard :

**Fonction 1 :**
```
supabase/functions/analyze-exercise-muscles/index.ts
```
Nom de la fonction : `analyze-exercise-muscles`

**Fonction 2 :**
```
supabase/functions/analyze-workout/index.ts
```
Nom de la fonction : `analyze-workout`

Les deux utilisent la variable d'environnement `GEMINI_API_KEY` (déjà configurée sur le projet).

### 3. Merger la branche dans main

Merge la PR de la branche `claude/custom-exercise-fatigue-debug-ds36qh` dans `main`.

---

## Ce que la feature fait (pour contexte)

### Bug corrigé
Les exercices créés manuellement (nom libre) ne matchaient aucun pattern regex → `exerciseToMuscles()` retournait `[]` → aucune fatigue enregistrée. Désormais, à la fin de chaque séance, les exercices non reconnus sont envoyés à Gemini qui identifie leurs muscles, et le résultat est stocké dans `exercises.muscle_groups`. Le calcul de récupération utilise ce champ en fallback.

### Nouvelles features
- **Analyse IA post-séance** : sheet qui s'ouvre automatiquement après "Clore la séance" — bilan, muscles travaillés, performances, récupération, conseil pour la prochaine séance.
- **Photos d'exercices** : bouton caméra 📷 sur chaque carte d'exercice → upload photo → persistée inter-séances via `user_exercise_illustrations`.

---

## Vérification rapide après déploiement

1. Créer un exercice personnalisé (ex: "Mon exercice dos") dans une séance
2. Terminer la séance → la sheet d'analyse IA doit s'ouvrir
3. Refaire une séance le lendemain → le MuscleMap doit montrer ce muscle en "fatigué" ou "en récup"
4. Sur n'importe quel exercice, taper l'icône 📷 → prendre une photo → elle doit s'afficher immédiatement et rester à la prochaine séance
