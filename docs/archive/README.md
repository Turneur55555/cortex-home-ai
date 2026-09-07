# Archives documentaires

Documents **datés et clos** : rapports d'audit ponctuels, briefs de déploiement, points
d'architecture d'une phase terminée. Ils décrivent l'état du projet **au jour où ils ont été
écrits** et ne sont plus tenus à jour — ils restent ici parce qu'ils expliquent des décisions que
le code porte encore, et parce qu'aucune trace du projet ne doit disparaître.

**Ne pas s'y fier pour l'état courant.** Les trois documents vivants sont :

| Document                               | Rôle                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| [`../../CLAUDE.md`](../../CLAUDE.md)   | conventions de travail (piliers RPG, direction artistique, workflow Git, stack) |
| [`../INVARIANTS.md`](../INVARIANTS.md) | les règles techniques à ne jamais casser, et ce qui les vérifie                 |
| [`../../MEMORY.md`](../../MEMORY.md)   | le journal des chantiers                                                        |

## Contenu

| Fichier                                           | Date        | Sujet                                                                                                                                    |
| ------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-07-05-cleanup-audit-report.md`              | 2026-07-05  | audit de nettoyage du code mort (frontend, npm, tables) — anciennement `CLEANUP_AUDIT_REPORT.md` à la racine                             |
| `2026-07-05-migration-audit-report.md`            | 2026-07-05  | audit et reconstruction des migrations Supabase manquantes — anciennement `MIGRATION_AUDIT_REPORT.md` à la racine                        |
| `2026-06-29-cowork-brief-deploiement-fatigue.md`  | ~2026-06-29 | brief de déploiement d'une branche depuis fusionnée (migration + edge functions fatigue/analyse/photos) — anciennement `COWORK_BRIEF.md` |
| `2026-05-14-point-architecture-module-fitness.md` | 2026-05-14  | point d'architecture sur la modularisation de `SeancesTab` — anciennement `point.md`                                                     |

Déplacés depuis la racine du dépôt le 2026-09-07 (AUD-15). **Aucun contenu n'a été modifié** : seuls
les chemins ont changé, et les renvois depuis `MEMORY.md` ont été mis à jour.

Les journaux de backfill (`../phase3-backfill-log.md`, `../phase4-backfill-generic-segments-log.md`)
restent en place : ils sont cités comme justification _vivante_ depuis le code
(`services/exerciseResolution.ts`, `hooks/useUserExercisePhotos.ts`).
