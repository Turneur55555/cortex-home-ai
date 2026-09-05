/**
 * CHANTIER 9 (B1 / B2) — UNE SEULE OPÉRATION DE CLÔTURE PAR SÉANCE.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB), conformément à
 * `/src/lib` : ce module ne sait pas ce qu'est une séance, il sérialise des
 * tâches par identifiant et refuse la seconde.
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * « Terminer » et « Annuler » sont DEUX clôtures concurrentes de la même
 * séance, et elles écrivent aux mêmes endroits :
 * - `useFinishWorkout` lit le store local, calcule ses dépendances de
 *   synchronisation, puis écrit `status='completed'` et resynchronise les
 *   colonnes résumé des exercices ;
 * - `useCancelWorkout` supprime en cascade les séries, les exercices, les
 *   segments, PUIS la séance.
 *
 * Avant ce chantier, le seul garde-fou était VISUEL : `disabled={finish.isPending}`
 * sur le bouton « Terminer » du bandeau. Il ne couvrait ni le second
 * « Terminer » du menu (séance générique), ni le bouton « Annuler » de la
 * confirmation, ni le double tap sur ce dernier. Trois courses réelles en
 * découlaient :
 * 1. Terminer puis Annuler : la cascade de suppression s'exécute pendant que
 *    la clôture écrit → `workoutsRepo.update` lève « entité introuvable », ou
 *    pire, la clôture part quand même en file alors que ses enfants sont
 *    supprimés (le trigger serveur d'XP s'exécuterait alors sur une séance
 *    vidée).
 * 2. Annuler puis Terminer : l'inverse, avec la même conclusion.
 * 3. Deux clôtures identiques : deux passages dans la file pour la même
 *    séance, et deux écrans de récompense enchaînés.
 *
 * LE VERROU EST DONC INTERNE À LA MUTATION, pas à l'écran : quel que soit le
 * point d'entrée (bandeau, menu, dialogue de confirmation, futur raccourci),
 * il passe par `runExclusiveSessionClosure`.
 *
 * CE QUE CE MODULE NE FAIT PAS
 * ----------------------------
 * Il ne remplace RIEN du moteur offline : il ne touche ni à la file, ni à la
 * barrière de dépendances, ni à l'idempotence de la synchronisation. Il ferme
 * uniquement la fenêtre CLIENT pendant laquelle deux intentions
 * contradictoires peuvent être engagées.
 */

/** Les deux façons de clore une séance active. */
export type SessionClosureKind = "finish" | "cancel";

/**
 * Refus explicite d'une seconde clôture. C'est une VRAIE erreur, remontée à
 * l'appelant (`onError` → toast) : jamais un `catch` silencieux, jamais une
 * action utilisateur avalée sans trace.
 */
export class SessionClosureConflictError extends Error {
  readonly ongoing: SessionClosureKind;
  readonly alreadySettled: boolean;

  constructor(ongoing: SessionClosureKind, alreadySettled: boolean) {
    super(conflictMessage(ongoing, alreadySettled));
    this.name = "SessionClosureConflictError";
    this.ongoing = ongoing;
    this.alreadySettled = alreadySettled;
  }
}

function conflictMessage(ongoing: SessionClosureKind, alreadySettled: boolean): string {
  if (alreadySettled) {
    return ongoing === "finish"
      ? "Cette séance est déjà terminée."
      : "Cette séance a déjà été annulée.";
  }
  return ongoing === "finish"
    ? "Clôture de la séance déjà en cours."
    : "Annulation de la séance déjà en cours.";
}

/** Clôtures en vol, par séance. */
const inFlight = new Map<string, SessionClosureKind>();

/**
 * Clôtures déjà ABOUTIES, par séance. Une séance terminée (ou annulée) n'est
 * plus active : la reclore n'aurait aucun sens et rejouerait des écritures sur
 * une donnée qui n'existe plus sous cette forme.
 *
 * Mémoire volontairement BORNÉE (ordre d'insertion, la plus ancienne sort) :
 * ce verrou protège une fenêtre d'interface de quelques secondes, il n'a pas
 * vocation à mémoriser toutes les séances d'une vie d'application. Les vraies
 * garanties de non-duplication restent côté serveur (idempotence de la file,
 * garde `OLD.status IS DISTINCT FROM 'completed'` du trigger d'XP).
 */
const settled = new Map<string, SessionClosureKind>();
const SETTLED_MEMORY_LIMIT = 64;

function rememberSettled(workoutId: string, kind: SessionClosureKind): void {
  settled.delete(workoutId);
  settled.set(workoutId, kind);
  while (settled.size > SETTLED_MEMORY_LIMIT) {
    const oldest = settled.keys().next();
    if (oldest.done) break;
    settled.delete(oldest.value);
  }
}

/**
 * Exécute `task` seulement si AUCUNE autre clôture n'est engagée pour cette
 * séance — sinon lève `SessionClosureConflictError` SANS rien exécuter.
 *
 * Le refus est immédiat et non mis en file d'attente, et c'est le point
 * central : enchaîner une annulation derrière une clôture supprimerait la
 * séance que l'utilisateur vient de terminer. Une intention contradictoire
 * doit être REFUSÉE, jamais différée.
 *
 * L'inscription du verrou est faite AVANT le premier `await` : deux appels
 * émis dans le même tour de boucle (double tap, bandeau + menu) ne peuvent pas
 * passer tous les deux.
 *
 * Un ÉCHEC de `task` libère le verrou : une clôture qui a réellement échoué
 * (« Non authentifié », écriture locale impossible…) doit rester réessayable.
 * Seule une clôture ABOUTIE est définitive.
 */
export async function runExclusiveSessionClosure<T>(
  workoutId: string,
  kind: SessionClosureKind,
  task: () => Promise<T>,
): Promise<T> {
  const running = inFlight.get(workoutId);
  if (running) throw new SessionClosureConflictError(running, false);

  const done = settled.get(workoutId);
  if (done) throw new SessionClosureConflictError(done, true);

  inFlight.set(workoutId, kind);
  try {
    const result = await task();
    rememberSettled(workoutId, kind);
    return result;
  } finally {
    inFlight.delete(workoutId);
  }
}

/** Une clôture est-elle actuellement engagée pour cette séance ? */
export function ongoingSessionClosure(workoutId: string): SessionClosureKind | null {
  return inFlight.get(workoutId) ?? null;
}

/** Remet le verrou à zéro — réservé aux tests (aucun appelant applicatif). */
export function resetSessionClosureLockForTests(): void {
  inFlight.clear();
  settled.clear();
}
