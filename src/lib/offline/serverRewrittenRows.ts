/**
 * CHANTIER 3 — MAJ-02 : tables dont le SERVEUR peut avancer `updated_at`
 * APRÈS que le `RETURNING` de la mutation cliente a déjà été calculé.
 *
 * LE PROBLÈME, PRÉCISÉMENT (reproduit, cf. `dataIntegrityOffline.test.ts`)
 * ---------------------------------------------------------------------
 * `syncEngine.applyOperation` envoie ses `create`/`update` avec
 * `.upsert(...)/.update(...).select().single()`, c'est-à-dire un `RETURNING`.
 * PostgreSQL évalue `RETURNING` sur la ligne telle qu'elle sort des triggers
 * **BEFORE** ; les triggers **AFTER** de la même instruction s'exécutent
 * ENSUITE. Une ligne réécrite par un trigger AFTER renvoie donc au client un
 * `updated_at` déjà périmé au moment où il le reçoit.
 *
 * C'est exactement ce que fait `public.award_xp_on_workout_complete()`
 * (trigger `trg_award_xp_on_workout_complete`,
 * `AFTER INSERT OR UPDATE OF status ON public.workouts`, vérifié en direct
 * sur le projet `bcwfvpwxzlmkxobvbtzp` via `pg_trigger`/`pg_get_functiondef`) :
 *
 *     UPDATE public.workouts
 *       SET xp_before = ..., xp_after = ..., level_before = ..., level_after = ...
 *       WHERE id = NEW.id;
 *
 * Cet UPDATE imbriqué déclenche à son tour le trigger BEFORE
 * `trg_workouts_updated_at` (`public.set_updated_at()` → `NEW.updated_at = now()`).
 * Idem pour `public.reverse_xp_on_workout_uncomplete()`
 * (`trg_reverse_xp_on_workout_uncomplete`, `AFTER UPDATE OF status`) quand une
 * séance terminée redevient active.
 *
 * CONSÉQUENCE POUR LA SYNCHRONISATION
 * -----------------------------------
 * Le client mémorise `entity.serverUpdatedAt` = valeur du `RETURNING` (T1)
 * alors que la ligne persistée porte déjà T2. La modification locale
 * SUIVANTE part donc avec `baseUpdatedAt = T1`, `syncEngine` relit la ligne
 * (garde PGRST116), trouve T2 ≠ T1, et `detectConflict` lève un
 * `updated_at_mismatch` — alors que PERSONNE n'a modifié la séance ailleurs :
 * un faux conflit, qui bloque une opération parfaitement valide et impose un
 * arbitrage à l'utilisateur pour rien.
 *
 * LA CORRECTION RETENUE (la plus simple et la plus sûre)
 * -----------------------------------------------------
 * Relire la ligne côté serveur immédiatement après une mutation RÉUSSIE, et
 * utiliser CETTE valeur comme vérité (`syncEngine.readAuthoritativeRow`).
 * On ne touche à AUCUN trigger : les garanties d'intégrité RPG/nutrition
 * (idempotence, garde `OLD.status IS DISTINCT FROM 'completed'`, ledger
 * `xp_events`) restent strictement inchangées. La relecture rapporte en prime
 * les colonnes calculées par le trigger (`xp_before`/`xp_after`/`level_*`),
 * que le `RETURNING` ne pouvait pas contenir non plus.
 *
 * POURQUOI UNE LISTE EXPLICITE ET NON UNE RELECTURE SYSTÉMATIQUE
 * -------------------------------------------------------------
 * Une relecture après CHAQUE opération ajouterait un aller-retour réseau à
 * chaque ligne synchronisée — sur une séance, c'est une relecture par série
 * validée (`exercise_sets`), pour rien : aucune de ces tables n'est réécrite
 * par un trigger AFTER. Le coût est donc payé uniquement là où le problème
 * existe réellement.
 *
 * POURQUOI UNE CONSTANTE ET NON UN REGISTRE ALIMENTÉ PAR LE DOMAINE
 * ----------------------------------------------------------------
 * Un registre peuplé à l'import (façon `tableRegistry` de `repository.ts`)
 * dépendrait de l'ordre des imports : la file de synchronisation est
 * persistée dans IndexedDB et rejouée au démarrage par `useOfflineSync`,
 * potentiellement AVANT que le module du domaine concerné n'ait été chargé.
 * Une déclaration manquante rendrait silencieusement le bug. La liste est
 * donc statique, lue directement par le moteur, et documentée ici avec le
 * trigger exact qui la justifie.
 *
 * POUR AJOUTER UNE TABLE : ne l'ajouter QUE si un trigger AFTER (ou une
 * fonction appelée par lui) réécrit la ligne elle-même dans la même
 * instruction. Le cas « une table enfant réécrit sa ligne parente » (par ex.
 * `trg_recipe_ing_recompute` → `recompute_recipe_nutrition()` qui pose
 * `recipes.updated_at = now()` lors d'une écriture sur `recipe_ingredients`)
 * n'est PAS de cette famille : la ligne réécrite n'est pas celle de
 * l'opération, une relecture après coup ne la couvrirait pas. Voir
 * `docs/architecture/offline-data-integrity.md` pour l'analyse de ce cas et
 * la raison pour laquelle il se répare tout seul par l'hydratation.
 */
export const SERVER_REWRITTEN_TABLES: ReadonlySet<string> = new Set(["workouts"]);

/**
 * Vrai si le serveur peut avancer `updated_at` de cette table après le
 * `RETURNING` — le moteur relit alors la ligne pour connaître la valeur
 * réellement persistée.
 */
export function serverRewritesRowAfterReturning(table: string): boolean {
  return SERVER_REWRITTEN_TABLES.has(table);
}
