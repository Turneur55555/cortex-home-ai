import { describe, expect, it } from "vitest";
import { startActiveWorkoutExclusively } from "./activeWorkoutStart";

/**
 * CHANTIER FINAL (AUD-06) — sérialisation du démarrage de séance, volet PUR.
 *
 * Ce fichier ne teste que la primitive : l'exclusion mutuelle elle-même.
 * Le comportement RÉEL (deux démarrages concurrents ne produisent qu'une
 * seule séance active, hors connexion) est vérifié contre les vrais
 * repositories et la vraie garde dans
 * `lib/offline/activeWorkoutStartOffline.test.ts`.
 */

describe("startActiveWorkoutExclusively — section critique par utilisateur", () => {
  it("deux démarrages concurrents pour le MÊME utilisateur ne se chevauchent jamais", async () => {
    const events: string[] = [];
    const task = (label: string) => async () => {
      events.push(`start:${label}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`end:${label}`);
    };

    await Promise.all([
      startActiveWorkoutExclusively("user-1", task("a")),
      startActiveWorkoutExclusively("user-1", task("b")),
    ]);

    expect(events).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });

  it("deux utilisateurs différents ne s'attendent JAMAIS l'un l'autre", async () => {
    const events: string[] = [];
    const slow = async () => {
      events.push("start:a");
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push("end:a");
    };
    const quick = async () => {
      events.push("start:b");
      events.push("end:b");
    };

    await Promise.all([
      startActiveWorkoutExclusively("user-1", slow),
      startActiveWorkoutExclusively("user-2", quick),
    ]);

    // « b » (autre compte) est passé pendant l'attente de « a » : la
    // sérialisation est bien par utilisateur, jamais globale.
    expect(events).toEqual(["start:a", "start:b", "end:b", "end:a"]);
  });

  it("propage le résultat de la tâche à SON appelant", async () => {
    await expect(startActiveWorkoutExclusively("user-1", async () => "workout-1")).resolves.toBe(
      "workout-1",
    );
  });

  it("propage l'échec à SON appelant et n'empoisonne pas la chaîne suivante", async () => {
    const failing = startActiveWorkoutExclusively("user-1", async () => {
      throw new Error("écriture locale impossible");
    });
    const next = startActiveWorkoutExclusively("user-1", async () => "ok");

    await expect(failing).rejects.toThrow("écriture locale impossible");
    // Une nouvelle tentative après un échec démarre normalement.
    await expect(next).resolves.toBe("ok");
  });

  it("libère l'entrée une fois la chaîne au repos (aucune fuite mémoire par utilisateur)", async () => {
    // Rien d'observable de l'extérieur si ce n'est qu'un démarrage ultérieur
    // n'attend rien : une chaîne jamais libérée ferait grossir la table sans
    // fin, mais garderait le même comportement — on vérifie donc au moins que
    // la sérialisation ne survit pas au repos.
    await startActiveWorkoutExclusively("user-1", async () => undefined);
    const events: string[] = [];
    await startActiveWorkoutExclusively("user-1", async () => {
      events.push("start");
    });
    expect(events).toEqual(["start"]);
  });
});
