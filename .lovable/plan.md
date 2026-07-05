# Système RPG de progression par exercice

Je veux créer un système de progression entièrement nouveau pour iCortex, inspiré des meilleurs RPG et de la mythologie grecque.

L'objectif est de transformer chaque exercice en une véritable aventure où l'utilisateur progresse au fil des entraînements grâce à son travail, ses records et sa régularité.

Le système doit être premium, motivant, évolutif et devenir une fonctionnalité emblématique de l'application.

---

# Principe

Chaque exercice possède sa propre progression indépendante.

Exemples :

- Développé couché → Titan II

- Squat → Olympien I

- Tractions → Héros IV

- Curl incliné → Guerrier III

Chaque exercice possède :

- son niveau

- son XP

- ses records

- son historique

- ses statistiques

- ses badges

Aucune XP n'est partagée entre les exercices.

Chaque mouvement raconte sa propre histoire.

---

# Hiérarchie des rangs

Créer les rangs suivants.

## Mortel

I

II

III

IV

V

Couleurs :

Pierre - Gris

---

## Guerrier

I

II

III

IV

V

Couleurs :

Bronze

---

## Héros

I

II

III

IV

V

Couleurs :

Argent

---

## Titan

I

II

III

IV

V

Couleurs :

Rouge profond

---

## Olympien

I

II

III

IV

V

Couleurs :

Bleu électrique et Or

---

## Primordial

I

II

III

IV

V

Couleurs :

Noir cosmique

Violet

Blanc lumineux

Le rang Primordial représente le niveau ultime.

---

# Calcul de l'XP

L'XP doit récompenser la progression réelle.

Prendre en compte :

- augmentation du poids

- augmentation des répétitions

- augmentation du volume

- amélioration du 1RM estimé

- nouveaux records

- régularité des entraînements

- difficulté de l'exercice

- progression par rapport aux séances précédentes

Une séance identique rapporte très peu d'XP.

Le système doit empêcher tout "farm" d'XP.

---

# Difficulté des exercices

Chaque exercice possède un coefficient.

Exemple :

Isolation → ×1

Machines → ×1.1

Machines convergentes → ×1.2

Polyarticulaires → ×1.4

Tractions → ×1.6

Développé couché → ×1.6

Squat → ×1.8

Soulevé de terre → ×2

---

# Carte de progression

Chaque exercice affiche une carte premium contenant :

- Badge du rang

- Nom du rang

- Niveau

- Barre de progression animée

- Pourcentage

- XP actuelle

- XP restante

Sous la barre, afficher dynamiquement plusieurs objectifs permettant d'atteindre le niveau suivant.

Exemple :

Titan III

██████████░░░░░░ 68 %

Pour atteindre Titan IV :

• +2 répétitions à 135 kg

ou

• 137,5 kg × 8

ou

• Nouveau record de volume

L'utilisateur doit toujours savoir quoi faire pour progresser.

---

# Animations

Lors d'un passage de niveau :

- vibration

- barre qui se remplit

- halo lumineux

- particules

- animation du badge

- son discret

- pluie de confettis légère

Afficher :

"Félicitations !

Vous êtes devenu Olympien II"

L'animation doit durer environ deux secondes.

---

# Badges

Chaque rang possède :

- un emblème unique

- une bordure unique

- une palette de couleurs dédiée

- des effets lumineux

- une animation spécifique

L'inspiration doit venir de la mythologie grecque moderne.

Utiliser :

- couronnes de laurier

- colonnes antiques

- éclairs

- flammes

- ailes

- boucliers

- casques

- lances

- marbre

- bronze

- or

- obsidienne

Le rendu doit être digne d'un jeu AAA.

---

# Historique

Créer une timeline retraçant tous les niveaux obtenus pour chaque exercice.

Exemple :

Mortel III

↓

Guerrier II

↓

Héros V

↓

Titan III

↓

Olympien I

---

# Statistiques

Ajouter :

- exercice le plus avancé

- moyenne des niveaux

- XP totale

- niveaux gagnés

- progression hebdomadaire

- progression mensuelle

- nombre de records battus

- meilleur exercice

---

# Architecture technique

Créer un système entièrement configurable.

Chaque rang est défini dans une configuration contenant :

- nom

- couleur

- icône

- animation

- seuil d'XP

- effets visuels

Le calcul de l'XP doit être centralisé dans un service unique.

Aucune valeur ne doit être codée en dur.

Le système doit être facilement extensible.

---

# Expérience utilisateur

Je veux que cette fonctionnalité donne l'impression de jouer à un RPG.

À chaque séance, l'utilisateur doit avoir envie de :

- battre un record

- gagner de l'XP

- monter de niveau

- débloquer un nouveau badge

- faire progresser chacun de ses exercices

L'expérience doit être fluide, moderne, premium et extrêmement gratifiante.

Cette fonctionnalité doit devenir l'un des éléments les plus différenciants d'iCortex.