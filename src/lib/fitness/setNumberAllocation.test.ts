import { describe, expect, it } from "vitest";
import { allocateSetNumber, nextSetNumber } from "./setNumberAllocation";

/**
 * CHANTIER 8 (A1, volet 3) — ATTRIBUTION DU `set_number`.
 *
 * Deux sources de collision, traitées séparément :
 * - MÊME contexte (double tap sur « + Série », restauration de la séance
 *   précédente) : deux créations concurrentes lisent le store AVANT que la
 *   première n'ait écrit, et calculent donc le MÊME numéro. C'est ce que
 *   `allocateSetNumber` empêche — sans aucun réseau.
 * - CONTEXTES DIFFÉRENTS (deux appareils) : impossible à prévenir côté client,
 *   traité à la synchronisation par le remappage du moteur
 *   (`uniqueSequenceRemap.ts` / `syncEngine.remapUniqueSequence`).
 */

describe("nextSetNumber", () => {
  it("prend le maximum existant + 1", () => {
    expect(nextSetNumber({ existing: [{ set_number: 1 }, { set_number: 3 }], fallback: 9 })).toBe(
      4,
    );
  });

  it("retombe sur le numéro proposé par l'appelant quand il n'existe aucune série", () => {
    expect(nextSetNumber({ existing: [], fallback: 1 })).toBe(1);
    expect(nextSetNumber({ existing: [], fallback: 4 })).toBe(4);
  });

  it("ne renvoie jamais moins de 1 (CHECK (set_number >= 1) côté base)", () => {
    expect(nextSetNumber({ existing: [], fallback: 0 })).toBe(1);
    expect(nextSetNumber({ existing: [], fallback: -3 })).toBe(1);
  });

  it("ignore les valeurs non exploitables plutôt que de produire NaN", () => {
    const existing = [
      { set_number: 2 },
      { set_number: Number.NaN },
      { set_number: undefined as unknown as number },
    ];
    expect(nextSetNumber({ existing, fallback: 1 })).toBe(3);
  });

  it("supporte une longue série sans dépasser la pile d'appels", () => {
    const existing = Array.from({ length: 200_000 }, (_, i) => ({ set_number: i + 1 }));
    expect(nextSetNumber({ existing, fallback: 1 })).toBe(200_001);
  });
});

describe("allocateSetNumber — réservation locale sérialisée", () => {
  it("deux créations concurrentes sur le MÊME exercice ne se chevauchent jamais", async () => {
    const events: string[] = [];
    const task = (label: string) => async () => {
      events.push(`start:${label}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`end:${label}`);
    };

    await Promise.all([allocateSetNumber("ex-1", task("a")), allocateSetNumber("ex-1", task("b"))]);

    expect(events).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });

  it("reproduit le double tap : le second lecteur voit bien l'écriture du premier", async () => {
    const store: number[] = [];
    // Chaque tâche fait exactement ce que fait `useAddExerciseSet` : LIRE le
    // store, puis (après un await) ÉCRIRE. Sans sérialisation, les deux lisent
    // un store vide et écrivent toutes les deux le numéro 1.
    const addSet = () =>
      allocateSetNumber("ex-1", async () => {
        const n = nextSetNumber({
          existing: store.map((set_number) => ({ set_number })),
          fallback: 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
        store.push(n);
        return n;
      });

    const [first, second] = await Promise.all([addSet(), addSet()]);

    expect([first, second]).toEqual([1, 2]);
    expect(store).toEqual([1, 2]);
  });

  it("n'introduit AUCUNE sérialisation entre exercices différents", async () => {
    const events: string[] = [];
    const task = (label: string) => async () => {
      events.push(`start:${label}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`end:${label}`);
    };

    await Promise.all([allocateSetNumber("ex-1", task("a")), allocateSetNumber("ex-2", task("b"))]);

    // Les deux démarrent avant que l'une ne se termine : le parallélisme entre
    // exercices est préservé.
    expect(events.slice(0, 2).sort()).toEqual(["start:a", "start:b"]);
  });

  it("une tâche en échec ne bloque pas les suivantes", async () => {
    const failing = allocateSetNumber("ex-1", async () => {
      throw new Error("création impossible");
    });
    await expect(failing).rejects.toThrow("création impossible");

    await expect(allocateSetNumber("ex-1", async () => "ok")).resolves.toBe("ok");
  });

  it("propage la valeur renvoyée par la tâche", async () => {
    await expect(allocateSetNumber("ex-1", async () => 42)).resolves.toBe(42);
  });
});
