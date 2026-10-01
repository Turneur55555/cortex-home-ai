import { describe, expect, it } from "vitest";
import { createExclusiveRunner } from "./exclusiveByKey";

/** Une promesse qu'on résout à la main, pour maîtriser l'ordre des événements. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createExclusiveRunner", () => {
  it("deux tâches de la même clé ne se chevauchent jamais", async () => {
    const run = createExclusiveRunner();
    const log: string[] = [];
    const gate = deferred();

    const first = run("u", async () => {
      log.push("1:début");
      await gate.promise;
      log.push("1:fin");
    });
    const second = run("u", async () => {
      log.push("2:début");
      log.push("2:fin");
    });

    // La seconde est lancée, mais ne démarre pas tant que la première n'a pas fini.
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(["1:début"]);

    gate.resolve();
    await Promise.all([first, second]);
    expect(log).toEqual(["1:début", "1:fin", "2:début", "2:fin"]);
  });

  it("la seconde tâche VOIT l'écriture de la première (lire-puis-écrire sans doublon)", async () => {
    const run = createExclusiveRunner();
    const rows: string[] = [];
    // Le motif exact qu'on veut protéger : lire, attendre, écrire seulement si absent.
    const createIfAbsent = (id: string) =>
      run("u", async () => {
        const exists = rows.includes(id);
        await Promise.resolve();
        if (!exists) rows.push(id);
      });

    await Promise.all([createIfAbsent("lundi"), createIfAbsent("lundi")]);
    expect(rows).toEqual(["lundi"]);
  });

  it("SANS exclusion, le même motif crée un doublon — la preuve que le défaut existe", async () => {
    const rows: string[] = [];
    const createIfAbsent = async (id: string) => {
      const exists = rows.includes(id);
      await Promise.resolve();
      if (!exists) rows.push(id);
    };
    await Promise.all([createIfAbsent("lundi"), createIfAbsent("lundi")]);
    expect(rows).toEqual(["lundi", "lundi"]);
  });

  it("des clés différentes ne s'attendent pas", async () => {
    const run = createExclusiveRunner();
    const gate = deferred();
    const log: string[] = [];

    const slow = run("a", async () => {
      await gate.promise;
      log.push("a");
    });
    await run("b", async () => {
      log.push("b");
    });

    expect(log).toEqual(["b"]); // b a fini alors que a est toujours bloquée
    gate.resolve();
    await slow;
    expect(log).toEqual(["b", "a"]);
  });

  it("un échec est rendu à son appelant sans empoisonner la file", async () => {
    const run = createExclusiveRunner();
    const failing = run("u", async () => {
      throw new Error("réseau coupé");
    });
    await expect(failing).rejects.toThrow("réseau coupé");

    await expect(run("u", async () => "ok")).resolves.toBe("ok");
  });

  it("l'échec d'une tâche ne se propage pas à la suivante, même lancée avant qu'il survienne", async () => {
    const run = createExclusiveRunner();
    const gate = deferred();
    const first = run("u", async () => {
      await gate.promise;
      throw new Error("boom");
    });
    const second = run("u", async () => "second");

    gate.resolve();
    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("second");
  });

  it("deux exécuteurs sont indépendants : une même clé n'y attend pas l'autre domaine", async () => {
    const planning = createExclusiveRunner();
    const seances = createExclusiveRunner();
    const gate = deferred();
    const log: string[] = [];

    const slowSession = seances("u", async () => {
      await gate.promise;
      log.push("séance");
    });
    await planning("u", async () => {
      log.push("planning");
    });

    expect(log).toEqual(["planning"]); // le planning n'a pas attendu la séance
    gate.resolve();
    await slowSession;
  });

  it("renvoie la valeur de la tâche", async () => {
    const run = createExclusiveRunner();
    await expect(run("u", async () => 42)).resolves.toBe(42);
  });
});
