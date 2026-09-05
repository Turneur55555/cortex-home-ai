import { beforeEach, describe, expect, it } from "vitest";
import {
  SessionClosureConflictError,
  ongoingSessionClosure,
  resetSessionClosureLockForTests,
  runExclusiveSessionClosure,
} from "./sessionClosure";

/**
 * CHANTIER 9 (B1 / B2) — COURSES ENTRE « TERMINER » ET « ANNULER ».
 *
 * Avant ce chantier, la seule protection était `disabled={finish.isPending}`
 * sur UN bouton. Elle ne couvrait ni le second « Terminer » du menu de la
 * séance générique, ni le bouton « Annuler » du dialogue de confirmation.
 * Chaque scénario ci-dessous correspond à une manipulation réellement
 * possible à l'écran.
 */

beforeEach(() => {
  resetSessionClosureLockForTests();
});

/** Tâche qui reste en vol tant qu'on ne la débloque pas. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("runExclusiveSessionClosure", () => {
  it("laisse passer une clôture quand rien d'autre n'est engagé", async () => {
    await expect(runExclusiveSessionClosure("w1", "finish", async () => "terminé")).resolves.toBe(
      "terminé",
    );
  });

  it("SCÉNARIO RÉEL — « Terminer » puis « Annuler » : l'annulation est REFUSÉE, la clôture aboutit", async () => {
    const gate = deferred();
    const order: string[] = [];

    const finish = runExclusiveSessionClosure("w1", "finish", async () => {
      order.push("clôture: début");
      await gate.promise;
      order.push("clôture: fin");
    });

    // L'utilisateur ouvre le menu et confirme « Annuler » pendant que la
    // clôture est encore en vol : la cascade de suppression détruirait les
    // séries que la clôture est en train de déclarer au serveur.
    const cancel = runExclusiveSessionClosure("w1", "cancel", async () => {
      order.push("annulation: JAMAIS");
    });
    await expect(cancel).rejects.toBeInstanceOf(SessionClosureConflictError);

    gate.resolve();
    await finish;
    expect(order).toEqual(["clôture: début", "clôture: fin"]);
  });

  it("SCÉNARIO RÉEL — « Annuler » puis « Terminer » : la clôture est REFUSÉE, la séance est bien annulée", async () => {
    const gate = deferred();
    const cancel = runExclusiveSessionClosure("w1", "cancel", async () => {
      await gate.promise;
      return "annulée";
    });

    await expect(
      runExclusiveSessionClosure("w1", "finish", async () => "terminée"),
    ).rejects.toThrow("Annulation de la séance déjà en cours.");

    gate.resolve();
    await expect(cancel).resolves.toBe("annulée");
  });

  it("SCÉNARIO RÉEL — double tap sur « Terminer » : une seule clôture est engagée", async () => {
    const gate = deferred();
    let runs = 0;
    const first = runExclusiveSessionClosure("w1", "finish", async () => {
      runs++;
      await gate.promise;
    });
    const second = runExclusiveSessionClosure("w1", "finish", async () => {
      runs++;
    });

    await expect(second).rejects.toBeInstanceOf(SessionClosureConflictError);
    gate.resolve();
    await first;
    expect(runs).toBe(1);
  });

  it("le refus est SYNCHRONE dès le premier appel — pas de fenêtre entre deux tours de boucle", async () => {
    const gate = deferred();
    const first = runExclusiveSessionClosure("w1", "finish", async () => {
      await gate.promise;
    });
    // Aucun `await` entre les deux appels : le verrou doit déjà être posé.
    expect(ongoingSessionClosure("w1")).toBe("finish");
    const second = runExclusiveSessionClosure("w1", "cancel", async () => undefined);
    await expect(second).rejects.toBeInstanceOf(SessionClosureConflictError);
    gate.resolve();
    await first;
  });

  it("une clôture ABOUTIE interdit toute clôture ultérieure de la même séance", async () => {
    await runExclusiveSessionClosure("w1", "finish", async () => undefined);
    const late = runExclusiveSessionClosure("w1", "cancel", async () => undefined);
    await expect(late).rejects.toThrow("Cette séance est déjà terminée.");
  });

  it("une clôture ÉCHOUÉE reste réessayable — un échec réseau ne doit pas condamner la séance", async () => {
    await expect(
      runExclusiveSessionClosure("w1", "finish", async () => {
        throw new Error("Non authentifié");
      }),
    ).rejects.toThrow("Non authentifié");

    // Le verrou est libéré : l'utilisateur peut retaper « Terminer ».
    expect(ongoingSessionClosure("w1")).toBeNull();
    await expect(runExclusiveSessionClosure("w1", "finish", async () => "terminé")).resolves.toBe(
      "terminé",
    );
  });

  it("l'erreur de l'appelant est propagée telle quelle, jamais remplacée ni avalée", async () => {
    const original = new Error("Offline update: entité introuvable (workouts/w1)");
    await expect(
      runExclusiveSessionClosure("w1", "finish", async () => {
        throw original;
      }),
    ).rejects.toBe(original);
  });

  it("le verrou est PAR SÉANCE : clore une séance n'empêche jamais d'en clore une autre", async () => {
    const gate = deferred();
    const first = runExclusiveSessionClosure("w1", "finish", async () => {
      await gate.promise;
      return "w1";
    });
    await expect(runExclusiveSessionClosure("w2", "finish", async () => "w2")).resolves.toBe("w2");
    gate.resolve();
    await expect(first).resolves.toBe("w1");
  });

  it("la mémoire des clôtures abouties est bornée — elle ne grossit pas indéfiniment", async () => {
    // 64 entrées conservées : au-delà, la plus ancienne sort. Ce verrou protège
    // une fenêtre d'interface, pas l'historique d'une vie d'application.
    for (let i = 0; i < 70; i++) {
      await runExclusiveSessionClosure(`w${i}`, "finish", async () => undefined);
    }
    // La plus ancienne est sortie de la mémoire : elle redevient acceptable.
    await expect(runExclusiveSessionClosure("w0", "finish", async () => "ok")).resolves.toBe("ok");
    // La plus récente, elle, est toujours verrouillée.
    await expect(
      runExclusiveSessionClosure("w69", "finish", async () => "ok"),
    ).rejects.toBeInstanceOf(SessionClosureConflictError);
  });

  it("le message distingue la clôture en cours de la clôture déjà aboutie", async () => {
    const gate = deferred();
    const running = runExclusiveSessionClosure("w1", "cancel", async () => {
      await gate.promise;
    });
    await expect(runExclusiveSessionClosure("w1", "finish", async () => undefined)).rejects.toThrow(
      "Annulation de la séance déjà en cours.",
    );
    gate.resolve();
    await running;
    await expect(runExclusiveSessionClosure("w1", "finish", async () => undefined)).rejects.toThrow(
      "Cette séance a déjà été annulée.",
    );
  });
});
